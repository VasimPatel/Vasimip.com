ALTER TABLE "submissions" ADD COLUMN "ip_hash" text;--> statement-breakpoint
CREATE INDEX "submissions_invite_created_idx" ON "submissions" USING btree ("invite_id","created_at");--> statement-breakpoint
CREATE INDEX "submissions_iphash_created_idx" ON "submissions" USING btree ("ip_hash","created_at");