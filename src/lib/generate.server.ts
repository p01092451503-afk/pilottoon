// Server-only helpers for the generate server function.
// This file must NOT be imported from client code.

export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:3" | "3:4" | "21:9" | "9:21";

// 최소 픽셀 수(3,686,400px) 이상 + 16의 배수로 맞춘 동적 해상도 계산기.
// 프리셋 비율은 물론 "5:4" 같은 커스텀 비율 문자열도 지원한다.
const MIN_PIXELS = 3_686_400;
const MAX_SIDE = 4320;

function round16(n: number): number {
  return Math.max(16, Math.round(n / 16) * 16);
}

/** "W:H" (또는 "W/H", "W x H") 문자열을 비율 숫자로 파싱한다. */
export function parseAspectRatio(ar?: string): { w: number; h: number } | null {
  if (!ar) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)\s*$/i.exec(ar);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return null;
  return { w, h };
}

/** 비율에 맞춰 최소 픽셀 수를 만족하는 16의 배수 해상도를 계산한다. */
export function computeSizeFromRatio(w: number, h: number): string {
  const ratio = w / h;
  // width = sqrt(MIN_PIXELS * ratio)
  let width = Math.sqrt(MIN_PIXELS * ratio);
  let height = width / ratio;
  // 16의 배수로 올림 정렬 후 최소 픽셀 미달이면 조금씩 키운다.
  let W = round16(width);
  let H = round16(height);
  let guard = 0;
  while (W * H < MIN_PIXELS && guard++ < 64) {
    width *= 1.01;
    height = width / ratio;
    W = round16(width);
    H = round16(height);
  }
  // 과도한 장변 제한
  if (W > MAX_SIDE) {
    W = round16(MAX_SIDE);
    H = round16(W / ratio);
  }
  if (H > MAX_SIDE) {
    H = round16(MAX_SIDE);
    W = round16(H * ratio);
  }
  return `${W}x${H}`;
}

// aspectRatio → size 매핑 (검증된 프리셋은 고정값, 그 외는 동적 계산)
export function aspectRatioToSize(ar?: string): string {
  switch (ar) {
    case "9:16":
      return "2160x3840";
    case "16:9":
      return "3840x2160";
    case "1:1":
      return "2880x2880";
    case "4:3":
      return "3520x2640";
    case "3:4":
      return "2640x3520";
    case "21:9":
      return "4320x1856";
    case "9:21":
      return "1856x4320";
    default: {
      const parsed = parseAspectRatio(ar);
      if (parsed) return computeSizeFromRatio(parsed.w, parsed.h);
      return "2880x2880"; // 안전 기본값 (문자열 '2K' 반환 금지)
    }
  }
}


export type ArkResult = { url: string; width?: number; height?: number; requestId?: string | null };

/** ARK 응답 헤더에서 공급자 요청 ID 를 추출한다. */
export function readArkRequestId(headers: Headers): string | null {
  const direct =
    headers.get("x-request-id") ??
    headers.get("x-tt-logid") ??
    headers.get("x-tt-trace-id") ??
    headers.get("request-id") ??
    headers.get("x-amzn-requestid");
  if (direct) return direct;
  // 공급자마다 헤더 이름이 달라서 request-id / logid 계열 헤더를 폭넓게 훑는다.
  for (const [k, v] of headers.entries()) {
    const key = k.toLowerCase();
    if ((key.includes("request-id") || key.includes("requestid") || key.includes("logid")) && v) {
      return v;
    }
  }
  return null;
}

// 썸네일은 Worker 환경 호환 이슈로 원본 바이트를 그대로 반환한다.
// (별도 리사이즈 라이브러리 도입 전까지 원본을 thumb 로 재사용)
export async function makeThumbnailWebp(bytes: Uint8Array): Promise<Uint8Array> {
  return bytes;
}

/**
 * ARK_BASE_URL 정규화.
 * 값이 실수로 두 번 붙여넣어진 경우("https://a/api/v3https://a/api/v3")나
 * 경로가 중복된 경우("/api/v3/api/v3"), 끝 슬래시 등을 안전하게 정리한다.
 */
