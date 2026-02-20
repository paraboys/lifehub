-- AlterTable
ALTER TABLE "products"
ADD COLUMN "company" VARCHAR(120),
ADD COLUMN "description" TEXT,
ADD COLUMN "image_url" TEXT;

-- CreateTable
CREATE TABLE "shop_feedbacks" (
    "id" BIGSERIAL NOT NULL,
    "shop_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "order_id" BIGINT,
    "rating" DECIMAL(2,1) NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_feedbacks_order_id_key" ON "shop_feedbacks"("order_id");
CREATE INDEX "shop_feedbacks_shop_id_created_at_idx" ON "shop_feedbacks"("shop_id", "created_at");
CREATE INDEX "shop_feedbacks_user_id_created_at_idx" ON "shop_feedbacks"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "shop_feedbacks" ADD CONSTRAINT "shop_feedbacks_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shop_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "shop_feedbacks" ADD CONSTRAINT "shop_feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "shop_feedbacks" ADD CONSTRAINT "shop_feedbacks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
