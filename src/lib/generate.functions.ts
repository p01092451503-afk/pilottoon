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

// NOTE (의도된 변경): 이 핸들러의 배치 처리는 Studio0103 Seedream V21.7 server.js 방식
// (순차 for-loop + variation 문구 + base64 참조 이미지 + rawResponses 누적)으로 전환됐다.
// seed 기반 병렬 호출/슬롯 시드, signed URL 참조 전달, request-id 추적은 제거되었다.

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
  /** 참조 이미지 역할 매핑 (charA/charB/pose/bg/style) */
  referenceRoles: z
    .array(z.object({ role: z.string(), path: z.string() }))
    .default([]),
  figureMap: z.array(z.any()).default([]),
  options: z.record(z.any()).default({}),
  batchCount: z.number().int().min(1).max(4).default(1),
  editImagePath: z.string().optional(),
  /** buildPrompt 가 반환한 경고 코드(WRN_002 등) */
  conflictWarnings: z.array(z.string()).default([]),
  /** 자유 메모 */
  userMemo: z.string().optional(),
  panelId: z.string().uuid().nullable().optional(),
});

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function mimeFromPath(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() ?? "png";
  return EXT_MIME[ext] ?? "image/png";
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

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
      if (!data.promptEdited) {
        const actionText = (data.options as Record<string, unknown>).actionText;
        if (typeof actionText === "string" && checkActionMissing(cleanPrompt, actionText)) {
          throw new Error("ACTION_TEXT_MISSING");
        }
      }
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
    const batchCount = Math.max(1, Math.min(4, data.batchCount ?? 1));
    const apiModel = process.env.ARK_ENDPOINT_ID ?? "unknown";

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
        seed: null,
        compiled_prompt: data.compiledPrompt ?? null,
        final_prompt: cleanPrompt,
        raw_prompt: data.rawPrompt
          ? data.rawPassthrough
            ? data.rawPrompt
            : sanitizePrompt(data.rawPrompt)
          : null,
        prompt_edited: data.promptEdited === true,
        options: { ...data.options, rawPassthrough: data.rawPassthrough },
        figure_map: data.figureMap,
        batch_count: batchCount,
        warnings: data.conflictWarnings,
        user_memo: data.userMemo ?? null,
        raw_responses: [],
        reference_files: [],
        panel_id: data.panelId ?? null,
      })
      .select("id")
      .single();
    if (genErr || !genRow) throw new Error(`DB_INSERT_GENERATION_FAILED: ${genErr?.message ?? ""}`);
    const generationId = genRow.id as string;

    if (data.panelId) {
      await supabase
        .from("panels")
        .update({ status: "generating", generation_id: generationId })
        .eq("id", data.panelId);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    try {
      // 4) 참조 이미지를 base64 dataURL 로 직접 전달 (signed URL 사용 안 함)
      const inputPaths = [...data.imagePaths];
      if (data.mode === "edit" && data.editImagePath) inputPaths.unshift(data.editImagePath);

      const roleByPath = new Map<string, string>();
      for (const r of data.referenceRoles) roleByPath.set(r.path, r.role);

      const downloaded = new Map<string, Uint8Array>();
      const images: string[] = [];
      for (const p of inputPaths) {
        const { data: blob, error: dErr } = await supabaseAdmin.storage
          .from("character-refs")
          .download(p);
        if (dErr || !blob) throw new Error(`REF_IMAGE_DOWNLOAD_FAILED: ${p} ${dErr?.message ?? ""}`);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        downloaded.set(p, bytes);
        const mime = blob.type || mimeFromPath(p);
        images.push(`data:${mime};base64,${toBase64(bytes)}`);
      }

      // 5) 순차 배치 호출 (V21.7 server.js 방식)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawResponses: any[] = [];
      const batchErrors: string[] = [];
      const referenceFiles: Array<{ figure: string; role: string; file: string; apiOrder: number }> = [];
      let savedCount = 0;

      for (let i = 0; i < batchCount; i++) {
        const prompt =
          i === 0
            ? cleanPrompt
            : `${cleanPrompt}\n\nGenerate variation ${i + 1}. Keep character identity and composition. Vary minor expression, lighting, and details.`;

        let arkResults: Array<{ url: string; width?: number; height?: number }> = [];
        try {
          const out = await callArk({ prompt, images, size });
          rawResponses.push(out.raw);
          arkResults = out.results;
          if (arkResults.length === 0) throw new Error("ARK_NO_IMAGE");
        } catch (e) {
          const detail = (e as { detail?: unknown }).detail;
          const msg = e instanceof Error ? e.message : String(e);
          rawResponses.push({ error: msg, detail: detail ?? null });
          batchErrors.push(`#${i + 1}: ${msg}${detail ? ` ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
          await supabaseAdmin
            .from("generations")
            .update({ raw_responses: rawResponses })
            .eq("id", generationId);
          continue;
        }

        // 최초 회차에서만 참조 이미지 스냅샷을 저장한다.
        if (i === 0 && inputPaths.length > 0) {
          for (let k = 0; k < inputPaths.length; k++) {
            const p = inputPaths[k]!;
            const role = roleByPath.get(p) ?? `ref${k + 1}`;
            const ext = p.split(".").pop()?.toLowerCase() ?? "png";
            const snapPath = `${tenantId}/${generationId}/refs/${role}.${ext}`;
            const bytes = downloaded.get(p);
            if (bytes) {
              const { error: snapErr } = await supabaseAdmin.storage
                .from("character-refs")
                .upload(snapPath, bytes, { contentType: mimeFromPath(p), upsert: true });
              if (snapErr) console.warn("REF_SNAPSHOT_FAILED", snapPath, snapErr.message);
            }
            referenceFiles.push({
              figure: role === "charA" ? "Figure 1" : role === "charB" ? "Figure 2" : "",
              role,
              file: snapPath,
              apiOrder: k + 1,
            });
          }
          await supabaseAdmin
            .from("generations")
            .update({ reference_files: referenceFiles })
            .eq("id", generationId);
        }

        // 6) 결과 저장 — 회차마다 즉시 저장해 진행률이 점진적으로 갱신되게 한다.
        const r = arkResults[0]!;
        const imgRes = await fetch(r.url);
        if (!imgRes.ok) {
          batchErrors.push(`#${i + 1}: FETCH_RESULT_FAILED ${imgRes.status}`);
          continue;
        }
        const bytes = new Uint8Array(await imgRes.arrayBuffer());
        const contentType = imgRes.headers.get("content-type") ?? "image/png";
        const ext = contentType.includes("jpeg") ? "jpg" : "png";
        const storagePath = `${tenantId}/${generationId}/${i}.${ext}`;

        const { error: upErr } = await supabaseAdmin.storage
          .from("generation-outputs")
          .upload(storagePath, bytes, { contentType, upsert: true });
        if (upErr) {
          batchErrors.push(`#${i + 1}: STORAGE_UPLOAD_FAILED ${upErr.message}`);
          continue;
        }

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

        const { error: resErr } = await supabaseAdmin.from("generation_results").insert({
          generation_id: generationId,
          seq: i,
          storage_path: storagePath,
          thumb_path: thumbPath,
          source_url: r.url,
          source_url_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          width: r.width ?? null,
          height: r.height ?? null,
          seed: null,
        });
        if (resErr) {
          batchErrors.push(`#${i + 1}: DB_INSERT_RESULT_FAILED ${resErr.message}`);
          continue;
        }
        savedCount += 1;

        await supabaseAdmin
          .from("generations")
          .update({ raw_responses: rawResponses })
          .eq("id", generationId);
      }

      // 7) 집계 및 마무리
      await supabaseAdmin.from("usage_events").insert({
        tenant_id: tenantId,
        user_id: userId,
        generation_id: generationId,
        image_count: savedCount,
        est_api_cost: savedCount * 0.03,
      });

      const failedAll = savedCount === 0;
      const errorMessage = batchErrors.length > 0 ? batchErrors.join(" | ").slice(0, 1000) : null;

      await supabaseAdmin
        .from("generations")
        .update({
          status: failedAll ? "error" : "done",
          error_message: errorMessage,
          raw_responses: rawResponses,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generationId);

      if (data.panelId) {
        if (failedAll) {
          await supabaseAdmin.from("panels").update({ status: "empty" }).eq("id", data.panelId);
        } else {
          const firstResultId =
            (
              await supabaseAdmin
                .from("generation_results")
                .select("id")
                .eq("generation_id", generationId)
                .order("seq")
                .limit(1)
                .maybeSingle()
            ).data?.id ?? null;
          const panelPatch: { status: string; chosen_result_id?: string | null } = { status: "done" };
          if (firstResultId) panelPatch.chosen_result_id = firstResultId;
          await supabaseAdmin.from("panels").update(panelPatch).eq("id", data.panelId);
        }
      }

      return {
        generationId,
        status: failedAll ? ("error" as const) : ("done" as const),
        errorMessage: failedAll ? errorMessage : null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("generations")
        .update({
          status: "error",
          error_message: message.slice(0, 1000),
          completed_at: new Date().toISOString(),
        })
        .eq("id", generationId);
      if (data.panelId) {
        await supabaseAdmin.from("panels").update({ status: "empty" }).eq("id", data.panelId);
      }
      return { generationId, status: "error" as const, errorMessage: message };
    }
  });
