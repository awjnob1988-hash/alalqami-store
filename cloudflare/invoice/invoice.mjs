import { jsPDF } from 'jspdf';
import font from './fonts/Amiri-Regular.ttf';

const colors={navy:'#102d56',cyan:'#0488b4',ink:'#173759',muted:'#6c82a2',line:'#dce6f5',light:'#f2f7fc',green:'#14754d'};
const statuses={new:'بانتظار تأكيد التاجر',confirmed:'مؤكد من التاجر',fulfilled:'مكتمل',cancelled:'ملغي'};
const money=value=>Number(value||0).toLocaleString('en-US')+' د.ع';

export function createInvoice(order){
 const items=Array.isArray(order.items)?order.items:JSON.parse(order.items_json||'[]');
 if(!items.length)throw Error('لا توجد تفاصيل منتجات لهذه الفاتورة');
 for(const key of ['subtotal','product_discount','coupon_discount','delivery_fee','total'])if(!Number.isSafeInteger(Number(order[key]||0))||Number(order[key]||0)<0)throw Error('مبالغ الطلب غير صالحة');
 if(Number(order.subtotal)-Number(order.product_discount||0)-Number(order.coupon_discount||0)+Number(order.delivery_fee||0)!==Number(order.total))throw Error('مبالغ الطلب غير متطابقة؛ راجع بيانات الطلب');
 const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
 doc.addFileToVFS('Amiri-Regular.ttf',font);
 doc.addFont('Amiri-Regular.ttf','Amiri','normal');
 doc.setFont('Amiri');
 const invoiceId='ALQ-'+String(order.created_at||'').slice(0,10).replaceAll('-','')+'-'+String(order.id).slice(0,8).toUpperCase();
 doc.setProperties({title:'فاتورة مجموعة العلقمي '+invoiceId,subject:'Order '+order.id,author:'مجموعة العلقمي',creator:'Alalqami Store'});
 function text(value,x,y,size=11,color=colors.ink,align='right'){
  const label=String(value??'');
  doc.setFontSize(size);doc.setTextColor(color);doc.text(label,x,y,{align,isInputVisual:false,isOutputVisual:true,isInputRtl:/[\u0600-\u06ff]/.test(label),isOutputRtl:false,isSymmetricSwapping:true});
 }
 function wrap(value,width,size=11){doc.setFontSize(size);return doc.splitTextToSize(String(value||'—'),width)}
 function lines(value,x,y,width,size=11,color=colors.ink){const rows=wrap(value,width,size);rows.forEach((r,i)=>text(r,x,y+i*5,size,color));return rows.length*5}
 function pageHeader(first=false){
  doc.setFillColor(colors.navy);doc.rect(0,0,210,38,'F');
  text('مجموعة العلقمي',194,16,24,'#ffffff');
  text('للتجارة وفلاتر المياه',194,27,12,'#b8e7f7');
  text('AL-ALQAMI',16,16,13,'#ffffff','left');
  text('WATER PURITY / IRAQ',16,25,8,'#b8e7f7','left');
  if(!first){text('تابع الفاتورة',194,49,16);text(invoiceId,16,49,10,colors.muted,'left');}
 }
 function newPage(){doc.addPage();pageHeader();return 59}
 pageHeader(true);
 text(order.status==='fulfilled'?'فاتورة شراء':'فاتورة مبدئية',194,52,23);
 doc.setFillColor(order.status==='fulfilled'?'#e5f6ec':'#edf3fb');doc.roundedRect(16,43,66,12,3,3,'F');
 text(statuses[order.status]||order.status,77,51,11,order.status==='fulfilled'?colors.green:colors.ink);
 text(invoiceId,16,65,11,colors.cyan,'left');
 const date=new Date(String(order.created_at).replace(' ','T')+'Z');
 const dateLabel=Number.isNaN(date.getTime())?String(order.created_at||''):new Intl.DateTimeFormat('ar-IQ',{timeZone:'Asia/Baghdad',dateStyle:'medium',timeStyle:'short'}).format(date);
 text('تاريخ الطلب: '+dateLabel,194,65,10,colors.muted);
 const address=wrap(order.address,76,10);
 const customerRows=wrap(order.customer_name,76,11);
 const extra=Math.max(0,customerRows.length-1)*5;
 const cardY=73,cardH=Math.max(51,42+address.length*5+extra);
 doc.setFillColor(colors.light);doc.roundedRect(108,cardY,86,cardH,3,3,'F');doc.roundedRect(16,cardY,86,cardH,3,3,'F');
 text('بيانات المشتري',188,cardY+9,13,colors.cyan);
 customerRows.forEach((r,i)=>text(r,188,cardY+18+i*5,11));
 text('الهاتف: '+order.phone,188,cardY+25+extra,10);
 text('المحافظة: '+order.province,188,cardY+32+extra,10);
 address.forEach((r,i)=>text(r,188,cardY+39+extra+i*5,10,colors.muted));
 text('تفاصيل المتجر والدفع',96,cardY+9,13,colors.cyan);
 text('مجموعة العلقمي - كربلاء المقدسة',96,cardY+18,10);
 text('الدفع عند الاستلام',96,cardY+26,11);
 text('07706050050 / 07806050050',96,cardY+34,10);
 text('alalqami.filters@gmail.com',96,cardY+42,9,colors.muted);
 let y=cardY+cardH+10;
 function tableHeader(){doc.setFillColor(colors.navy);doc.roundedRect(16,y,178,12,2,2,'F');text('المنتج / البيان',189,y+8,10,'#ffffff');text('الكمية',105,y+8,10,'#ffffff','center');text('سعر الوحدة',90,y+8,10,'#ffffff');text('الإجمالي',49,y+8,10,'#ffffff');y+=14;}
 tableHeader();
 items.forEach((item,index)=>{
  const name=wrap(item.name,75,11),discount=Number(item.price)>Number(item.unit),height=Math.max(17,name.length*5+9+(discount?5:0));
  if(y+height>265){y=newPage();tableHeader();}
  doc.setFillColor(index%2?colors.light:'#ffffff');doc.rect(16,y,178,height,'F');
  name.forEach((r,i)=>text(r,189,y+7+i*5,11));
  if(discount)text('قبل التخفيض: '+money(item.price),189,y+7+name.length*5,9,colors.muted);
  text(item.qty,105,y+8,11,colors.ink,'center');text(money(item.unit),90,y+8,10);text(money(item.total),49,y+8,10);
  doc.setDrawColor(colors.line);doc.line(16,y+height,194,y+height);y+=height;
 });
 y+=9;
 const summary=[['مجموع المنتجات',Number(order.subtotal)],...(Number(order.product_discount)>0?[['تخفيض المنتجات',-Number(order.product_discount)]]:[]),...(Number(order.coupon_discount)>0?[['خصم الكوبون '+(order.coupon_code_snapshot||order.coupon_code||''),-Number(order.coupon_discount)]]:[]),['أجور التوصيل',Number(order.delivery_fee||0)]];
 const summaryH=summary.length*9+19;
 if(y+summaryH>269)y=newPage();
 doc.setFillColor(colors.light);doc.roundedRect(100,y,94,summaryH,3,3,'F');
 summary.forEach(([label,value],i)=>{text(label,189,y+8+i*9,10);text(money(value),105,y+8+i*9,10,colors.ink,'left');});
 const finalY=y+summary.length*9+2;doc.setFillColor(colors.navy);doc.roundedRect(100,finalY,94,15,2,2,'F');
 text('الإجمالي النهائي',189,finalY+10,12,'#ffffff');text(money(order.total),105,finalY+10,13,'#ffffff','left');
 lines('شكراً لثقتكم بمجموعة العلقمي.',92,y+9,75,12,colors.cyan);
 lines('تشمل الفاتورة المبالغ المسجلة للطلب. أجور التركيب، إن طلبت، تتفق عليها الإدارة بصورة منفصلة.',92,y+22,75,10,colors.muted);
 const count=doc.getNumberOfPages();
 for(let p=1;p<=count;p++){doc.setPage(p);doc.setDrawColor(colors.line);doc.line(16,280,194,280);text('مجموعة العلقمي | نقاء يليق بعائلتك',194,286,9,colors.muted);text(p+' / '+count,16,286,9,colors.muted,'left');}
 return {doc,filename:invoiceId+'.pdf'};
}

export function download(order){const {doc,filename}=createInvoice(order);doc.save(filename);}
