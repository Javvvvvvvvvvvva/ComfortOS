import assert from "node:assert/strict";
import test from "node:test";
import { RequestTimeoutError, requestJson } from "./request";

test("requestJson returns normalized JSON and adds the accept header", async () => {
  const payload = await requestJson<{ ok: boolean }>(
    new URL("https://api.example.test/health"),
    {},
    {
      fetchImpl: async (_input, init) => {
        assert.equal(new Headers(init?.headers).get("accept"), "application/json");
        assert.equal(init?.cache, "no-store");
        return new Response(JSON.stringify({ ok: true }));
      },
    },
  );
  assert.deepEqual(payload, { ok: true });
});

test("requestJson aborts a request at its bounded timeout", async () => {
  await assert.rejects(
    () =>
      requestJson(
        new URL("https://api.example.test/slow"),
        {},
        {
          timeoutMs: 5,
          fetchImpl: async (_input, init) =>
            await new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            }),
        },
      ),
    RequestTimeoutError,
  );
});

test("requestJson preserves caller cancellation", async () => {
  const controller = new AbortController();
  const request = requestJson(
    new URL("https://api.example.test/cancelled"),
    { signal: controller.signal },
    {
      timeoutMs: 500,
      fetchImpl: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("caller-aborted")));
        }),
    },
  );
  controller.abort();
  await assert.rejects(request, /caller-aborted/);
});
