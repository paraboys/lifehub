CREATE TABLE "order_delivery_details" (
    "order_id" BIGINT NOT NULL,
    "recipient_name" VARCHAR(120) NOT NULL,
    "recipient_phone" VARCHAR(20) NOT NULL,
    "address_line1" TEXT NOT NULL,
    "nearby_location" TEXT,
    "city" VARCHAR(120),
    "postal_code" VARCHAR(20),
    "landmark" TEXT,
    "delivery_note" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_delivery_details_pkey" PRIMARY KEY ("order_id")
);

ALTER TABLE "order_delivery_details"
ADD CONSTRAINT "order_delivery_details_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "orders"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;
