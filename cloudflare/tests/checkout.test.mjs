import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { JSDOM } from 'jsdom';

const origin = 'https://store.local';
const fixture = await readFile(new URL('./schema-v2.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/0001_checkout_recovery.sql', import.meta.url), 'utf8');
const deliveryMigration = await readFile(new URL('../migrations/0002_delivery_fee.sql', import.meta.url), 'utf8');
const source = await readFile(new URL('../worker.mjs', import.meta.url), 'utf8');
const invoiceBundle = await readFile(new URL('../invoice/invoice.bundle.txt', import.meta.url), 'utf8');
const storefront = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const adminHTML = JSON.parse(source.split('\n')[0].slice('const ADMIN_HTML = '.length).replace(/;$/, ''));

const sqlStatements = text => text.replace(/^\s*--.*$/gm, '').trim().split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean);
const fixtureStatements = fixture.replace('PRAGMA foreign_keys=ON;', '').trim().split(/\n\s*\n/);
const toSQL = date => date.toISOString().slice(0, 19).replace('T', ' ');
const payload = (extra = {}) => ({
  customer_name: 'عميل اختبار محلي', phone: '07700000000', province: 'كربلاء',
  address: 'عنوان اختبار محلي فقط', items: [{ id: 'test-product', qty: 1 }],
  coupon: '', idempotency_key: webcrypto.randomUUID(), ...extra,
});

