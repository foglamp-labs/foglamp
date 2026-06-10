CREATE TYPE "public"."eval_job_status" AS ENUM('pending', 'running', 'done', 'dead');--> statement-breakpoint
CREATE TABLE "eval_job" (
	"id" text PRIMARY KEY NOT NULL,
	"eval_id" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"status" "eval_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"leased_until" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eval_job" ADD CONSTRAINT "eval_job_eval_id_eval_id_fk" FOREIGN KEY ("eval_id") REFERENCES "public"."eval"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_job_evalId_idx" ON "eval_job" USING btree ("eval_id");--> statement-breakpoint
CREATE INDEX "eval_job_status_createdAt_idx" ON "eval_job" USING btree ("status","created_at");