ALTER TABLE "login_otps"
ADD COLUMN IF NOT EXISTS "purpose" VARCHAR(30) NOT NULL DEFAULT 'LOGIN';

CREATE INDEX IF NOT EXISTS "login_otps_phone_purpose_created_at_idx"
ON "login_otps" ("phone", "purpose", "created_at" DESC);
