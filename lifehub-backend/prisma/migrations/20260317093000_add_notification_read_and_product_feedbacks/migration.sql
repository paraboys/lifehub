ALTER TABLE "notifications"
ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMP(6);

CREATE TABLE IF NOT EXISTS "product_feedbacks" (
  "id" BIGSERIAL PRIMARY KEY,
  "product_id" BIGINT NOT NULL,
  "user_id" BIGINT NOT NULL,
  "order_id" BIGINT,
  "rating" DECIMAL(2,1) NOT NULL,
  "comment" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_feedbacks_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "product_feedbacks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "product_feedbacks_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_feedbacks_product_id_order_id_key"
  ON "product_feedbacks" ("product_id", "order_id");

CREATE INDEX IF NOT EXISTS "product_feedbacks_product_id_created_at_idx"
  ON "product_feedbacks" ("product_id", "created_at");

CREATE INDEX IF NOT EXISTS "product_feedbacks_user_id_created_at_idx"
  ON "product_feedbacks" ("user_id", "created_at");
