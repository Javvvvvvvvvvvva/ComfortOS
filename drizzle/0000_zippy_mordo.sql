CREATE TABLE `edge_rate_limit_windows` (
	`scope` text NOT NULL,
	`client_hash` text NOT NULL,
	`window_start_ms` integer NOT NULL,
	`request_count` integer NOT NULL,
	`expires_at_ms` integer NOT NULL,
	PRIMARY KEY(`scope`, `client_hash`, `window_start_ms`)
);
--> statement-breakpoint
CREATE INDEX `idx_edge_rate_limit_windows_expires_at_ms` ON `edge_rate_limit_windows` (`expires_at_ms`);