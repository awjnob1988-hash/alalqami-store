-- Historical orders retain their agreed totals; only new orders charge delivery.
ALTER TABLE orders ADD COLUMN delivery_fee INTEGER NOT NULL DEFAULT 0 CHECK(delivery_fee >= 0);
