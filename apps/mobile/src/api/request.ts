export class RequestTimeoutError extends Error {
  constructor() {
    super("The request timed out.");
    this.name = "RequestTimeoutError";
  }
}

type RequestJsonOptions = {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_TIMEOUT_MS = 12_000;

export async function requestJson<T>(
  url: URL,
  init: RequestInit = {},
  options: RequestJsonOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  let timedOut = false;
  const abortFromCaller = () => controller.abort();

  if (callerSignal?.aborted) controller.abort();
  callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await (options.fetchImpl ?? fetch)(url.toString(), {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as T & {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? `Request failed (${response.status}).`);
    }
    return payload;
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}
