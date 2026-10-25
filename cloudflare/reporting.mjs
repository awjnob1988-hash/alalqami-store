const DAY=86400000;
const sqlTime=ms=>new Date(ms).toISOString().slice(0,19).replace('T',' ');
const localTime="datetime(created_at,'+3 hours')";
const groups={
 day:`date(${localTime})`,
 week:`date(${localTime},'-'||((CAST(strftime('%w',${localTime}) AS INTEGER)+1)%7)||' days')`,
 month:`strftime('%Y-%m',${localTime})`,
 year:`strftime('%Y',${localTime})`,
};

export function reportRange(params){
 const from=params.get('from'),to=params.get('to'),group=params.get('group')||'day';
 function date(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw Error('اختر تاريخ بداية ونهاية صحيحين');
  const ms=Date.parse(value+'T00:00:00Z');
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value)throw Error('التاريخ غير صحيح');
  return ms;
 }
 const start=date(from),end=date(to);
 if(start>end)throw Error('تاريخ النهاية لازم يكون بعد البداية أو نفس اليوم');
 if(end-start>3660*DAY)throw Error('اختار فترة لا تتجاوز عشر سنوات');
 if(!Object.hasOwn(groups,group))throw Error('نوع تجميع التقرير غير صحيح');
 return {from,to,group,startUTC:sqlTime(start-3*3600000),endUTC:sqlTime(end+DAY-3*3600000),timezone:'Asia/Baghdad',date_basis:'created_at'};
}

const metrics=`COUNT(*) AS total_orders,
 COALESCE(SUM(CASE WHEN status='fulfilled' THEN 1 ELSE 0 END),0) AS received,
 COALESCE(SUM(CASE WHEN status='cancelled' AND cancel_reason='rejected' THEN 1 ELSE 0 END),0) AS rejected,
 COALESCE(SUM(CASE WHEN status='cancelled' AND cancel_reason!='rejected' THEN 1 ELSE 0 END),0) AS cancelled,
 COALESCE(SUM(CASE WHEN status='new' THEN 1 ELSE 0 END),0) AS pending,
 COALESCE(SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END),0) AS confirmed,
 COALESCE(SUM(CASE WHEN status='fulfilled' THEN subtotal ELSE 0 END),0) AS gross_products,
 COALESCE(SUM(CASE WHEN status='fulfilled' THEN product_discount+coupon_discount ELSE 0 END),0) AS discounts,
 COALESCE(SUM(CASE WHEN status='fulfilled' THEN delivery_fee ELSE 0 END),0) AS delivery,
 COALESCE(SUM(CASE WHEN status='fulfilled' THEN subtotal-product_discount-coupon_discount ELSE 0 END),0) AS net_products,
 COALESCE(SUM(CASE WHEN status='fulfilled' THEN total ELSE 0 END),0) AS sales_total`;

export async function readReport(db,params){
 const range=reportRange(params),where='created_at>=? AND created_at<?';
 const [summary,buckets]=await db.batch([
  db.prepare(`SELECT ${metrics} FROM orders WHERE ${where}`).bind(range.startUTC,range.endUTC),
  db.prepare(`SELECT ${groups[range.group]} AS period,${metrics} FROM orders WHERE ${where} GROUP BY period ORDER BY period`).bind(range.startUTC,range.endUTC),
 ]);
 return {range,summary:summary.results[0],buckets:buckets.results,generated_at:new Date().toISOString()};
}

export function orderView(order){return {...order,status:order.status==='cancelled'&&order.cancel_reason==='rejected'?'rejected':order.status};}

export async function readInvoices(db,params){
 const range=reportRange(params),archive=params.get('archive')||'active',page=Number(params.get('page')||1),pageSize=25;
 if(!['active','archived','all'].includes(archive)||!Number.isSafeInteger(page)||page<1||page>100000)throw Error('خيارات عرض الفواتير غير صحيحة');
 const filter=archive==='all'?'':` AND invoice_archived=${archive==='archived'?1:0}`;
 const where='created_at>=? AND created_at<?'+filter;
 const [count,list]=await db.batch([
  db.prepare(`SELECT COUNT(*) AS total FROM orders WHERE ${where}`).bind(range.startUTC,range.endUTC),
  db.prepare(`SELECT id,customer_name,created_at,status,cancel_reason,total,invoice_archived,date(${localTime}) AS invoice_date FROM orders WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(range.startUTC,range.endUTC,pageSize,(page-1)*pageSize),
 ]);
 return {invoices:list.results.map(orderView),total:count.results[0].total,page,page_size:pageSize,archive,range};
}
