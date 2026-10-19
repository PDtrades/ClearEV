CREATE TABLE "ingestion_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"counts" jsonb,
	"errors" jsonb
);
--> statement-breakpoint
CREATE TABLE "link_checks" (
	"url" text PRIMARY KEY NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"http_status" integer,
	"ok" boolean NOT NULL,
	"error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_fields" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"provider_name" text NOT NULL,
	"provider_type" text NOT NULL,
	"categories" text[] NOT NULL,
	"benefit_types" text[] NOT NULL,
	"summary" text NOT NULL,
	"description_html" text,
	"amounts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stacking_note" text,
	"coverage" jsonb NOT NULL,
	"coverage_states" text[] DEFAULT '{}' NOT NULL,
	"coverage_type" text NOT NULL,
	"provider_location" text,
	"eligibility" jsonb NOT NULL,
	"application" jsonb NOT NULL,
	"program_url" text NOT NULL,
	"application_url" text,
	"start_date" text,
	"end_date" text,
	"status" text NOT NULL,
	"status_basis" text NOT NULL,
	"funding_note" text,
	"source_url" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"last_verified_at" timestamp with time zone,
	"verification_method" text NOT NULL,
	"uncertainties" text[] DEFAULT '{}' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_payload" jsonb,
	"content_hash" text NOT NULL,
	"review_state" text DEFAULT 'published' NOT NULL,
	"is_fixture" boolean DEFAULT false NOT NULL,
	"source_unavailable_since" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" text,
	"source_id" text,
	"reason" text NOT NULL,
	"details" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "source_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"homepage" text NOT NULL,
	"terms_url" text,
	"attribution" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"config_state" text DEFAULT 'configured' NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zip_utilities" (
	"zip" text NOT NULL,
	"utility_name" text NOT NULL,
	"source_id" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "program_revisions" ADD CONSTRAINT "program_revisions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "programs_source_external_idx" ON "programs" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "programs_coverage_states_idx" ON "programs" USING gin ("coverage_states");--> statement-breakpoint
CREATE INDEX "programs_categories_idx" ON "programs" USING gin ("categories");--> statement-breakpoint
CREATE UNIQUE INDEX "zip_utilities_pk" ON "zip_utilities" USING btree ("zip","utility_name","source_id");