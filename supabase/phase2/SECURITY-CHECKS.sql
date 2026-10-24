-- Al-Alqami / Supabase checks. Run in SQL editor AFTER initial schema migration.
-- Safe read-only verification: these checks never modify customer or product data.
do $$
declare n integer;
begin
 if not exists (select 1 from pg_class where oid='public.shop_products'::regclass and relrowsecurity) then raise exception 'shop_products missing RLS'; end if;
 if not exists (select 1 from pg_class where oid='public.shop_coupons'::regclass and relrowsecurity) then raise exception 'shop_coupons missing RLS'; end if;
 if not exists (select 1 from pg_class where oid='public.shop_orders'::regclass and relrowsecurity) then raise exception 'shop_orders missing RLS'; end if;
 if has_table_privilege('anon','public.shop_products','INSERT') then raise exception 'anon can insert products'; end if;
 if has_table_privilege('anon','public.shop_products','UPDATE') then raise exception 'anon can update products'; end if;
 if has_table_privilege('anon','public.shop_coupons','SELECT') then raise exception 'anon can read private coupons'; end if;
 if has_table_privilege('anon','public.shop_coupons','INSERT') then raise exception 'anon can create coupons'; end if;
 if has_table_privilege('anon','public.shop_orders','SELECT') then raise exception 'anon can read orders'; end if;
 if has_table_privilege('anon','public.shop_orders','INSERT') then raise exception 'anon can inject orders'; end if;
 if has_table_privilege('authenticated','public.shop_admins','INSERT') then raise exception 'authenticated can create admins'; end if;
 select count(*) into n from pg_policies where schemaname='public' and tablename in ('shop_products','shop_coupons','shop_orders');
 if n < 5 then raise exception 'Expected RLS policies are incomplete'; end if;
 raise notice 'Al-Alqami security prerequisites passed';
end $$;