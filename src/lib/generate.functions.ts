import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  sanitizePrompt,
  checkFigureN,
  checkActionMissing,
  validateFinalPrompt,
  resolveFigureRoleText,
  PROMPT_MAX_CHARS,
} from "@/lib/promptEngine";

const inputSchema = z.object({
  workLabel: z.string().default("W1"),
  mode: z.enum(["new", "edit"]).default("new"),
  aspectRatio: z.string().optional(),
  finalPrompt: z.string().min(1).max(PROMPT_MAX_CHARS),
  /** Auto-built prompt before user edits (for auditing). */
  rawPrompt: z.string().max(PROMPT_MAX_CHARS).optional(),
  /** True when the user manually edited the auto-generated prompt. */
  promptEdited: z.boolean().default(false),
  /** True when the user's prompt must be sent to Seedream (ARK) verbatim, with no cleanup or guards. */
  rawPassthrough: z.boolean().default(false),
  compiledPrompt: z.string().optional(),
  imagePaths: z.array(z.string()).default([]),
  figureMap: z.array(z.any()).default([]),
  options: z.record(z.any()).default({}),
  batchCount: z.number().int().min(1).max(4).default(1),
  editImagePath: z.string().optional(),
  seed: z.number().int().nullable().optional(),
  /** Explicit per-slot seeds. When provided, batchCount is derived from length. Used for lock-one/vary-rest. */
  seeds: z.array(z.number().int()).max(4).optional(),
  panelId: z.string().uuid().nullable().optional(),
});

