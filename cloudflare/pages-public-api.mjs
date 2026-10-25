// Only public storefront operations are exposed. Admin stays on its existing service.
const routes = new Map([
  ['/api/catalog', 'GET'],
  ['/api/site', 'GET'],
  ['/api/quote', 'POST'],
  ['/api/order', 'POST'],
]);

function error(message, status) {
  return Response.json({ ok: false, error: message }, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = routes.get(url.pathname);
    if (!method) return error('الصفحة غير موجودة', 404);
    if (request.method !== method) return error('طريقة الطلب غير مسموحة', 405);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return error('المصدر غير مسموح', 403);
    if (method === 'POST' && request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
      return error('صيغة الطلب غير صالحة', 415);
    }
    if (!env.STORE_API) return error('خدمة المتجر غير متاحة مؤقتاً', 503);

    const headers = new Headers(request.headers);
    for (const name of ['Cookie', 'Authorization', 'Origin', 'Referer', 'Host']) headers.delete(name);
    const target = new Request('https://alalqami-store-api.awjnob1988.workers.dev' + url.pathname, request);
    const upstream = new Request(target, { headers, redirect: 'manual' });
    try {
      const response = await env.STORE_API.fetch(upstream);
      const resultHeaders = new Headers({
        'Content-Type': response.headers.get('Content-Type') || 'application/json;charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      return new Response(response.body, { status: response.status, headers: resultHeaders });
    } catch (cause) {
      console.error(JSON.stringify({ event: 'store_api_unavailable', name: cause?.name || 'Error' }));
      return error('تعذر الاتصال بخدمة المتجر، حاول مرة ثانية', 502);
    }
  },
};
