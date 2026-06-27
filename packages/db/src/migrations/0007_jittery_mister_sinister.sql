CREATE TABLE "poster" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"data" jsonb NOT NULL,
	"edit_token_hash" text NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poster_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "poster_expiresAt_idx" ON "poster" USING btree ("expires_at");