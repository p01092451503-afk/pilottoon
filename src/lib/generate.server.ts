// Server-only helpers for the generate server function.
// This file must NOT be imported from client code.
//
// NOTE (의도된 변경 / intentional behavior change):
// 이 파일의 ARK 호출부는 로컬 프로토타입 "Studio0103 Seedream Generator V21.7"의
// server/server.js 구현(makePayload + callSeedream)과 동일하게 맞췄다.
// 이번 전환으로 아래 기능들은 의도적으로 제거되었다:
//   - 요청 재시도(429 backoff)
//   - 응답 헤더 기반 request-id 추적
//   - SensitiveContent/ContentPolicy 문자열 감지 및 사용자 안내 메시지 변환
//   - seed 파라미터 전송(= seed 기반 실제 variation)
//   - signed URL 참조 이미지 전달(→ base64 dataURL 직접 전달)
// 실패는 status/detail 을 그대로 상위로 던진다.

export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:3" | "3:4";

const SEEDREAM_MIN_PIXELS = 3686400;
const SEEDREAM_TARGET_PIXELS = 3840 * 2160;

function roundUpTo16(n: number): number {
  return Math.max(16, Math.ceil(Number(n) / 16) * 16);
}

function normalizeSeedreamSize(width: number, height: number): string {
  let w = roundUpTo16(width);
  let h = roundUpTo16(height);
  if (w * h < SEEDREAM_MIN_PIXELS) {
    const scale = Math.sqrt(SEEDREAM_MIN_PIXELS / (w * h));
    w = roundUpTo16(w * scale);
    h = roundUpTo16(h * scale);
  }
  while (w * h < SEEDREAM_MIN_PIXELS) {
    if (w >= h) w += 16;
    else h += 16;
  }
  return `${w}x${h}`;
}

function ratioToSeedreamSize(wRatio: number, hRatio: number): string {
  const width = Math.sqrt((SEEDREAM_TARGET_PIXELS * wRatio) / hRatio);
  const height = Math.sqrt((SEEDREAM_TARGET_PIXELS * hRatio) / wRatio);
  return normalizeSeedreamSize(width, height);
}

/** 이미지(Seedream) 전용 해상도 계산기. 비디오 생성 경로에서는 사용하지 않는다. */
export function aspectRatioToSize(aspectRatio?: string): string {
  const raw = String(aspectRatio || "").trim();
  const map: Record<string, string> = {
    "9:16": "2160x3840",
    "16:9": "3840x2160",
    "3:4": "2496x3328",
    "4:3": "3328x2496",
    "2:3": "2352x3528",
    "3:2": "3528x2352",
    "1:1": "2880x2880",
    "4:5": "2560x3200",
    "5:4": "3200x2560",
  };
  if (map[raw]) return map[raw]!;

  const explicit = raw.match(/^(\d{3,5})x(\d{3,5})$/i);
  if (explicit) return normalizeSeedreamSize(Number(explicit[1]), Number(explicit[2]));

  const ratio = raw.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (ratio) {
    const wRatio = Number(ratio[1]);
    const hRatio = Number(ratio[2]);
    if (wRatio > 0 && hRatio > 0) return ratioToSeedreamSize(wRatio, hRatio);
  }
  return "2K";
}

export type ArkResult = { url: string; width?: number; height?: number };

// 썸네일은 Worker 환경 호환 이슈로 원본 바이트를 그대로 반환한다.
export async function makeThumbnailWebp(bytes: Uint8Array): Promise<Uint8Array> {
  return bytes;
}

/**
 * ARK_BASE_URL 은 이제 "완전한 이미지 생성 엔드포인트 URL"이다.
 * (예: https://ark.ap-southeast.bytepluses.com/api/v3/images/generations)
 * 비디오/헬스체크처럼 API 루트가 필요한 곳에서는 이 함수로 루트를 얻는다.
 */
