-- AL-ALQAMI STORE / INITIAL SCHEMA (REVIEWED DESIGN, NOT EXECUTED)
-- Run once in a NEW, dedicated Supabase project after reviewing/test deployment.
-- Do not paste service role or secret keys into the public GitHub repo.
-- Client-facing products/categories: RLS-protected reads. No public order/coupon writes.

create extension if not exists pgcrypto;

create table if not exists public.shop_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'manager' check (role in ('owner','manager','editor')),
  created_at timestamptz not null default now()
);

-- Must be owned by privileged migration role. SECURITY DEFINER avoids circular admin RLS.
create or replace function public.is_shop_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.shop_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_shop_admin() from public;
grant execute on function public.is_shop_admin() to anon,authenticated;
-- Anonymous visitors can call this safe boolean, which always returns false without a session.

create table if not exists public.shop_categories (
  id text primary key check (id ~ '^[a-z][a-z0-9_-]{1,49}$'),
  title text not null check (char_length(title) between 2 and 120),
  slug text unique,
  active boolean not null default true,
  position integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_products (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{2,80}$'),
  category_id text not null references public.shop_categories(id),
  name text not null check (char_length(name) between 2 and 240),
  brand text not null default '',
  description text not null default '',
  details text not null default '',
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  base_price_iqd bigint not null check (base_price_iqd >= 0 and base_price_iqd < 10000000000),
  discount_enabled boolean not null default false,
  discount_price_iqd bigint,
  discount_starts_at timestamptz,
  discount_ends_at timestamptz,
  active boolean not null default false,
  featured boolean not null default false,
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  source_url text,
  source_price_note text not null default '',
  updated_at timestamptz not null default now(),
  constraint valid_shop_discount check (
    (discount_price_iqd is null or (discount_price_iqd > 0 and discount_price_iqd < base_price_iqd))
    and (discount_enabled = false or discount_price_iqd is not null)
  ),
  constraint valid_shop_discount_dates check (
    discount_starts_at is null or discount_ends_at is null or discount_ends_at > discount_starts_at
  )
);
create index if not exists idx_shop_products_category on public.shop_products(category_id) where active;
create index if not exists idx_shop_products_discount on public.shop_products(discount_enabled) where active;

create table if not exists public.shop_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,30}$'),
  title text not null default '',
  kind text not null check (kind in ('percent','fixed')),
  amount_iqd_or_percent bigint not null check (amount_iqd_or_percent > 0),
  scope text not null check (scope in ('all','category','products')),
  minimum_spend_iqd bigint not null default 0 check (minimum_spend_iqd >= 0),
  maximum_uses integer check (maximum_uses is null or maximum_uses > 0),
  maximum_uses_per_customer integer not null default 1 check (maximum_uses_per_customer > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  allow_stacking boolean not null default false,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_coupon_discount check (
    (kind = 'percent' and amount_iqd_or_percent <= 100)
    or (kind = 'fixed' and amount_iqd_or_percent < 10000000000)
  ),
  constraint valid_coupon_dates check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index if not exists idx_shop_coupons_active on public.shop_coupons(active,starts_at,ends_at);

create table if not exists public.shop_coupon_categories (
  coupon_id uuid not null references public.shop_coupons(id) on delete cascade,
  category_id text not null references public.shop_categories(id) on delete cascade,
  primary key(coupon_id,category_id)
);
create table if not exists public.shop_coupon_products (
  coupon_id uuid not null references public.shop_coupons(id) on delete cascade,
  product_id text not null references public.shop_products(id) on delete cascade,
  primary key(coupon_id,product_id)
);

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_name text not null,
  customer_phone text not null,
  province text not null,
  address text not null,
  installation_requested boolean not null default false,
  payment_method text not null default 'cash_on_delivery' check(payment_method = 'cash_on_delivery'),
  status text not null default 'new' check(status in ('new','awaiting_quote','confirmed','preparing','shipped','completed','cancelled')),
  subtotal_iqd bigint not null check (subtotal_iqd >= 0),
  sale_discount_iqd bigint not null default 0 check (sale_discount_iqd >= 0),
  coupon_discount_iqd bigint not null default 0 check (coupon_discount_iqd >= 0),
  shipping_iqd bigint check (shipping_iqd is null or shipping_iqd >= 0),
  installation_iqd bigint check (installation_iqd is null or installation_iqd >= 0),
  total_iqd bigint check (total_iqd is null or total_iqd >= 0),
  coupon_id uuid references public.shop_coupons(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint install_only_karbala check (
    installation_requested = false or province in ('كربلاء','Karbala','karbala')
  )
);
create index if not exists idx_shop_orders_created on public.shop_orders(created_at desc);
create index if not exists idx_shop_orders_status on public.shop_orders(status,created_at desc);
create table if not exists public.shop_order_items (
  id bigint generated by default as identity primary key,
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  product_id text references public.shop_products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity between 1 and 999),
  unit_base_price_iqd bigint not null check (unit_base_price_iqd >= 0),
  unit_final_price_iqd bigint not null check (unit_final_price_iqd >= 0),
  total_line_iqd bigint not null check (total_line_iqd >= 0)
);
create table if not exists public.shop_coupon_redemptions (
  id bigint generated by default as identity primary key,
  coupon_id uuid not null references public.shop_coupons(id),
  order_id uuid not null unique references public.shop_orders(id) on delete cascade,
  customer_token text not null, -- HMAC of normalized phone, computed SERVER-SIDE, never raw phone
  redeemed_at timestamptz not null default now()
);
create index if not exists idx_shop_coupon_redemptions_coupon on public.shop_coupon_redemptions(coupon_id);
create index if not exists idx_shop_coupon_redemptions_customer on public.shop_coupon_redemptions(coupon_id,customer_token);