export function normalizeArkBaseUrl(raw: string): string {
  let v = raw.trim();
  // 두 번째 스킴이 등장하면 마지막 URL만 사용
  const lastScheme = v.lastIndexOf("http");
  if (lastScheme > 0) v = v.slice(lastScheme);
  v = v.replace(/\/+$/, "");
  // 경로 중복 제거 (/api/v3/api/v3 → /api/v3)
  v = v.replace(/(\/api\/v\d+)(\1)+$/, "$1");
  return v;
}


export async function callArk(params: {
  prompt: string;
  /** 공인 서명 URL 또는 data:image/...;base64,... 문자열 */
  imageUrls: string[];
  size: string;
  seed?: number | null;
  /** ARK sequential_image_generation 모드 (기본 disabled — 한 요청당 1장) */
  sequentialMode?: "auto" | "disabled";
  /** sequentialMode=auto 일 때 최대 생성 장수 */
  maxImages?: number;
  /** Kept for backward-compat but ignored — the handler now issues one ARK call per seed to produce real variation. */
  batchCount?: number;
}): Promise<ArkResult[]> {
  const ARK_API_KEY = process.env.ARK_API_KEY;
  const ARK_BASE_URL = process.env.ARK_BASE_URL;
  const ARK_ENDPOINT_ID = process.env.ARK_ENDPOINT_ID;
  if (!ARK_API_KEY || !ARK_BASE_URL || !ARK_ENDPOINT_ID) {
    throw new Error("ARK 시크릿이 설정되지 않았습니다.");
  }

  const sequentialMode = params.sequentialMode ?? "disabled";
  const url = `${normalizeArkBaseUrl(ARK_BASE_URL)}/images/generations`;
  const payload: Record<string, unknown> = {
    model: ARK_ENDPOINT_ID,
    prompt: params.prompt,
    response_format: "url",
    size: params.size,
    watermark: false,
    n: 1,
    // 업로드 소스(V21.7)와 동일하게 순차 생성 동작을 명시한다.
    sequential_image_generation: sequentialMode,
  };
  if (sequentialMode === "auto") {
    payload.sequential_image_generation_options = {
      max_images: Math.max(1, Math.min(4, params.maxImages ?? 1)),
    };
  }

  if (params.imageUrls.length > 0) payload.image = params.imageUrls;
  if (params.seed != null) payload.seed = params.seed;

  const maxAttempts = 2;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ARK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const reqId = readArkRequestId(res.headers);

      if (res.status === 429) {
        throw new Error("ARK_RATE_LIMITED: 요청량 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.");
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const suffix = reqId ? ` [request_id=${reqId}]` : "";
        if (text.includes("SensitiveContentDetected") || text.includes("ContentPolicy")) {
          throw new Error(
            `ARK_SENSITIVE_CONTENT: 프롬프트가 이미지 API의 콘텐츠 정책에 걸렸습니다. 표현을 순화해 다시 시도해 주세요.${suffix}`,
          );
        }
        throw new Error(`ARK_HTTP_${res.status}: ${text.slice(0, 500)}${suffix}`);
      }
      // 응답이 비어 있거나 JSON 이 아닐 수 있으므로 text 로 읽고 안전하게 파싱한다.
      const bodyText = await res.text();
      if (!bodyText.trim()) {
        throw new Error(
          "ARK_EMPTY_RESPONSE: 이미지 API가 빈 응답을 반환했습니다. ARK 주소(ARK_BASE_URL) 설정을 확인해 주세요.",
        );
      }
      let json: { id?: string; request_id?: string; data?: Array<{ url?: string; size?: string }> };
      try {
        json = JSON.parse(bodyText) as typeof json;
      } catch {
        throw new Error(`ARK_BAD_JSON: 이미지 API 응답을 해석할 수 없습니다. ${bodyText.slice(0, 200)}`);
      }
      const responseId = json.request_id ?? json.id ?? reqId ?? null;
      const items = Array.isArray(json.data) ? json.data : [];
      const results: ArkResult[] = [];
      for (const it of items) {
        if (typeof it?.url === "string" && /^https?:\/\//i.test(it.url)) {
          const [w, h] = String(it.size ?? params.size).split("x").map((n) => Number(n) || undefined);
          results.push({ url: it.url, width: w, height: h, requestId: responseId });
        }
      }
      if (results.length === 0) throw new Error("ARK_NO_IMAGE: 결과 이미지 URL을 파싱할 수 없습니다.");
      return results;
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("ARK_RATE_LIMITED")) throw err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("ARK_UNKNOWN_ERROR");
}
