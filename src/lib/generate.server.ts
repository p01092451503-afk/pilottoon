// Server-only helpers for the generate server function.
// This file must NOT be imported from client code.

export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:3" | "3:4" | "21:9" | "9:21";

// aspectRatio → size 매핑 (원본 규칙 준수: 최소 3,686,400px 이상 + 16의 배수)
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
    default:
      return "2880x2880"; // 안전 기본값 (문자열 '2K' 반환 금지)
  }
}

export type ArkResult = { url: string; width?: number; height?: number; requestId?: string | null };

/** ARK 응답 헤더에서 공급자 요청 ID 를 추출한다. */
export function readArkRequestId(headers: Headers): string | null {
  return (
    headers.get("x-request-id") ??
    headers.get("x-tt-logid") ??
    headers.get("x-tt-trace-id") ??
    headers.get("request-id") ??
    null
  );
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
  imageUrls: string[];
  size: string;
  seed?: number | null;
  /** Kept for backward-compat but ignored — the handler now issues one ARK call per seed to produce real variation. */
  batchCount?: number;
}): Promise<ArkResult[]> {
  const ARK_API_KEY = process.env.ARK_API_KEY;
  const ARK_BASE_URL = process.env.ARK_BASE_URL;
  const ARK_ENDPOINT_ID = process.env.ARK_ENDPOINT_ID;
  if (!ARK_API_KEY || !ARK_BASE_URL || !ARK_ENDPOINT_ID) {
    throw new Error("ARK 시크릿이 설정되지 않았습니다.");
  }

  const url = `${normalizeArkBaseUrl(ARK_BASE_URL)}/images/generations`;
  const payload: Record<string, unknown> = {
    model: ARK_ENDPOINT_ID,
    prompt: params.prompt,
    response_format: "url",
    size: params.size,
    watermark: false,
    n: 1,
  };
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

      if (res.status === 429) {
        throw new Error("ARK_RATE_LIMITED: 요청량 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.");
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (text.includes("SensitiveContentDetected") || text.includes("ContentPolicy")) {
          throw new Error(
            "ARK_SENSITIVE_CONTENT: 프롬프트가 이미지 API의 콘텐츠 정책에 걸렸습니다. 표현을 순화해 다시 시도해 주세요.",
          );
        }
        throw new Error(`ARK_HTTP_${res.status}: ${text.slice(0, 500)}`);
      }
      // 응답이 비어 있거나 JSON 이 아닐 수 있으므로 text 로 읽고 안전하게 파싱한다.
      const bodyText = await res.text();
      if (!bodyText.trim()) {
        throw new Error(
          "ARK_EMPTY_RESPONSE: 이미지 API가 빈 응답을 반환했습니다. ARK 주소(ARK_BASE_URL) 설정을 확인해 주세요.",
        );
      }
      let json: { data?: Array<{ url?: string; size?: string }> };
      try {
        json = JSON.parse(bodyText) as { data?: Array<{ url?: string; size?: string }> };
      } catch {
        throw new Error(`ARK_BAD_JSON: 이미지 API 응답을 해석할 수 없습니다. ${bodyText.slice(0, 200)}`);
      }
      const items = Array.isArray(json.data) ? json.data : [];
      const results: ArkResult[] = [];
      for (const it of items) {
        if (typeof it?.url === "string" && /^https?:\/\//i.test(it.url)) {
          const [w, h] = String(it.size ?? params.size).split("x").map((n) => Number(n) || undefined);
          results.push({ url: it.url, width: w, height: h });
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
