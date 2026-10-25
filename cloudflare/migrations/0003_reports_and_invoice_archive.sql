ALTER TABLE orders ADD COLUMN invoice_archived INTEGER NOT NULL DEFAULT 0 CHECK(invoice_archived IN (0,1));
ALTER TABLE orders ADD COLUMN cancel_reason TEXT NOT NULL DEFAULT '' CHECK(cancel_reason IN ('','cancelled','rejected'));
UPDATE orders SET cancel_reason='cancelled' WHERE status='cancelled';
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at);
CREATE INDEX IF NOT EXISTS orders_invoice_archive_date_idx ON orders(invoice_archived,created_at);
