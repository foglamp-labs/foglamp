CREATE TABLE "prompt_hash" (
	"project_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"hash" text NOT NULL,
	"text" text NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"version_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_hash_project_id_agent_name_hash_pk" PRIMARY KEY("project_id","agent_name","hash")
);
--> statement-breakpoint
CREATE TABLE "prompt_infer_state" (
	"id" text PRIMARY KEY NOT NULL,
	"watermark" timestamp with time zone NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_version" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"number" integer NOT NULL,
	"template" text NOT NULL,
	"slot_count" integer DEFAULT 0 NOT NULL,
	"hash_count" integer DEFAULT 0 NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_hash" ADD CONSTRAINT "prompt_hash_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_hash" ADD CONSTRAINT "prompt_hash_version_id_prompt_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."prompt_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_version" ADD CONSTRAINT "prompt_version_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_hash_version_idx" ON "prompt_hash" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "prompt_version_agent_idx" ON "prompt_version" USING btree ("project_id","agent_name");