export const generate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) tenant 확인
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (profErr || !profile?.tenant_id) {
      throw new Error("UNAUTHORIZED_NO_TENANT");
    }
    const tenantId = profile.tenant_id;

    // 2) 프롬프트 정리 및 가드
    // rawPassthrough=true 이면 사용자가 작성한 원문을 어떤 가공/검증도 없이 그대로 ARK 로 보낸다.
    let cleanPrompt: string;
    if (data.rawPassthrough) {
      cleanPrompt = data.finalPrompt;
    } else {
      cleanPrompt = sanitizePrompt(data.finalPrompt);
      const v = validateFinalPrompt(cleanPrompt);
      if (!v.ok) {
        throw new Error(v.detail ? `${v.code}: ${v.detail}` : v.code);
      }
      if (checkFigureN(cleanPrompt)) {
        throw new Error("FIGURE_N_NOT_REPLACED");
      }
      // 편집되지 않은 경우에만 원본 action 텍스트 포함 여부를 강제한다.
      if (!data.promptEdited) {
        const actionText = (data.options as Record<string, unknown>).actionText;
        if (typeof actionText === "string" && checkActionMissing(cleanPrompt, actionText)) {
          throw new Error("ACTION_TEXT_MISSING");
        }
      }
      // 5) 전송 직전 Character A/B 등 UI 라벨을 Figure 어휘로 정규화한다.
      const figures = (data.figureMap ?? []) as Array<{ figNo?: number } | undefined>;
      cleanPrompt = resolveFigureRoleText(
        cleanPrompt,
        figures[0] as never,
        figures[1] as never,
      );
    }


    // 3) generations row 생성
    const { aspectRatioToSize, callArk, makeThumbnailWebp } = await import("@/lib/generate.server");
    const size = aspectRatioToSize(data.aspectRatio);

    // Build per-slot seed list (explicit seeds win; else derive from batchCount)
    const slotSeeds: number[] = (() => {
      if (data.seeds && data.seeds.length > 0) return data.seeds.slice(0, 4);
      const n = Math.max(1, Math.min(4, data.batchCount ?? 1));
      const base = data.seed ?? Math.floor(Math.random() * 2_000_000_000);
      // If a single seed was passed and batch > 1, still fan out with derived distinct seeds
      // so each slot actually varies.
      if (n === 1) return [base];
      return Array.from({ length: n }, (_, i) =>
        i === 0 ? base : Math.floor(Math.random() * 2_000_000_000),
      );
    })();

    const seed = slotSeeds[0];
    const apiModel = process.env.ARK_ENDPOINT_ID ?? "unknown";
    // 요청 추적용 ID (요청 시점에 생성 → 실패해도 히스토리에 남는다)
    const clientRequestId = crypto.randomUUID();

    const { data: genRow, error: genErr } = await supabase
      .from("generations")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        work_label: data.workLabel,
        status: "running",
        mode: data.mode,
        aspect_ratio: data.aspectRatio ?? null,
        api_size: size,
        api_model: apiModel,
        seed,
        compiled_prompt: data.compiledPrompt ?? null,
        final_prompt: cleanPrompt,
        raw_prompt: data.rawPrompt ? (data.rawPassthrough ? data.rawPrompt : sanitizePrompt(data.rawPrompt)) : null,
        prompt_edited: data.promptEdited === true,
        options: { ...data.options, rawPassthrough: data.rawPassthrough, clientRequestId },
        figure_map: data.figureMap,
        batch_count: slotSeeds.length,
        panel_id: data.panelId ?? null,
      })
      .select("id")
      .single();
    if (genErr || !genRow) throw new Error(`DB_INSERT_GENERATION_FAILED: ${genErr?.message ?? ""}`);
    const generationId = genRow.id as string;

    if (data.panelId) {
      await supabase.from("panels").update({ status: "generating", generation_id: generationId }).eq("id", data.panelId);
    }

    try {
      // 4) character-refs 서명 URL 발급 (ARK가 fetch 가능한 공인 URL)
      //    옵션 inlineReferenceImages=true 이거나 서명 URL 발급이 실패하면 base64 인라인으로 대체한다.
      const inputPaths = [...data.imagePaths];
      if (data.mode === "edit" && data.editImagePath) inputPaths.unshift(data.editImagePath);
      const forceInline = (data.options as Record<string, unknown>).inlineReferenceImages === true;

      const toDataUrl = async (p: string): Promise<string> => {
        const { data: blob, error: dErr } = await supabase.storage.from("character-refs").download(p);
        if (dErr || !blob) throw new Error(`REF_IMAGE_DOWNLOAD_FAILED: ${p} ${dErr?.message ?? ""}`);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const mime = blob.type || "image/png";
        return `data:${mime};base64,${btoa(bin)}`;
      };

      const imageUrls: string[] = [];
      for (const p of inputPaths) {
        if (forceInline) {
          imageUrls.push(await toDataUrl(p));
          continue;
        }
        const { data: signed, error: sErr } = await supabase.storage
          .from("character-refs")
          .createSignedUrl(p, 300);
        if (sErr || !signed?.signedUrl) {
          // 서명 URL 실패 시 base64 인라인으로 폴백
          console.warn("SIGNED_URL_FAILED_FALLBACK_BASE64", p, sErr?.message ?? "");
          imageUrls.push(await toDataUrl(p));
          continue;
        }
        imageUrls.push(signed.signedUrl);
      }

      // 5) ARK 호출 — 슬롯별 seed 로 병렬 요청하여 실제 변형(variation) 결과를 얻는다.
      //    배치일 때는 슬롯별 variation 문구를 덧붙여 실제 변형 폭을 넓힌다.
      const VARIATION_HINTS = [
        "",
        " Variation 2: subtly different pose and camera framing, same character and style.",
        " Variation 3: alternative composition and gesture, same character and style.",
        " Variation 4: different angle and expression nuance, same character and style.",
      ];
      const promptForSlot = (i: number) =>
        slotSeeds.length > 1 && !data.rawPassthrough
          ? `${cleanPrompt}${VARIATION_HINTS[i] ?? ""}`
          : cleanPrompt;

      const arkPerSlot = await Promise.all(
        slotSeeds.map((s, i) =>
          callArk({
            prompt: promptForSlot(i),
            imageUrls,
            size,
            seed: s,
            sequentialMode: "auto",
            maxImages: 1,
          }).then((r) => r[0]),
        ),
      );


      // 공급자(ARK) 응답 ID 를 히스토리에서 확인할 수 있게 options 에 기록한다.
      const providerResponseIds = arkPerSlot
        .map((r) => r?.requestId ?? null)
        .filter((v): v is string => Boolean(v));
      if (providerResponseIds.length > 0) {
        await supabase
          .from("generations")
          .update({
            options: {
              ...data.options,
              rawPassthrough: data.rawPassthrough,
              clientRequestId,
              providerResponseIds,
            },
          })
          .eq("id", generationId);
      }

      // 7) 결과 이미지 저장
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const savedResults: Array<{
        seq: number;
        storage_path: string;
        thumb_path: string | null;
        source_url: string;
        width?: number;
        height?: number;
        seed: number;
      }> = [];

      for (let i = 0; i < arkPerSlot.length; i++) {
        const r = arkPerSlot[i];
        if (!r) continue;
        const imgRes = await fetch(r.url);
        if (!imgRes.ok) throw new Error(`FETCH_RESULT_FAILED: ${imgRes.status}`);
        const bytes = new Uint8Array(await imgRes.arrayBuffer());
        const contentType = imgRes.headers.get("content-type") ?? "image/png";
        const ext = contentType.includes("jpeg") ? "jpg" : "png";
        const storagePath = `${tenantId}/${generationId}/${i}.${ext}`;

        const { error: upErr } = await supabaseAdmin.storage
          .from("generation-outputs")
          .upload(storagePath, bytes, { contentType, upsert: true });
        if (upErr) throw new Error(`STORAGE_UPLOAD_FAILED: ${upErr.message}`);

        // 썸네일 (실패해도 원본 저장은 유지)
        let thumbPath: string | null = null;
        try {
          const thumbBytes = await makeThumbnailWebp(bytes);
          thumbPath = `${tenantId}/${generationId}/${i}_thumb.webp`;
          const { error: tErr } = await supabaseAdmin.storage
            .from("generation-outputs")
            .upload(thumbPath, thumbBytes, { contentType: "image/webp", upsert: true });
          if (tErr) {
            console.warn("THUMB_UPLOAD_FAILED", tErr.message);
            thumbPath = null;
          }
        } catch (e) {
          console.warn("THUMB_MAKE_FAILED", e instanceof Error ? e.message : String(e));
        }

        savedResults.push({
          seq: i,
          storage_path: storagePath,
          thumb_path: thumbPath,
          source_url: r.url,
          width: r.width,
          height: r.height,
          seed: slotSeeds[i],
        });
      }

      // 8) generation_results / usage_events / generations 업데이트
      if (savedResults.length > 0) {
        const { error: resErr } = await supabaseAdmin.from("generation_results").insert(
          savedResults.map((s) => ({
            generation_id: generationId,
            seq: s.seq,
            storage_path: s.storage_path,
            thumb_path: s.thumb_path,
            source_url: s.source_url,
            source_url_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            width: s.width ?? null,
            height: s.height ?? null,
            seed: s.seed,
          })),
        );
        if (resErr) throw new Error(`DB_INSERT_RESULTS_FAILED: ${resErr.message}`);
      }


      await supabaseAdmin.from("usage_events").insert({
        tenant_id: tenantId,
        user_id: userId,
        generation_id: generationId,
        image_count: savedResults.length,
        est_api_cost: savedResults.length * 0.03,
      });

      await supabaseAdmin
        .from("generations")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", generationId);

      if (data.panelId) {
        const firstResultId = savedResults.length > 0
          ? (await supabaseAdmin.from("generation_results").select("id").eq("generation_id", generationId).order("seq").limit(1).maybeSingle()).data?.id ?? null
          : null;
        const panelPatch: { status: string; chosen_result_id?: string | null } = { status: "done" };
        if (firstResultId) panelPatch.chosen_result_id = firstResultId;
        await supabaseAdmin.from("panels").update(panelPatch).eq("id", data.panelId);
      }

      return { generationId, status: "done" as const, errorMessage: null as string | null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 시크릿이 로그/응답에 흘러가지 않도록 message 만 저장
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const failedResponseId = /request_id=([^\s\]]+)/.exec(message)?.[1] ?? null;
      await supabaseAdmin
        .from("generations")
        .update({
          status: "error",
          error_message: message.slice(0, 1000),
          completed_at: new Date().toISOString(),
          options: {
            ...data.options,
            rawPassthrough: data.rawPassthrough,
            clientRequestId,
            providerResponseIds: failedResponseId ? [failedResponseId] : [],
          },
        })
        .eq("id", generationId);
      if (data.panelId) {
        await supabaseAdmin.from("panels").update({ status: "empty" }).eq("id", data.panelId);
      }
      // 콘텐츠 정책·레이트리밋 등 "사용자에게 안내하면 되는" 실패는 throw 하지 않고
      // 결과로 돌려준다. (throw 하면 서버 함수가 500 으로 떨어져 런타임 에러 화면이 뜬다)
      return { generationId, status: "error" as const, errorMessage: message };
    }
  });

