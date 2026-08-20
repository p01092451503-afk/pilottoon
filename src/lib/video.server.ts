// Server-only helpers for Seedance (BytePlus ARK) video generation.
// This file must NOT be imported from client code.

export type VideoTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type VideoTaskState = {
  status: VideoTaskStatus;
  videoUrl?: string;
  error?: string;
};

import { normalizeArkBaseUrl } from "@/lib/generate.server";

/** BytePlus ModelArk official pinned Seedance 2.0 model version. */
export const SEEDANCE_2_MODEL = "dreamina-seedance-2-0-260128";

function arkEnv() {
  const ARK_API_KEY = process.env.ARK_API_KEY;
  const ARK_BASE_URL = process.env.ARK_BASE_URL;
  const candidates = [
    process.env.ARK_VIDEO_ENDPOINT_ID,
    process.env.ARK_VIDEO_MODEL_ID,
    SEEDANCE_2_MODEL,
  ]
    .map((v) => (v ?? "").trim())
    .filter((v, i, arr) => v.length > 0 && arr.indexOf(v) === i);

  if (!ARK_API_KEY || !ARK_BASE_URL) {
    throw new Error("ARK 시크릿이 설정되지 않았습니다.");
  }
  return {
    key: ARK_API_KEY,
    // ARK_BASE_URL 은 이미지 전용 풀 엔드포인트 URL 일 수 있으므로 API 루트만 사용한다.
    base: normalizeArkBaseUrl(ARK_BASE_URL),
    candidates,
    model: candidates[0]!,
  };
}


export function buildSeedanceText(params: {
  prompt: string;
  aspectRatio?: string | null;
  resolution?: string | null;
  durationSeconds?: number | null;
  cameraFixed?: boolean;
  seed?: number | null;
  hasFirstFrame?: boolean;
}): string {
  // Seedance 2.0 takes generation controls as top-level JSON fields.
  return params.prompt.trim();
}

/** Seedance 비동기 작업을 생성하고 task id 를 반환한다. */
export async function createVideoTask(params: {
  text: string;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  referenceImageUrls?: string[];
  aspectRatio?: string | null;
  resolution?: string | null;
  durationSeconds?: number | null;
  generateAudio?: boolean;
}): Promise<{ taskId: string; model: string }> {
  const { key, base, candidates } = arkEnv();

  const frameUrls = new Set(
    [params.firstFrameUrl, params.lastFrameUrl].filter((url): url is string => Boolean(url)),
  );
  const distinctReferenceUrls = [...new Set(params.referenceImageUrls ?? [])].filter(
    (url) => !frameUrls.has(url),
  );
  const useFrameMode = Boolean(params.firstFrameUrl || params.lastFrameUrl);

  if (useFrameMode && distinctReferenceUrls.length > 0) {
    throw new Error(
      "SEEDANCE_REFERENCE_MODE_CONFLICT: First/last frames cannot be combined with reference media.",
    );
  }

  const content: Array<Record<string, unknown>> = [{ type: "text", text: params.text }];
  if (useFrameMode && params.firstFrameUrl) {
    content.push({
      type: "image_url",
      image_url: { url: params.firstFrameUrl },
      role: "first_frame",
    });
  }
  if (useFrameMode && params.lastFrameUrl) {
    content.push({
      type: "image_url",
      image_url: { url: params.lastFrameUrl },
      role: "last_frame",
    });
  }
  if (!useFrameMode) {
    for (const url of distinctReferenceUrls) {
      content.push({
        type: "image_url",
        image_url: { url },
        role: "reference_image",
      });
    }
  }

  const failures: string[] = [];

  for (const model of candidates) {
    const body = {
      model,
      content,
      ratio: useFrameMode ? "adaptive" : params.aspectRatio || "16:9",
      resolution: params.resolution || "720p",
      duration: params.durationSeconds || 10,
      generate_audio: params.generateAudio ?? true,
      watermark: false,
    };

    console.info("[video-provider-request]", {
      provider: "seedance",
      model,
      mode: useFrameMode ? "first_frame" : distinctReferenceUrls.length ? "reference_media" : "t2v",
      prompt: params.text,
      ratio: body.ratio,
      resolution: body.resolution,
      duration: body.duration,
      generate_audio: body.generate_audio,
      has_first_frame: useFrameMode && Boolean(params.firstFrameUrl),
      has_last_frame: useFrameMode && Boolean(params.lastFrameUrl),
      reference_image_count: useFrameMode ? 0 : distinctReferenceUrls.length,
      content_roles: content
        .map((item) => item.role)
        .filter((role): role is string => typeof role === "string"),
    });

    const res = await fetch(`${base}/contents/generations/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      throw new Error("ARK_RATE_LIMITED: 요청량 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.");
    }

    if (res.ok) {
      const json = (await res.json()) as { id?: string };
      if (!json?.id) throw new Error("ARK_NO_TASK_ID: 작업 ID를 받지 못했습니다.");
      return { taskId: json.id, model };
    }

    const text = await res.text().catch(() => "");
    failures.push(`${model} → HTTP ${res.status} ${text.slice(0, 200)}`);

    // 전용 엔드포인트를 먼저 사용하고, 같은 Seedance 2.0 모델 ID만 보조 대상으로 확인한다.
    const recoverable =
      res.status === 403 ||
      res.status === 404 ||
      text.includes("ModelNotOpen") ||
      text.includes("AccessDenied") ||
      text.includes("has not activated the model");
    if (!recoverable) {
      throw new Error(`ARK_HTTP_${res.status}: ${text.slice(0, 500)}`);
    }
  }

  throw new Error(
    "ARK_MODEL_NOT_ACTIVATED: Seedance 2.0 모델과 등록된 전용 엔드포인트를 사용할 수 없습니다. " +
      "BytePlus Ark에서 dreamina-seedance-2-0-260128 모델이 활성화되어 있거나 Seedance 2.0 엔드포인트가 실행 중인지 확인하고, " +
      "해당 엔드포인트를 만든 프로젝트와 동일한 프로젝트의 API Key 를 사용 중인지 확인한 뒤 " +
      "ARK_VIDEO_ENDPOINT_ID / ARK_API_KEY 를 갱신해 주세요. 시도 내역: " +
      failures.join(" | "),
  );
}


/** Seedance 작업 상태를 조회한다. */
export async function getVideoTask(taskId: string): Promise<VideoTaskState> {
  const { key, base } = arkEnv();
  const res = await fetch(`${base}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ARK_HTTP_${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    status?: string;
    content?: { video_url?: string };
    error?: { message?: string; code?: string };
  };
  const raw = (json.status ?? "").toLowerCase();
  const status: VideoTaskStatus =
    raw === "succeeded"
      ? "succeeded"
      : raw === "failed"
        ? "failed"
        : raw === "cancelled" || raw === "canceled"
          ? "cancelled"
          : raw === "running"
            ? "running"
            : "queued";
  return {
    status,
    videoUrl: json.content?.video_url,
    error: json.error
      ? [json.error.code ? `code=${json.error.code}` : "", json.error.message ?? ""]
          .filter(Boolean)
          .join(" message=") || "ARK_TASK_FAILED"
      : undefined,
  };
}
