export type ServerLogLevel = "info" | "warn" | "error";
export type ServerLogValue = string | number | boolean | null | undefined;

const FORBIDDEN_FIELD =
  /token|secret|password|authorization|cookie|coordinate|latitude|longitude|origin|destination/i;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

export function createRequestId(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

export function sanitizeServerLogFields(
  fields: Record<string, ServerLogValue>,
): Record<string, Exclude<ServerLogValue, undefined>> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([key, value]) => !FORBIDDEN_FIELD.test(key) && value !== undefined,
    ),
  ) as Record<string, Exclude<ServerLogValue, undefined>>;
}

export function logServerEvent(
  level: ServerLogLevel,
  event: string,
  fields: Record<string, ServerLogValue>,
) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitizeServerLogFields(fields),
  });

  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}
