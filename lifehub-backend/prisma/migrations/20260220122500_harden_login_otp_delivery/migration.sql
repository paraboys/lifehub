ALTER TABLE "login_otps"
ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "login_otps_phone_created_at_idx"
ON "login_otps" ("phone", "created_at" DESC);
