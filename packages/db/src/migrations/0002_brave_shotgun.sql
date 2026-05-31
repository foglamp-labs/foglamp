CREATE TYPE "public"."eval_run_status" AS ENUM('ok', 'paused_no_key', 'error');--> statement-breakpoint
CREATE TYPE "public"."eval_scorer_source" AS ENUM('code', 'llm');--> statement-breakpoint
CREATE TYPE "public"."eval_target_level" AS ENUM('trace', 'span');--> statement-breakpoint
CREATE TYPE "public"."provider_name" AS ENUM('google', 'openai', 'anthropic');--> statement-breakpoint
ALTER TYPE "public"."alert_metric" ADD VALUE 'eval_avg_score';--> statement-breakpoint
ALTER TYPE "public"."alert_metric" ADD VALUE 'eval_pass_rate';--> statement-breakpoint
CREATE TABLE "eval" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"preset_id" text NOT NULL,
	"scorer_source" "eval_scorer_source" NOT NULL,
	"target_level" "eval_target_level" NOT NULL,
	"filters" jsonb,
	"sample_rate" numeric(5, 4) DEFAULT '0.1' NOT NULL,
	"model" jsonb,
	"config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_state" (
	"eval_id" text PRIMARY KEY NOT NULL,
	"watermark" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "eval_run_status" DEFAULT 'ok' NOT NULL,
	"last_scored_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"provider" "provider_name" NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_credential_project_provider_uq" UNIQUE("project_id","provider")
);
--> statement-breakpoint
ALTER TABLE "alert_rule" ADD COLUMN "eval_id" text;--> statement-breakpoint
ALTER TABLE "eval" ADD CONSTRAINT "eval_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_state" ADD CONSTRAINT "eval_state_eval_id_eval_id_fk" FOREIGN KEY ("eval_id") REFERENCES "public"."eval"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credential" ADD CONSTRAINT "provider_credential_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_projectId_idx" ON "eval" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "alert_rule" ADD CONSTRAINT "alert_rule_eval_id_eval_id_fk" FOREIGN KEY ("eval_id") REFERENCES "public"."eval"("id") ON DELETE cascade ON UPDATE no action;