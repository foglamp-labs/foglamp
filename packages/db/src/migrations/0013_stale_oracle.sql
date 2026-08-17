CREATE TABLE "instrumentation_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_by_api_key_id" text,
	"status" text DEFAULT 'awaiting_approval' NOT NULL,
	"detected" jsonb NOT NULL,
	"approved" jsonb,
	"applied" jsonb,
	"failure_stage" text,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"agent_resumed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"first_trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instrumentation_plan" ADD CONSTRAINT "instrumentation_plan_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrumentation_plan" ADD CONSTRAINT "instrumentation_plan_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrumentation_plan" ADD CONSTRAINT "instrumentation_plan_created_by_api_key_id_api_key_id_fk" FOREIGN KEY ("created_by_api_key_id") REFERENCES "public"."api_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instrumentation_plan_projectId_idx" ON "instrumentation_plan" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "instrumentation_plan_status_expiresAt_idx" ON "instrumentation_plan" USING btree ("status","expires_at");