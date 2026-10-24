/* Al-Alqami Cloudflare D1 checkout integration — DEVELOPMENT BRANCH ONLY.
  Browser never decides a discount; Cloudflare Worker recalculates prices and usage.
  No admin passwords or secret keys in this file. */
(()=>{'use strict';
const API='https://alalqami-store-api.awjnob1988.workers.dev';
const fmt=n=>Number(n||0).toLocaleString('en-US')+' د.ع';
const live=new Map();let coupon='',quote=null,busy=false;
async function api(path,data){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const r=await fetch(API+path,{method:data===undefined?'GET':'POST',mode:'cors',cache:'no-store',signal:controller.signal,...(data===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})});
 const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'تعذر الاتصال بنظام الخصومات');return j;
 }finally{clearTimeout(timer)}
}
const items=()=>cartItems().map(({p,q})=>({id:String(p.id),qty:q}));
const ready=()=>items().length>0&&items().every(x=>live.has(x.id)&&x.qty<=20);
const el=id=>document.getElementById(id);
function priceBadges(){
 document.querySelectorAll('.product-card').forEach(card=>{
  const a=card.querySelector('a[href^="#/product/"]'),id=a?.getAttribute('href')?.split('/').pop(),p=live.get(id);
  const line=card.querySelector('.price-line > div');if(!line||!p||p.sale_price===null||line.querySelector('.aq-old'))return;
  line.insertAdjacentHTML('afterbegin','<span class="aq-old">'+fmt(p.price)+'</span>');
 });
 const id=location.hash.match(/^#\/product\/([^/?]+)/)?.[1],p=live.get(id),d=document.querySelector('.detail-price');
 if(p&&p.sale_price!==null&&d&&!d.querySelector('.aq-old'))d.insertAdjacentHTML('afterbegin','<span class="aq-old">'+fmt(p.price)+'</span>');
}
function showQuote(q){
 if(!el('aq-quote'))return;
 el('aq-quote').innerHTML='<div class="aq-quote"><div>السعر الأصلي: '+fmt(q.subtotal)+'</div><div>خصم المنتج: '+fmt(q.product_discount)+'</div><div>خصم الكوبون: '+fmt(q.coupon_discount)+'</div><strong>بعد الخصومات: '+fmt(q.total)+'</strong><small>التوصيل والتركيب تُحسب أجورهما لاحقاً.</small></div>';
}
function inject(){
 const aside=document.querySelector('.checkout-layout > aside.panel');if(!aside||el('aq-code'))return;
 aside.querySelector('h3')?.insertAdjacentHTML('afterend','<section class="aq-coupon"><label for="aq-code">عندك كوبون خصم؟</label><div class="aq-coupon-row"><input id="aq-code" placeholder="رمز الكوبون" maxlength="32" autocomplete="off"><button type="button" class="btn btn-outline" id="aq-apply">تطبيق</button></div><p id="aq-message" role="status" aria-live="polite">يتفعّل الخصم بعد اعتماد المنتجات من لوحة الإدارة.</p><div id="aq-quote"></div></section>');
 if(coupon&&quote){el('aq-code').value=coupon;showQuote(quote)}
}
async function apply(){
 const code=(el('aq-code')?.value||'').trim().toUpperCase();coupon='';quote=null;
 if(el('aq-quote'))el('aq-quote').textContent='';
 if(!code){el('aq-message').textContent='أدخل رمز الكوبون.';return}
 if(!ready()){el('aq-message').textContent='لازم تعتمد الإدارة أسعار منتجات السلة أولاً.';return}
 const button=el('aq-apply');button.disabled=true;el('aq-message').textContent='جاري التحقق من الكوبون...';
 try{const r=await api('/api/quote',{items:items(),coupon:code});if(!Number.isSafeInteger(r.quote?.total))throw Error('رد غير صالح');
 coupon=code;quote=r.quote;showQuote(r.quote);el('aq-message').textContent='✓ الكوبون صالح ومحتسب من قاعدة البيانات';
 }catch(e){el('aq-message').textContent=e.message||'تعذر التحقق'}finally{button.disabled=false}
}
async function submit(form){
 if(busy)return;
 if(!ready()){toast('بعض أسعار السلة لم تعتمد من لوحة الإدارة');return}
 const text=(el('aq-code')?.value||'').trim().toUpperCase();if(text!==coupon){toast('اضغط تطبيق قبل استخدام الكوبون');return}
 const get=id=>(form.querySelector('#'+id)?.value||'').trim();
 const key=form.dataset.orderKey||(form.dataset.orderKey=crypto.randomUUID());
 const data={customer_name:get('fullname'),phone:get('phone'),province:get('province'),address:get('district')+'، '+get('address'),items:items(),coupon,idempotency_key:key};
 const button=form.querySelector('button[type=submit]');if(button)button.disabled=true;busy=true;
 try{
  const r=await api('/api/order',data);
  if(!r.order_id||!Number.isSafeInteger(r.total))throw Error('تعذر تسجيل الطلب');
  const msg=['طلب مجموعة العلقمي #'+r.order_id.slice(0,8),'الاسم: '+data.customer_name,'الهاتف: '+data.phone,'المحافظة: '+data.province,'العنوان: '+data.address,...cartItems().map(({p,q})=>p.name+' × '+q),'بعد الخصومات: '+fmt(r.total),coupon?'كوبون: '+coupon:'','أجور التوصيل والتركيب تُؤكد لاحقاً'].filter(Boolean).join('\n');
  const whatsapp=r.whatsapp_url||'https://wa.me/9647706050050?text='+encodeURIComponent(msg);
  latestSuccess={whatsapp,id:r.order_id};coupon='';quote=null;go('/success');toast('تم تسجيل الطلب؛ افتح واتساب واضغط إرسال');
 }catch(e){toast('لم يسجّل الطلب: '+(e.message||'حاول مجدداً'))}finally{busy=false;if(button)button.disabled=false}
}
document.addEventListener('click',e=>{if(e.target.closest('#aq-apply')){e.preventDefault();apply()}},true);
document.addEventListener('submit',e=>{if(e.target?.id!=='checkout-form')return;
 const typed=(el('aq-code')?.value||'').trim();
 if(!typed&&!cartItems().some(({p})=>live.has(String(p.id))))return;
 e.preventDefault();e.stopImmediatePropagation();if(e.target.reportValidity())submit(e.target);
},true);
const css=document.createElement('style');css.textContent='.aq-old{color:#955969;text-decoration:line-through;text-decoration-color:#d9233b;text-decoration-thickness:2px;font-size:.76em;margin-inline-end:8px}.aq-coupon{padding:14px;border:1px solid #d1e7f8;background:#f2f9ff;border-radius:14px;margin:12px 0 18px}.aq-coupon label{display:block;font-weight:800;margin-bottom:8px}.aq-coupon-row{display:flex;gap:8px}.aq-coupon input{min-width:0;flex:1;border:1px solid #c0d8ed;border-radius:9px;padding:10px;font:inherit}.aq-coupon p{font-size:12px;color:#496b83;line-height:1.8}.aq-quote{border-top:1px solid #c6e0ee;padding-top:9px;display:grid;gap:4px}.aq-quote strong{font-size:18px;color:#0768a9}.aq-quote small{color:#637c90}';document.head.append(css);
const app=el('app');if(app){new MutationObserver(()=>{inject();priceBadges()}).observe(app,{childList:true});inject();priceBadges()}
setTimeout(async()=>{try{const res=await api('/api/catalog');for(const p of res.products||[]){
 if(!Number.isSafeInteger(p.price))continue;live.set(String(p.id),p);
 const x=products.find(x=>String(x.id)===String(p.id));if(!x)continue;
 x.price=p.sale_price===null?p.price:p.sale_price;
 if(typeof p.name==='string'&&p.name)x.name=p.name;
 }if(live.size)render(false)}catch(e){console.warn('Cloudflare catalog awaiting activation.')}},3500);
})();