-- table _cf_KV
CREATE TABLE _cf_KV (
        key TEXT PRIMARY KEY,
        value BLOB
      ) WITHOUT ROWID;

-- table auth_attempts
CREATE TABLE auth_attempts(ip TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);

-- table coupon_redemptions
CREATE TABLE coupon_redemptions(
 order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
 code TEXT NOT NULL REFERENCES coupons(code),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table coupons
CREATE TABLE coupons(
 code TEXT PRIMARY KEY CHECK(length(code) BETWEEN 4 AND 32),
 kind TEXT NOT NULL CHECK(kind IN ('percent','fixed')),
 value INTEGER NOT NULL CHECK(value > 0),
 scope TEXT NOT NULL CHECK(scope IN ('all','category','products')),
 scope_ids TEXT NOT NULL DEFAULT '[]',
 min_total INTEGER NOT NULL DEFAULT 0 CHECK(min_total >= 0),
 max_uses INTEGER NOT NULL DEFAULT 1 CHECK(max_uses >= 1),
 uses INTEGER NOT NULL DEFAULT 0 CHECK(uses >= 0),
 starts_at TEXT,
 ends_at TEXT,
 allow_stacking INTEGER NOT NULL DEFAULT 0 CHECK(allow_stacking IN (0,1)),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table order_rates
CREATE TABLE order_rates(ip TEXT NOT NULL,bucket INTEGER NOT NULL,uses INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(ip,bucket));

-- table orders
CREATE TABLE orders(
 id TEXT PRIMARY KEY,
 idempotency_key TEXT UNIQUE NOT NULL,
 customer_name TEXT NOT NULL,
 phone TEXT NOT NULL,
 province TEXT NOT NULL,
 address TEXT NOT NULL,
 items_json TEXT NOT NULL,
 subtotal INTEGER NOT NULL CHECK(subtotal >= 0),
 product_discount INTEGER NOT NULL DEFAULT 0 CHECK(product_discount >= 0),
 coupon_discount INTEGER NOT NULL DEFAULT 0 CHECK(coupon_discount >= 0),
 total INTEGER NOT NULL CHECK(total >= 0),
 coupon_code TEXT REFERENCES coupons(code),
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','confirmed','fulfilled','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table products
CREATE TABLE products(
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 180),
 category TEXT NOT NULL CHECK(category IN ('systems','filters','spares','other')),
 brand TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT '',
 image TEXT NOT NULL DEFAULT '',
 price INTEGER NOT NULL CHECK(price >= 0 AND price <= 1000000000),
 sale_price INTEGER CHECK(sale_price IS NULL OR (sale_price >= 0 AND sale_price < price)),
 active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- index idx_orders_recent
CREATE INDEX idx_orders_recent ON orders(created_at DESC);

-- index idx_products_category_active
CREATE INDEX idx_products_category_active ON products(active,category);

-- trigger count_coupon_redemption
CREATE TRIGGER count_coupon_redemption AFTER INSERT ON coupon_redemptions
BEGIN UPDATE coupons SET uses=uses+1 WHERE code=NEW.code; END;

-- trigger uncount_coupon_redemption
CREATE TRIGGER uncount_coupon_redemption AFTER DELETE ON coupon_redemptions
BEGIN UPDATE coupons SET uses=MAX(0,uses-1) WHERE code=OLD.code; END;

-- trigger validate_coupon_redemption
CREATE TRIGGER validate_coupon_redemption BEFORE INSERT ON coupon_redemptions
BEGIN
 SELECT CASE WHEN NOT EXISTS (
   SELECT 1 FROM coupons WHERE code=NEW.code AND enabled=1 AND uses < max_uses
   AND (starts_at IS NULL OR starts_at <= datetime('now'))
   AND (ends_at IS NULL OR ends_at >= datetime('now'))
 ) THEN RAISE(ABORT,'coupon_unavailable') END;
END;
