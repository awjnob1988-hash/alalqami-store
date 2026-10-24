import assert from 'node:assert/strict';
import {calculateQuote} from './pricing.mjs';

const products=[
 {id:'a',name:'RO',categoryId:'systems',active:true,basePriceIqd:300000,discountEnabled:true,discountPriceIqd:250000,stockQuantity:4},
 {id:'b',name:'Filter',categoryId:'filters',active:true,basePriceIqd:40000,discountEnabled:false,stockQuantity:null},
 {id:'c',name:'Pump',categoryId:'spares',active:false,basePriceIqd:50000,stockQuantity:2}
];
const cart=[{productId:'a',quantity:1},{productId:'b',quantity:2}];
const coupon={code:'ALQAMI20',kind:'percent',value:20,scope:'all',minimumSpendIqd:0,maximumUses:50,maximumUsesPerCustomer:1,active:true,allowStacking:false};
const quote=o=>calculateQuote({items:cart,products,coupon:o,now:'2026-10-24T12:00:00Z',usage:{total:0,customer:0}});
const regular=quote(null);
assert.equal(regular.originalSubtotalIqd,380000);
assert.equal(regular.saleSavingsIqd,50000);
assert.equal(regular.totalBeforeDeliveryIqd,330000);
const noStack=quote(coupon);
assert.equal(noStack.couponEligibleSubtotalIqd,80000);
assert.equal(noStack.couponDiscountIqd,16000);
assert.equal(noStack.totalBeforeDeliveryIqd,314000);
const stack=quote({...coupon,allowStacking:true});
assert.equal(stack.couponEligibleSubtotalIqd,330000);
assert.equal(stack.couponDiscountIqd,66000);
assert.equal(stack.totalBeforeDeliveryIqd,264000);
assert.throws(()=>quote({...coupon,scope:'category',categoryIds:['spares']}),/COUPON_NO_ELIGIBLE_PRODUCTS/);
assert.throws(()=>quote({...coupon,minimumSpendIqd:81000}),/COUPON_MINIMUM_SPEND/);
assert.throws(()=>calculateQuote({items:cart,products,coupon,usage:{total:50,customer:0}}),/COUPON_LIMIT_REACHED/);
assert.throws(()=>calculateQuote({items:cart,products,coupon,usage:{total:0,customer:1}}),/CUSTOMER_COUPON_LIMIT_REACHED/);
assert.throws(()=>calculateQuote({items:[{productId:'c',quantity:1}],products}),/PRODUCT_NOT_AVAILABLE/);
assert.throws(()=>calculateQuote({items:[{productId:'a',quantity:5}],products}),/NOT_ENOUGH_STOCK/);
assert.throws(()=>calculateQuote({items:[{productId:'a',quantity:1},{productId:'a',quantity:2}],products}),/INVALID_CART_LINE/);
assert.equal(quote({...coupon,kind:'fixed',value:150000}).couponDiscountIqd,80000);
assert.throws(()=>quote({...coupon,active:false}),/COUPON_INVALID/);


console.log("pricing: all assertions passed");