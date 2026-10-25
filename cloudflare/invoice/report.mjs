import {jsPDF} from 'jspdf';
import font from './fonts/Amiri-Regular.ttf';

const money=n=>Number(n||0).toLocaleString('en-US')+' د.ع';
const groups={day:'يومي',week:'أسبوعي - السبت إلى الجمعة',month:'شهري',year:'سنوي'};
export function createSalesReport(report){
 const {range,summary:s,buckets}=report;
 if(!range||!s||!Array.isArray(buckets))throw Error('بيانات التقرير غير مكتملة');
 for(const key of ['total_orders','received','rejected','cancelled','pending','confirmed','gross_products','discounts','delivery','net_products','sales_total']){
  if(!Number.isSafeInteger(s[key])||s[key]<0||buckets.some(b=>!Number.isSafeInteger(b[key])||b[key]<0)||buckets.reduce((sum,b)=>sum+b[key],0)!==s[key])throw Error('مجاميع التقرير غير متطابقة؛ أعد عرض التقرير.');
 }
 const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
 doc.addFileToVFS('Amiri-Regular.ttf',font);doc.addFont('Amiri-Regular.ttf','Amiri','normal');doc.setFont('Amiri');
 doc.setProperties({title:'تقرير مبيعات العلقمي '+range.from+' - '+range.to,author:'مجموعة العلقمي',creator:'Alalqami Store'});
 const navy='#102d56',muted='#6c82a2';
 function text(v,x,y,size=11,color=navy,align='right'){const label=String(v??'');doc.setFontSize(size);doc.setTextColor(color);doc.text(label,x,y,{align,isInputVisual:false,isOutputVisual:true,isInputRtl:/[\u0600-\u06ff]/.test(label),isOutputRtl:false,isSymmetricSwapping:true});}
 function header(){doc.setFillColor(navy);doc.rect(0,0,210,31,'F');text('مجموعة العلقمي',194,15,23,'#ffffff');text('تقرير المبيعات والطلبات',194,25,12,'#b8e7f7');text('AL-ALQAMI / SALES REPORT',16,18,9,'#ffffff','left');}
 function tableHeader(y){doc.setFillColor(navy);doc.roundedRect(16,y,178,12,2,2,'F');[['الفترة',190],['الطلبات',148],['مستلمة',126],['مرفوضة',107],['ملغاة',89],['قيد المعالجة',69],['قيمة المكتمل',45]].forEach(([v,x])=>text(v,x,y+8,9,'#ffffff',x===190||x===45?'right':'center'));return y+14;}
 function page(){doc.addPage();header();text(range.from+' - '+range.to,194,42,10,muted);return tableHeader(48);}
 header();text('الفترة: '+range.from+' إلى '+range.to,194,43,12);text('التجميع: '+groups[range.group],194,51,11,muted);
 const stats=[['كل الطلبات',s.total_orders],['مستلمة / مكتملة',s.received],['مرفوضة',s.rejected],['ملغاة',s.cancelled],['منتظرة / مؤكدة',s.pending+s.confirmed],['قيمة المكتمل شامل التوصيل',money(s.sales_total)]];
 stats.forEach(([label,value],i)=>{const column=i%3,row=Math.floor(i/3),x=16+column*61;doc.setFillColor('#f2f7fc');doc.roundedRect(x,59+row*22,56,19,2,2,'F');text(label,x+52,66+row*22,9,muted);text(value,x+52,74+row*22,12);});
 text('مبيعات المنتجات بعد الخصم: '+money(s.net_products)+' | أجور التوصيل: '+money(s.delivery),194,112,11);
 text('إجمالي التخفيضات على الطلبات المكتملة: '+money(s.discounts),194,120,10,muted);
 let y=tableHeader(128);
 if(!buckets.length){text('لا توجد طلبات خلال الفترة المختارة.',190,y+10,12,muted);y+=20;}
 for(let i=0;i<buckets.length;i++){
  const b=buckets[i];if(y+9>264)y=page();doc.setFillColor(i%2?'#f2f7fc':'#ffffff');doc.rect(16,y,178,9,'F');
  [[b.period,190,'right'],[b.total_orders,148,'center'],[b.received,126,'center'],[b.rejected,107,'center'],[b.cancelled,89,'center'],[b.pending+b.confirmed,69,'center'],[money(b.sales_total),45,'right']].forEach(([v,x,a])=>text(v,x,y+6.5,10,navy,a));y+=9;
 }
 if(y+13>264)y=page();
 doc.setFillColor('#e5f6ec');doc.roundedRect(16,y+2,178,12,2,2,'F');
 [['المجموع',190,'right'],[s.total_orders,148,'center'],[s.received,126,'center'],[s.rejected,107,'center'],[s.cancelled,89,'center'],[s.pending+s.confirmed,69,'center'],[money(s.sales_total),45,'right']].forEach(([v,x,a])=>text(v,x,y+10,10,'#14754d',a));
 const count=doc.getNumberOfPages();
 for(let p=1;p<=count;p++){doc.setPage(p);doc.setDrawColor('#dce6f5');doc.line(16,275,194,275);text('التصنيف حسب تاريخ إنشاء الطلب بتوقيت بغداد. المبيعات للمكتمل فقط، وليست صافي الربح.',194,282,8,muted);text(p+' / '+count,16,289,8,muted,'left');text('لا تتأثر المبيعات بأرشفة الفواتير.',194,289,8,muted);}
 return {doc,filename:'Alqami-Sales-'+range.from+'-'+range.to+'.pdf'};
}
export function downloadReport(report){const {doc,filename}=createSalesReport(report);doc.save(filename);}
