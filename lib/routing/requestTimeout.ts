import {
  RoutingProviderTimeoutError,
  RoutingProviderUnavailableError,
} from "@/lib/routing/errors";

export type RoutingRequestSignal = {
  signal: AbortSignal | undefined;
  dispose(): void;
  classifyError(error: unknown, providerName: string): never;
};

export function createRoutingRequestSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): RoutingRequestSignal {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      signal,
      dispose() {},
      classifyError(error, providerName) {
        if (isAbortError(error) && signal?.aborted) throw error;
        throw new RoutingProviderUnavailableError(`${providerName} unavailable.`, {
          cause: error,
        });
      },
    };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  const dispose = () => {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  };

  if (signal?.aborted) controller.abort();

  return {
    signal: controller.signal,
    dispose,
    classifyError(error, providerName) {
      if (isAbortError(error) && signal?.aborted && !timedOut) throw error;
      if (isAbortError(error) && timedOut) {
        throw new RoutingProviderTimeoutError(
          `${providerName} timed out after ${timeoutMs} ms.`,
          { cause: error },
        );
      }
      throw new RoutingProviderUnavailableError(`${providerName} unavailable.`, {
        cause: error,
      });
    },
  };
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