async function setup(bindings = {}) {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: [{type:'ESModule',path:new URL('../worker.mjs',import.meta.url).pathname,contents:source},{type:'Text',path:new URL('../invoice/invoice.bundle.txt',import.meta.url).pathname,contents:invoiceBundle}], compatibilityDate: '2026-10-25',
    d1Databases: ['DB'], bindings: { AUTH_KEY: 'local-test-signing-key', ADMIN_PASSWORD: 'local-test-password', ...bindings },
  }));
  try {
  const db = await mf.getD1Database('DB');
  await db.batch(fixtureStatements.map(s => db.prepare(s)));
  await db.batch(sqlStatements(migration).map(s => db.prepare(s)));
  await db.batch(sqlStatements(deliveryMigration).map(s => db.prepare(s)));
  async function request(path, method = 'GET', body, cookie) {
    const r = await mf.dispatchFetch(origin + path, {
      method,
      headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { response: r, status: r.status, json: await r.json() };
  }
  const login = await request('/api/admin/login', 'POST', { password: 'local-test-password' });
  assert.equal(login.status, 200);
  const cookie = login.response.headers.get('Set-Cookie').split(';')[0];
  const admin = (path, method = 'GET', body) => request('/api/admin' + path, method, body, cookie);
  async function reset() {
    await db.batch(['DELETE FROM coupon_redemptions', 'DELETE FROM orders', 'DELETE FROM coupons', 'DELETE FROM products', 'DELETE FROM order_rates'].map(s => db.prepare(s)));
    await db.prepare("INSERT INTO products(id,name,category,price,active) VALUES('test-product','منتج اختبار','systems',10000,1)").run();
  }
  async function coupon(code = 'TEST', extra = {}) {
    const result = await admin('/coupons', 'POST', {
      code, kind: 'percent', value: 10, scope: 'all', scope_ids: [], min_total: 0,
      max_uses: 10, starts_at: null, ends_at: null, enabled: 1, allow_stacking: 1, ...extra,
    });
    assert.equal(result.status, 200, JSON.stringify(result.json));
    return result;
  }
  await reset();
  return { mf, db, request, admin, reset, coupon };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}

test('checkout and coupon regression tests with local Workers/D1', async t => {
  const app = await setup();
  t.after(() => app.mf.dispose());

  await t.test('Baghdad input is stored in UTC and an active numeric coupon applies', async () => {
    await app.reset();
    const localStart = new Date(Date.now() + 3 * 3600000 - 60000).toISOString().slice(0, 16);
    const localEnd = new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 16);
    await app.coupon('2026', { starts_at: localStart, ends_at: localEnd });
    const saved = await app.db.prepare("SELECT * FROM coupons WHERE code='2026'").first();
    assert.equal(saved.starts_at, toSQL(new Date(localStart + ':00+03:00')));
    const quote = await app.request('/api/quote', 'POST', { items: payload().items, coupon: '٢٠٢٦' });
    assert.equal(quote.status, 200);
    assert.equal(quote.json.quote.coupon_discount, 1000);
    assert.equal(quote.json.quote.total, 15000);
    assert.equal(quote.json.quote.delivery_fee, 6000);
    assert.equal((await app.db.prepare("SELECT uses FROM coupons WHERE code='2026'").first()).uses, 0);
  });

  await t.test('UTC ISO dates round-trip without an extra three-hour shift', async () => {
    await app.reset();
    const starts = new Date(Date.now() - 60000).toISOString();
    await app.coupon('ISO1', { starts_at: starts });
    assert.equal((await app.db.prepare("SELECT starts_at FROM coupons WHERE code='ISO1'").first()).starts_at, toSQL(new Date(starts)));
    assert.equal((await app.request('/api/quote', 'POST', { items: payload().items, coupon: 'ISO1' })).status, 200);
  });

  await t.test('migration converts only legacy local dates, once', async () => {
    await app.reset();
    await app.db.prepare("DELETE FROM site_settings WHERE key='coupon_timezone_utc_v1'").run();
    await app.db.prepare("INSERT INTO coupons(code,kind,value,scope,starts_at,ends_at) VALUES('OLD1','percent',10,'all','2026-10-25 15:59:00','2026-10-26 15:59:00')").run();
    const timeStatements = sqlStatements(migration).slice(2);
    await app.db.batch(timeStatements.map(s => app.db.prepare(s)));
    await app.db.batch(timeStatements.map(s => app.db.prepare(s)));
    const dates = await app.db.prepare("SELECT starts_at,ends_at FROM coupons WHERE code='OLD1'").first();
    assert.equal(dates.starts_at, '2026-10-25 12:59:00');
    assert.equal(dates.ends_at, '2026-10-26 12:59:00');
  });

  await t.test('coupon errors identify future, expired, disabled and exhausted coupons', async () => {
    await app.reset();
    await app.coupon('LATER', { starts_at: new Date(Date.now() + 3600000).toISOString() });
    await app.coupon('PAST', { ends_at: new Date(Date.now() - 3600000).toISOString() });
    await app.coupon('OFF1', { enabled: 0 });
    await app.coupon('USED', { max_uses: 1 });
    await app.db.prepare("UPDATE coupons SET uses=1 WHERE code='USED'").run();
    for (const [code, message] of [['LATER', /يبدأ الكوبون.*بتوقيت بغداد/], ['PAST', /انتهت/], ['OFF1', /موقوف/], ['USED', /نفد عدد/]]) {
      const result = await app.request('/api/quote', 'POST', { items: payload().items, coupon: code });
      assert.equal(result.status, 400);
      assert.match(result.json.error, message);
    }
  });

  await t.test('eligible product/category scopes and stacking rules remain enforced', async () => {
    await app.reset();
    await app.coupon('SCOP', { scope: 'category', scope_ids: ['spares'] });
    assert.equal((await app.request('/api/quote', 'POST', { items: payload().items, coupon: 'SCOP' })).status, 400);
    await app.db.prepare("UPDATE products SET sale_price=8000 WHERE id='test-product'").run();
    await app.coupon('NONE', { allow_stacking: 0 });
    await app.coupon('BOTH', { allow_stacking: 1 });
    assert.match((await app.request('/api/quote', 'POST', { items: payload().items, coupon: 'NONE' })).json.error, /تخفيض المنتج/);
    const quote = await app.request('/api/quote', 'POST', { items: payload().items, coupon: 'BOTH' });
    assert.equal(quote.json.quote.product_discount, 2000);
    assert.equal(quote.json.quote.coupon_discount, 800);
    assert.equal(quote.json.quote.total, 13200);
  });

  await t.test('a complete WhatsApp receipt exists on initial response and every retry', async () => {
    await app.reset();
    await app.coupon('ONCE', { max_uses: 1 });
    const body = payload({ coupon: 'ONCE' });
    const first = await app.request('/api/order', 'POST', body);
    const retry = await app.request('/api/order', 'POST', body);
    assert.equal(first.status, 200);
    assert.equal(retry.status, 200);
    assert.equal(retry.json.order_id, first.json.order_id);
    assert.equal(retry.json.whatsapp_url, first.json.whatsapp_url);
    assert.equal(retry.json.repeat, true);
    const link = new URL(first.json.whatsapp_url);
    assert.equal(link.hostname, 'wa.me');
    assert.equal(link.pathname, '/9647706050050');
    assert.match(link.searchParams.get('text'), /منتج اختبار × 1/);
    assert.match(link.searchParams.get('text'), /15000 د.ع/);
    assert.match(link.searchParams.get('text'), /أجور التوصيل: 6000 د.ع/);
    assert.match(link.searchParams.get('text'), /الكوبون: ONCE/);
    assert.equal(first.json.delivery_status, 'unconfirmed');
    assert.equal((await app.db.prepare('SELECT COUNT(*) AS n FROM orders').first()).n, 1);
    assert.equal((await app.db.prepare("SELECT uses FROM coupons WHERE code='ONCE'").first()).uses, 1);
    const mismatch = await app.request('/api/order', 'POST', { ...body, address: 'عنوان آخر مختلف تماماً' });
    assert.equal(mismatch.status, 409);
  });

  await t.test('concurrent repeats cannot create duplicate orders or consume the coupon twice', async () => {
    await app.reset();
    await app.coupon('RACE', { max_uses: 1 });
    const body = payload({ coupon: 'RACE' });
    const replies = await Promise.all([app.request('/api/order', 'POST', body), app.request('/api/order', 'POST', body)]);
    assert.deepEqual(replies.map(x => x.status), [200, 200]);
    assert.equal(replies[0].json.order_id, replies[1].json.order_id);
    assert.equal((await app.db.prepare('SELECT COUNT(*) AS n FROM orders').first()).n, 1);
    assert.equal((await app.db.prepare('SELECT COUNT(*) AS n FROM coupon_redemptions').first()).n, 1);
  });

  await t.test('permanent deletion preserves receipts, rejects reuse, and protects the endpoint', async () => {
    await app.reset();
    await app.coupon('DEL1');
    const body = payload({ coupon: 'DEL1' });
    const first = await app.request('/api/order', 'POST', body);
    assert.equal((await app.request('/api/admin/coupons/DEL1', 'DELETE', { confirm_code: 'DEL1' })).status, 401);
    assert.equal((await app.admin('/coupons/DEL1', 'DELETE', { confirm_code: 'OTHER' })).status, 400);
    assert.equal((await app.admin('/coupons/DEL1', 'DELETE', { confirm_code: 'DEL1' })).status, 200);
    assert.equal(await app.db.prepare("SELECT * FROM coupons WHERE code='DEL1'").first(), null);
    assert.equal((await app.db.prepare('SELECT COUNT(*) AS n FROM coupon_redemptions').first()).n, 0);
    const receipt = await app.db.prepare('SELECT * FROM orders WHERE id=?').bind(first.json.order_id).first();
    assert.equal(receipt.coupon_code, null);
    assert.equal(receipt.coupon_code_snapshot, 'DEL1');
    assert.equal(receipt.coupon_discount, 1000);
    assert.equal(receipt.total, 15000);
    const retry = await app.request('/api/order', 'POST', body);
    assert.equal(retry.status, 200);
    assert.equal(retry.json.whatsapp_url, first.json.whatsapp_url);
    assert.equal((await app.request('/api/quote', 'POST', { items: payload().items, coupon: 'DEL1' })).status, 400);
    assert.equal((await app.admin('/orders/' + first.json.order_id, 'PATCH', { status: 'cancelled' })).status, 200);
  });

  await t.test('invalid coupon creates neither an order nor a redemption', async () => {
    await app.reset();
    const result = await app.request('/api/order', 'POST', payload({ coupon: 'NOPE' }));
    assert.equal(result.status, 400);
    assert.equal((await app.db.prepare('SELECT COUNT(*) AS n FROM orders').first()).n, 0);
    assert.equal((await app.db.prepare('SELECT COUNT(*) AS n FROM coupon_redemptions').first()).n, 0);
  });

  await t.test('delivery is charged exactly once for every province and cannot be discounted', async () => {
    await app.reset();
    await app.coupon('FREE', {value:100});
    const quote=await app.request('/api/quote','POST',{items:payload().items,coupon:'FREE',delivery_fee:0,total:0});
    assert.equal(quote.json.quote.delivery_fee,6000);
    assert.equal(quote.json.quote.total,6000);
    for(const province of ['كربلاء','بغداد','أربيل','البصرة']){
      const order=await app.request('/api/order','POST',payload({province,delivery_fee:0}));
      assert.equal(order.json.total,16000);
      assert.equal(order.json.delivery_fee,6000);
    }
  });

  await t.test('product deletion removes catalog entries, keeps historical invoices and adjusts scoped coupons', async () => {
    await app.reset();
    await app.coupon('ONLY',{scope:'products',scope_ids:['test-product']});
    const placed=await app.request('/api/order','POST',payload());
    assert.equal((await app.request('/api/admin/products/test-product','DELETE',{confirm_id:'test-product'})).status,401);
    assert.equal((await app.admin('/products/test-product','DELETE',{confirm_id:'wrong'})).status,400);
    assert.equal((await app.admin('/products/test-product','DELETE',{confirm_id:'test-product'})).status,200);
    assert.equal((await app.request('/api/catalog')).json.products.length,0);
    assert.equal((await app.request('/api/order','POST',payload())).status,400);
    const coupon=await app.db.prepare("SELECT * FROM coupons WHERE code='ONLY'").first();
    assert.equal(coupon.enabled,0);
    assert.equal(coupon.scope_ids,'[]');
    assert.equal((await app.request('/api/admin/orders/'+placed.json.order_id+'/invoice')).status,401);
    const invoice=await app.admin('/orders/'+placed.json.order_id+'/invoice');
    assert.equal(invoice.status,200);
    assert.equal(invoice.json.order.items[0].name,'منتج اختبار');
    assert.equal(invoice.json.order.total,16000);
    assert.equal(invoice.json.order.delivery_fee,6000);
    assert.equal('idempotency_key' in invoice.json.order,false);
    assert.equal((await app.admin('/orders/'+placed.json.order_id,'PATCH',{status:'fulfilled'})).status,200);
    assert.equal((await app.admin('/orders/'+placed.json.order_id+'/invoice')).json.order.status,'fulfilled');
  });

  await t.test('historical orders and receipts retain their original delivery fee and total',async()=>{
    await app.reset();
    const body=payload(),placed=await app.request('/api/order','POST',body);
    await app.db.prepare('UPDATE orders SET delivery_fee=0,total=10000 WHERE id=?').bind(placed.json.order_id).run();
    const retry=await app.request('/api/order','POST',body);
    assert.equal(retry.json.total,10000);
    assert.equal(retry.json.delivery_fee,0);
    const invoice=await app.admin('/orders/'+placed.json.order_id+'/invoice');
    assert.equal(invoice.json.order.total,10000);
  });
});

test('invalid merchant WhatsApp configuration never saves an order', async t => {
  const app = await setup({ SHOP_WHATSAPP: 'not-a-phone' });
  t.after(() => app.mf.dispose());
  await app.coupon();
  const result = await app.request('/api/order', 'POST', payload({ coupon: 'TEST' }));
  assert.equal(result.status, 503);
  assert.match(result.json.error, /لم يتم تسجيل طلب جديد/);
  assert.equal((await app.db.prepare('SELECT COUNT(*) AS n FROM orders').first()).n, 0);
  assert.equal((await app.db.prepare("SELECT uses FROM coupons WHERE code='TEST'").first()).uses, 0);
});

test('admin dates, deletion cancel and pending order labels', async () => {
  const dom = new JSDOM(adminHTML, { url: origin, runScripts: 'outside-only' });
  const w = dom.window;
  const calls = [];
  const state = { products: [{id:'test-product',name:'منتج اختبار',price:1000,sale_price:null,active:1}], coupons: [{ code: '2026', starts_at: '2026-10-25 12:59:00', ends_at: null }], orders: [{ id: 'local-order', status: 'new' },{id:'completed-order',status:'fulfilled'}], site: {} };
  w.fetch = async (path, options) => { calls.push({ path, options }); return { ok: true, json: async () => state }; };
  w.confirm = () => false;
  const context = dom.getInternalVMContext();
  const evaluate = script => vm.runInContext(script, context);
  evaluate(w.document.querySelector('script:not([src])').textContent);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(evaluate("dt('2026-10-25 12:59:00')"), '2026-10-25T15:59');
  assert.equal(evaluate("utcCouponDate('2026-10-25T15:59')"), '2026-10-25T12:59:00.000Z');
  evaluate("state.tab='coupons';render()");
  const button = w.document.querySelector('[data-delete-coupon="2026"]');
  assert.ok(button);
  await button.onclick();
  assert.equal(calls.filter(x => x.options?.method === 'DELETE').length, 0);
  evaluate("state.tab='orders';render()");
  assert.match(w.document.querySelector('#pane').textContent, /بانتظار تأكيد التاجر/);
  assert.doesNotMatch(w.document.querySelector('#pane').textContent, /\bnew\b/);
  assert.equal(w.document.querySelector('.status-badge.fulfilled').textContent,'✓ مكتمل');
  assert.ok(w.document.querySelector('[data-invoice="completed-order"]'));
  evaluate("state.tab='products';render()");
  const deleteProduct=w.document.querySelector('[data-delete-product="test-product"]');
  assert.ok(deleteProduct);
  await deleteProduct.onclick();
  assert.equal(calls.filter(x=>x.options?.method==='DELETE').length,0);
  assert.equal(w.document.querySelector('.top a').href, 'https://alalqami.pages.dev/');
  dom.window.close();
});

test('storefront retries a lost order response with the same key and keeps a recovery link', async t => {
  const app = await setup();
  t.after(() => app.mf.dispose());
  const dom = new JSDOM('<form id="checkout-form"><input id="fullname" value="عميل اختبار محلي"><input id="phone" value="07700000000"><input id="province" value="كربلاء"><input id="district" value="منطقة اختبار"><input id="address" value="عنوان اختبار"><input id="notes"><input id="coupon-code"><button type="submit">إكمال الطلب</button></form>');
  t.after(() => dom.window.close());
  const keys = [], messages = [], popups = [], routes = [];
  let loseResponse = true;
  const memory = new Map();
  const state = { province: 'كربلاء', installation: false, cart: { 'test-product': 1 } };
  const sandbox = {
    TextEncoder, Uint8Array, crypto: webcrypto, state,
    sessionStorage: { getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) },
    cartItems: () => [{ p: { id: 'test-product' }, q: 1 }],
    persist() {}, go: p => routes.push(p), toast: x => messages.push(x),
    window: { open() { const popup = { location: {}, closed: false, close() { this.closed = true; } }; popups.push(popup); return popup; }, location: { assign() { throw Error('Unexpected same-tab navigation'); } } },
    async alqamiFetch(path, opt) {
      const body = JSON.parse(opt.body); keys.push(body.idempotency_key);
      const result = await app.request(path, 'POST', body);
      if (loseResponse) { loseResponse = false; throw Error('اختبار انقطاع الرد'); }
      if (result.status !== 200) throw Error(result.json.error);
      return result.json;
    },
  };
  const script = storefront.slice(storefront.indexOf('let checkoutAttempt=null;'), storefront.indexOf("document.addEventListener('submit',async e=>"));
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  const form = dom.window.document.querySelector('form');
  await sandbox.submitCheckout(form);
  assert.equal(state.cart['test-product'], 1);
  assert.equal(popups[0].closed, true);
  await sandbox.submitCheckout(form);
  assert.equal(keys[0], keys[1]);
  assert.equal((await app.db.prepare('SELECT COUNT(*) AS n FROM orders').first()).n, 1);
  assert.deepEqual(routes, ['/success']);
  assert.match(popups[1].location.href, /^https:\/\/wa.me\/9647706050050\?text=/);
  assert.match(vm.runInContext('latestSuccess.whatsapp', sandbox), /^https:\/\/wa.me\//);
  assert.equal(memory.size, 0);
});
