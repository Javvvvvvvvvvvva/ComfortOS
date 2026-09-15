import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const edgeRateLimitWindows = sqliteTable(
  "edge_rate_limit_windows",
  {
    scope: text("scope").notNull(),
    clientHash: text("client_hash").notNull(),
    windowStartMs: integer("window_start_ms").notNull(),
    requestCount: integer("request_count").notNull(),
    expiresAtMs: integer("expires_at_ms").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.scope, table.clientHash, table.windowStartMs],
    }),
    index("idx_edge_rate_limit_windows_expires_at_ms").on(table.expiresAtMs),
  ],
);
