/**
 * Al-Alqami price engine — DEV/STAGING ONLY.
 * Pure pricing logic, designed for reuse exclusively on a trusted server.
 * NEVER pass an untrusted browser-side catalog as a pricing authority.
 * I.Q.D. only; numbers are integer dinars (no floats).
 */

export function calculateQuote({items, products, coupon=null, now=new Date(), usage={total:0, customer:0}}) {
  if (!Array.isArray(items) || items.length<1 || items.length>40) throw new Error('INVALID_CART');
  if (!Array.isArray(products)) throw new Error('CATALOG_UNAVAILABLE');
  const byId = new Map(products.map(p => [String(p.id),p]));
  const taken = new Set();
  const lines=[];
  let originalSubtotal=0, saleSavings=0, beforeCoupon=0;
  const clock=new Date(now).getTime();
  if (!Number.isFinite(clock)) throw new Error('INVALID_DATE');
  for(const line of items) {
    const id=String(line?.productId||'');
    const qty=line?.quantity;
    if(!id || taken.has(id) || !Number.isSafeInteger(qty) || qty<1 || qty>20) throw new Error('INVALID_CART_LINE');
    taken.add(id);
    const p=byId.get(id);
    if(!p || p.active!==true) throw new Error('PRODUCT_NOT_AVAILABLE');
    const price=p.basePriceIqd;
    if(!Number.isSafeInteger(price)||price<=0) throw new Error('INVALID_PRODUCT_PRICE');
    if(p.stockQuantity!==null && p.stockQuantity!==undefined && (!Number.isSafeInteger(p.stockQuantity)||p.stockQuantity<qty))throw new Error('NOT_ENOUGH_STOCK');
    const activeSale = p.discountEnabled === true &&
      Number.isSafeInteger(p.discountPriceIqd) && p.discountPriceIqd>0 && p.discountPriceIqd<price &&
      (!p.discountStartsAt || clock>=new Date(p.discountStartsAt).getTime()) &&
      (!p.discountEndsAt || clock<=new Date(p.discountEndsAt).getTime());
    const current=activeSale?p.discountPriceIqd:price;
    originalSubtotal+=price*qty;
    beforeCoupon+=current*qty;
    saleSavings+=(price-current)*qty;
    lines.push({productId:id,name:p.name,categoryId:p.categoryId,quantity:qty,originalUnitPriceIqd:price,finalUnitPriceIqd:current,saleActive:activeSale,lineTotalIqd:current*qty});
  }
  if(!Number.isSafeInteger(beforeCoupon)||beforeCoupon>1000000000000)throw new Error('CART_TOO_LARGE');
  let couponDiscount=0, appliedCoupon=null, eligibleSubtotal=0;
  if(coupon) {
    if(coupon.active!==true || !/^[A-Z0-9_-]{3,30}$/.test(coupon.code||''))throw new Error('COUPON_INVALID');
    if((coupon.startsAt && clock<new Date(coupon.startsAt).getTime())||(coupon.endsAt && clock>new Date(coupon.endsAt).getTime()))throw new Error('COUPON_INACTIVE');
    if(coupon.maximumUses!=null && usage.total>=coupon.maximumUses)throw new Error('COUPON_LIMIT_REACHED');
    if(coupon.maximumUsesPerCustomer!=null && usage.customer>=coupon.maximumUsesPerCustomer)throw new Error('CUSTOMER_COUPON_LIMIT_REACHED');
    const allowed=new Set(coupon.productIds||[]);
    const cats=new Set(coupon.categoryIds||[]);
    for(const p of lines){
      const inScope=coupon.scope==='all'||(coupon.scope==='category'&&cats.has(p.categoryId))||(coupon.scope==='products'&&allowed.has(p.productId));
      if(inScope && (coupon.allowStacking || !p.saleActive))eligibleSubtotal+=p.lineTotalIqd;
    }
    if(!eligibleSubtotal)throw new Error('COUPON_NO_ELIGIBLE_PRODUCTS');
    if(eligibleSubtotal<(coupon.minimumSpendIqd||0))throw new Error('COUPON_MINIMUM_SPEND');
    if(coupon.kind==='percent' && Number.isInteger(coupon.value) && coupon.value>0 && coupon.value<=100)
      couponDiscount=Math.floor(eligibleSubtotal*coupon.value/100);
    else if(coupon.kind==='fixed' && Number.isSafeInteger(coupon.value) && coupon.value>0)
      couponDiscount=Math.min(eligibleSubtotal,coupon.value);
    else throw new Error('COUPON_VALUE_INVALID');
    appliedCoupon=coupon.code;
  }
  const total=beforeCoupon-couponDiscount;
  return {currency:'IQD',lines,originalSubtotalIqd:originalSubtotal,saleSavingsIqd:saleSavings,subtotalAfterSalesIqd:beforeCoupon,couponEligibleSubtotalIqd:eligibleSubtotal,couponDiscountIqd:couponDiscount,appliedCoupon,totalBeforeDeliveryIqd:total,shippingIqd:null,installationIqd:null,finalAmountConfirmed:false,note:'Preview only. Server must recompute and reserve coupon atomically when confirming an order.'};
}