export function normalizeArkBaseUrl(raw: string): string {
  let v = raw.trim();
  const lastScheme = v.lastIndexOf("http");
  if (lastScheme > 0) v = v.slice(lastScheme);
  v = v.replace(/\/+$/, "");
  v = v.replace(/ark\.ap-southeast-\d+\.bytepluses\.com/i, "ark.ap-southeast.bytepluses.com");
  v = v.replace(/(\/api\/v\d+)(\1)+$/, "$1");
  // 풀 엔드포인트 URL 이 들어온 경우 API 루트만 남긴다.
  v = v.replace(/\/(images|contents)\/generations?\/?$/i, "");
  v = v.replace(/\/contents\/generations\/tasks\/?$/i, "");
  return v;
}

export function makePayload(params: {
  prompt: string;
  images?: string[];
  size?: string;
  aspectRatio?: string;
  watermark?: boolean;
}): Record<string, unknown> {
  const { prompt, images, size = "2K", aspectRatio, watermark = false } = params;
  const filteredImages = Array.isArray(images)
    ? images.filter((s) => typeof s === "string" && s.trim())
    : [];
  return {
    model: process.env.ARK_ENDPOINT_ID,
    prompt,
    image: filteredImages,
    sequential_image_generation: "auto",
    sequential_image_generation_options: { max_images: 1 },
    response_format: "url",
    size: aspectRatio ? aspectRatioToSize(aspectRatio) : size,
    stream: false,
    watermark,
  };
}

/**
 * 저장된 ARK_BASE_URL 이 API 루트만 있거나(예: .../api/v3)
 * 존재하지 않는 리전 호스트(ap-southeast-1)로 저장된 경우까지 보정해
 * 실제 이미지 생성 엔드포인트 URL 을 만든다.
 */
export function resolveArkImageEndpoint(raw?: string): string {
  let v = (raw ?? "").trim();
  if (!v) return "";
  const lastScheme = v.lastIndexOf("http");
  if (lastScheme > 0) v = v.slice(lastScheme);
  v = v.replace(/\/+$/, "");
  // 존재하지 않는 호스트 보정
  v = v.replace(/ark\.ap-southeast-\d+\.bytepluses\.com/i, "ark.ap-southeast.bytepluses.com");
  v = v.replace(/(\/api\/v\d+)(\1)+$/, "$1");
  if (!/\/images\/generations$/i.test(v)) {
    v = `${normalizeArkBaseUrl(v)}/images/generations`;
  }
  return v;
}

export async function callSeedream(payload: Record<string, unknown>): Promise<any> {
  const endpoint = resolveArkImageEndpoint(process.env.ARK_BASE_URL);
  if (!endpoint) throw new Error("ARK_BASE_URL_MISSING");

  const maxAttempts = 2;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.ARK_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // ARK가 실제로 응답했다 = 네트워크 문제가 아니다. 재시도하지 않고 즉시 던진다.
        const err = new Error(`ARK_HTTP_${res.status}`) as Error & { status?: number; detail?: unknown };
        err.status = res.status;
        err.detail = data;
        throw err;
      }
      return data; // { data: [{ url, size, ... }], ... }
    } catch (e) {
      const err = e as { status?: number };
      lastErr = e;
      // status 가 있으면 ARK 응답 기반 에러 → 재시도 금지.
      if (err.status != null) throw e;
      // 순수 네트워크 계층 실패만 짧게 재시도.
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
    }
  }
  throw lastErr;
}

/**
 * 한 번의 ARK 호출. raw 응답과 파싱된 결과를 함께 돌려준다.
 * (raw 응답은 generations.raw_responses 에 누적 저장된다)
 */
export async function callArk(params: {
  prompt: string;
  /** data:image/...;base64,... 문자열 배열 */
  images: string[];
  size: string;
  watermark?: boolean;
}): Promise<{ results: ArkResult[]; raw: unknown }> {
  const payload = makePayload({
    prompt: params.prompt,
    images: params.images,
    size: params.size,
    watermark: params.watermark ?? false,
  });
  const raw = await callSeedream(payload);
  const items = Array.isArray(raw?.data) ? (raw.data as Array<{ url?: string; size?: string }>) : [];
  const results: ArkResult[] = [];
  for (const it of items) {
    if (typeof it?.url === "string" && /^https?:\/\//i.test(it.url)) {
      const [w, h] = String(it.size ?? params.size)
        .split("x")
        .map((n) => Number(n) || undefined);
      results.push({ url: it.url, width: w, height: h });
    }
  }
  return { results, raw };
}
