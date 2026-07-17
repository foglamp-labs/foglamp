ALTER TABLE "poster" ADD COLUMN "previous_data" jsonb;--> statement-breakpoint
ALTER TABLE "poster" ADD COLUMN "claimed_by_user_id" text;--> statement-breakpoint
ALTER TABLE "poster" ADD CONSTRAINT "poster_claimed_by_user_id_user_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;