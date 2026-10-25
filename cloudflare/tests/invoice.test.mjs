import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';

const root=path.resolve(new URL('../..',import.meta.url).pathname);
const output=path.join(root,'tmp/pdfs');
await mkdir(output,{recursive:true});
await build({entryPoints:[path.join(root,'cloudflare/invoice/invoice.mjs')],bundle:true,platform:'node',format:'cjs',outfile:path.join(output,'invoice-test.cjs'),plugins:[{name:'font',setup(b){b.onLoad({filter:/\.ttf$/},async args=>({contents:'export default '+JSON.stringify((await readFile(args.path)).toString('base64')),loader:'js'}))}}]});
const {createInvoice}=createRequire(import.meta.url)(path.join(output,'invoice-test.cjs'));
const sample={id:'11111111-2222-4333-8444-555555555555',created_at:'2026-10-25 16:00:00',customer_name:'زبون تجريبي',phone:'07700000000',province:'بغداد',address:'المنصور - شارع الرواد - عنوان تجريبي للمعاينة',status:'fulfilled',subtotal:360000,product_discount:10000,coupon_discount:5000,coupon_code_snapshot:'2026',delivery_fee:6000,total:351000,items:[{name:'منظومة ماء C.C.K التايوانية الأصلية - 6 مراحل',qty:1,price:360000,unit:350000,total:350000}]};
test('Arabic purchase invoice contains embedded font and saved financial details',async()=>{
 const {doc,filename}=createInvoice(sample);
 assert.equal(doc.getNumberOfPages(),1);
 assert.match(filename,/^ALQ-20261025-11111111\.pdf$/);
 const bytes=new Uint8Array(doc.output('arraybuffer'));
 assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');
 const raw=doc.output();
 assert.match(raw,/FontFile2/);
 assert.match(raw,/ToUnicode/);
 await writeFile(path.join(output,'alqami-invoice-sample.pdf'),bytes);
 assert.throws(()=>createInvoice({...sample,total:1}),/غير متطابقة/);
});
test('long names, addresses and 30 products paginate with all line items',async()=>{
 const items=Array.from({length:30},(_,i)=>({...sample.items[0],name:'منتج رقم '+(i+1)+' - منظومة ماء مع فلاتر وشمعات وملحقات أصلية للاستخدام المنزلي بجودة عالية ضمن مجموعة العلقمي',qty:2,price:10000,unit:10000,total:20000}));
 const {doc}=createInvoice({...sample,customer_name:'اسم عميل تجريبي طويل لاختبار التفاف النص داخل الحقول دون اقتطاع',address:'عنوان تجريبي مفصل يشمل المنطقة والشارع وأقرب نقطة دالة. '.repeat(6),items,subtotal:600000,product_discount:0,coupon_discount:0,total:606000});
 assert.ok(doc.getNumberOfPages()>1);
 await writeFile(path.join(output,'alqami-invoice-long.pdf'),new Uint8Array(doc.output('arraybuffer')));
});
