CREATE TABLE "invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"label" text,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "notebook_current" (
	"id" integer PRIMARY KEY NOT NULL,
	"revision_id" integer NOT NULL,
	CONSTRAINT "notebook_current_singleton" CHECK ("notebook_current"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "notebook_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc" jsonb NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"invite_id" integer NOT NULL,
	"author_name" text,
	"panel" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notebook_current" ADD CONSTRAINT "notebook_current_revision_id_notebook_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."notebook_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE no action ON UPDATE no action;