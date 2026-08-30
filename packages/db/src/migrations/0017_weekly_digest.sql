CREATE TABLE "notification_preference" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text NOT NULL,
	"weekly_digest" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_user_org_unique" UNIQUE("user_id","org_id")
);
--> statement-breakpoint
CREATE TABLE "weekly_digest" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"week_start" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"claim_token" text,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"recipients" integer DEFAULT 0 NOT NULL,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_digest_org_week_unique" UNIQUE("org_id","week_start")
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "digest_nudged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_digest" ADD CONSTRAINT "weekly_digest_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_preference_orgId_idx" ON "notification_preference" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "weekly_digest_status_idx" ON "weekly_digest" USING btree ("status");