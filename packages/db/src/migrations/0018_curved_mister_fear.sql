ALTER TABLE "alert_event" ADD COLUMN "diagnosis" jsonb;--> statement-breakpoint
ALTER TABLE "alert_state" ADD COLUMN "breach_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_state" ADD COLUMN "ok_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_state" ADD COLUMN "notify_day" text;--> statement-breakpoint
ALTER TABLE "alert_state" ADD COLUMN "notify_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_state" ADD COLUMN "diagnosis_day" text;--> statement-breakpoint
ALTER TABLE "alert_state" ADD COLUMN "diagnosis_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_state" ADD COLUMN "last_diagnosis_value" numeric(24, 10);