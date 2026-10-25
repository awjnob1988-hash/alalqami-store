-- Upgrade the existing Cloudflare D1 store once, before deploying Worker 2.1.
-- Historical receipts keep the applied code even when the coupon is deleted.
ALTER TABLE orders ADD COLUMN coupon_code_snapshot TEXT;

UPDATE orders
SET coupon_code_snapshot = coupon_code
WHERE coupon_code IS NOT NULL;

-- V2 stored Baghdad datetime-local input verbatim. Convert existing coupons
-- to UTC once; new clients send an explicit timezone and the API stores UTC.
UPDATE coupons
SET starts_at = CASE WHEN starts_at IS NULL THEN NULL ELSE datetime(starts_at, '-3 hours') END,
    ends_at = CASE WHEN ends_at IS NULL THEN NULL ELSE datetime(ends_at, '-3 hours') END
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'coupon_timezone_utc_v1');

INSERT OR IGNORE INTO site_settings(key, value)
VALUES ('coupon_timezone_utc_v1', '{"timezone":"Asia/Baghdad","storage":"UTC"}');
