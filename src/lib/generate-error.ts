/** Maps raw ARK/server error messages to i18n keys shown to the user. */
export function generateErrorKey(message: string): string | null {
  if (
    message.includes("ARK_SENSITIVE_CONTENT") ||
    message.includes("SensitiveContentDetected") ||
    message.includes("PROMPT_POLICY_VIOLATION_LOCAL")
  )
    return "studio.errors.sensitive_content";
  if (message.includes("ARK_RATE_LIMITED")) return "studio.errors.rate_limited";
  if (message.includes("ARK_EMPTY_RESPONSE") || message.includes("ARK_BAD_JSON"))
    return "studio.errors.bad_response";
  if (message.includes("ARK_HTTP_401") || message.includes("ARK_HTTP_403"))
    return "studio.errors.auth_failed";
  if (message.startsWith("ARK_HTTP_")) return "studio.errors.api_failed";
  return null;
}
