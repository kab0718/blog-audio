type ApiErrorPayload = {
  code?: unknown;
  message?: unknown;
  retryAfterSeconds?: unknown;
};

export async function getApiErrorMessage(
  response: Response,
  fallbackMessage: string,
) {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    const message =
      typeof payload.message === "string" ? payload.message.trim() : "";
    const retryAfterSeconds =
      typeof payload.retryAfterSeconds === "number" &&
      Number.isFinite(payload.retryAfterSeconds)
        ? payload.retryAfterSeconds
        : null;

    if (message && retryAfterSeconds !== null) {
      return `${message} Retry after ${Math.ceil(retryAfterSeconds)} seconds.`;
    }

    return message || `${fallbackMessage}: ${response.status}`;
  } catch {
    return `${fallbackMessage}: ${response.status}`;
  }
}