-- Safe timestamps
create or replace function public.shop_set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists tg_shop_categories_updated on public.shop_categories;
create trigger tg_shop_categories_updated before update on public.shop_categories for each row execute function public.shop_set_updated_at();
drop trigger if exists tg_shop_products_updated on public.shop_products;
create trigger tg_shop_products_updated before update on public.shop_products for each row execute function public.shop_set_updated_at();
drop trigger if exists tg_shop_coupons_updated on public.shop_coupons;
create trigger tg_shop_coupons_updated before update on public.shop_coupons for each row execute function public.shop_set_updated_at();
drop trigger if exists tg_shop_orders_updated on public.shop_orders;
create trigger tg_shop_orders_updated before update on public.shop_orders for each row execute function public.shop_set_updated_at();

-- RLS + grants. Authenticated access must ALSO pass admin membership check.
alter table public.shop_admins enable row level security;
alter table public.shop_categories enable row level security;
alter table public.shop_products enable row level security;
alter table public.shop_coupons enable row level security;
alter table public.shop_coupon_products enable row level security;
alter table public.shop_coupon_categories enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_order_items enable row level security;
alter table public.shop_coupon_redemptions enable row level security;

revoke all on table public.shop_admins,public.shop_categories,public.shop_products,
 public.shop_coupons,public.shop_coupon_products,public.shop_coupon_categories,
 public.shop_orders,public.shop_order_items,public.shop_coupon_redemptions from anon,authenticated;

grant select on public.shop_categories,public.shop_products to anon,authenticated;
grant insert,update,delete on public.shop_categories,public.shop_products to authenticated;
grant select,insert,update,delete on public.shop_coupons,public.shop_coupon_products,
 public.shop_coupon_categories,public.shop_orders,public.shop_order_items,
 public.shop_coupon_redemptions to authenticated;
-- No client can add itself as an admin. Provision admin users from the SQL editor.

create policy shop_categories_public on public.shop_categories for select to anon,authenticated using (active or (select public.is_shop_admin()));
create policy shop_categories_write on public.shop_categories for all to authenticated using ((select public.is_shop_admin())) with check ((select public.is_shop_admin()));
create policy shop_products_public on public.shop_products for select to anon,authenticated using (active or (select public.is_shop_admin()));
create policy shop_products_write on public.shop_products for all to authenticated using ((select public.is_shop_admin())) with check ((select public.is_shop_admin()));

create policy shop_coupons_admin on public.shop_coupons for all to authenticated using ((select public.is_shop_admin())) with check ((select public.is_shop_admin()));
create policy shop_coupon_products_admin on public.shop_coupon_products for all to authenticated using ((select public.is_shop_admin())) with check ((select public.is_shop_admin()));
create policy shop_coupon_categories_admin on public.shop_coupon_categories for all to authenticated using ((select public.is_shop_admin())) with check ((select public.is_shop_admin()));
create policy shop_orders_admin on public.shop_orders for all to authenticated using ((select public.is_shop_admin())) with check ((select public.is_shop_admin()));
create policy shop_order_items_admin on public.shop_order_items for all to authenticated using ((select public.is_shop_admin())) with check ((select public.is_shop_admin()));
create policy shop_redemptions_admin on public.shop_coupon_redemptions for all to authenticated using ((select public.is_shop_admin())) with check ((select public.is_shop_admin()));

-- Admin provisioning example (replace with a real Supabase Auth UUID, ONLY in private SQL editor):
-- insert into public.shop_admins(user_id, role) values ('YOUR-AUTH-USER-UUID', 'owner');

-- Next milestone: a server-side place-order function using a transaction and row locks,
-- computing prices from DB and verifying coupon limits, scope, and customer identity.
-- Until that is deployed, NO real coupon redemptions should be accepted.