const reportGroupLabels={day:'يومي',week:'أسبوعي - يبدأ السبت',month:'شهري',year:'سنوي'};
let reportRun=0;
function baghdadToday(){return new Date(Date.now()+3*3600000).toISOString().slice(0,10)}
function reportPreset(kind){
 const today=baghdadToday(),date=new Date(today+'T00:00:00Z'),year=date.getUTCFullYear(),month=date.getUTCMonth();
 const iso=d=>d.toISOString().slice(0,10);
 if(kind==='day')return {from:today,to:today,group:'day'};
 if(kind==='week'){const first=new Date(date);first.setUTCDate(first.getUTCDate()-(first.getUTCDay()+1)%7);const last=new Date(first);last.setUTCDate(last.getUTCDate()+6);return {from:iso(first),to:iso(last),group:'day'}}
 if(kind==='year')return {from:year+'-01-01',to:year+'-12-31',group:'month'};
 return {from:iso(new Date(Date.UTC(year,month,1))),to:iso(new Date(Date.UTC(year,month+1,0))),group:'day'};
}
function reportQuery(filters){return new URLSearchParams({from:filters.from,to:filters.to,group:filters.group}).toString()}
function reportsPane(p){
 if(!state.reportFilters)state.reportFilters={...reportPreset('month'),preset:'month',archive:'active'};
 const f=state.reportFilters;
 p.innerHTML='<form id="reportForm" class="card"><div class="flex between"><div><h3>تقارير المبيعات والفواتير</h3><p class="muted">اختر الفترة، راجع العدادات، وحمّل تقرير PDF.</p></div><button type="button" class="btn alt" id="exportReport" disabled>تحميل التقرير PDF</button></div><div class="report-filters">'+select('preset','الفترة',f.preset,[['day','اليوم'],['week','هذا الأسبوع - السبت إلى الجمعة'],['month','هذا الشهر'],['year','هذه السنة'],['custom','فترة أختارها']])+field('from','من تاريخ',f.from,'date','required')+field('to','إلى تاريخ',f.to,'date','required')+select('group','تجميع الجدول',f.group,Object.entries(reportGroupLabels))+'<button class="btn" id="showReport">عرض التقرير</button></div></form><div class="note">الأوقات بتوقيت بغداد، والتصنيف حسب تاريخ إنشاء الطلب. المبيعات تشمل المكتمل فقط؛ المؤكد والمنتظر والمرفوض والملغي لا يدخلون بقيمة المبيعات. صافي مبيعات المنتجات بعد الخصم ودون التوصيل ليس صافي الربح.</div><div id="reportResults"></div><div class="card"><div class="flex between"><div><h3>فواتير الفترة</h3><p class="muted">PDF يتولد عند التحميل على جهازك. الأرشفة ترتب القائمة وتحافظ على الطلب والتقرير.</p></div><label>عرض الفواتير<select id="invoiceArchive"><option value="active">غير المؤرشفة</option><option value="archived">المؤرشفة</option><option value="all">الكل</option></select></label></div><div id="invoiceResults"></div></div>';
 $('#invoiceArchive').value=f.archive;
 $('#reportForm [name=preset]').onchange=ev=>{const value=ev.target.value;if(value!=='custom'){const dates=reportPreset(value);for(const k of ['from','to','group'])$('#reportForm [name='+k+']').value=dates[k]}};
 for(const k of ['from','to'])$('#reportForm [name='+k+']').onchange=()=>{$('#reportForm [name=preset]').value='custom'};
 $('#reportForm').onsubmit=ev=>{ev.preventDefault();const values=Object.fromEntries(new FormData(ev.target));state.reportFilters={...state.reportFilters,...values};loadReports()};
 $('#reportForm').oninput=()=>{$('#exportReport').disabled=true};
 $('#invoiceArchive').onchange=ev=>{state.reportFilters.archive=ev.target.value;loadInvoiceList(1)};
 $('#exportReport').onclick=()=>{try{if(!state.reportData)throw Error('اعرض التقرير أولاً');if(!window.AlqamiInvoice?.downloadReport)throw Error('جاري تحميل أداة PDF؛ حاول بعد لحظات.');window.AlqamiInvoice.downloadReport(state.reportData)}catch(err){toast(err.message)}};
 loadReports();
}
function metricCard(label,value,color=''){return '<div class="card metric '+color+'"><span class="muted">'+e(label)+'</span><strong>'+e(value)+'</strong></div>'}
async function loadReports(){
 const run=++reportRun,button=$('#showReport'),out=$('#reportResults');if(!out)return;
 button.disabled=true;$('#exportReport').disabled=true;state.reportData=null;out.innerHTML='<p class="muted">جاري احتساب التقرير...</p>';
 try{const result=await api('/api/admin/reports?'+reportQuery(state.reportFilters));if(run!==reportRun||state.tab!=='reports')return;state.reportData=result.report;const {summary:s,buckets}=result.report;
 out.innerHTML='<div class="report-metrics">'+metricCard('كل الطلبات',s.total_orders)+metricCard('مستلمة / مكتملة',s.received,'positive')+metricCard('مرفوضة',s.rejected)+metricCard('ملغاة',s.cancelled)+metricCard('منتظرة / مؤكدة',s.pending+s.confirmed)+metricCard('قيمة المكتمل شامل التوصيل',money(s.sales_total),'positive')+metricCard('مبيعات المنتجات بعد الخصم',money(s.net_products))+metricCard('أجور توصيل المكتمل',money(s.delivery))+'</div><div class="card"><h3>تفاصيل الفترة حسب التجميع</h3><div class="table-scroll"><table><thead><tr><th>الفترة</th><th>كل الطلبات</th><th>مستلمة</th><th>مرفوضة</th><th>ملغاة</th><th>قيد المعالجة</th><th>قيمة المكتمل</th></tr></thead><tbody>'+buckets.map(b=>'<tr><td>'+e(b.period)+'</td><td>'+b.total_orders+'</td><td>'+b.received+'</td><td>'+b.rejected+'</td><td>'+b.cancelled+'</td><td>'+(b.pending+b.confirmed)+'</td><td>'+money(b.sales_total)+'</td></tr>').join('')+(buckets.length?'':'<tr><td colspan="7">لا توجد طلبات خلال الفترة المختارة.</td></tr>')+'</tbody><tfoot><tr><th>المجموع</th><th>'+s.total_orders+'</th><th>'+s.received+'</th><th>'+s.rejected+'</th><th>'+s.cancelled+'</th><th>'+(s.pending+s.confirmed)+'</th><th>'+money(s.sales_total)+'</th></tr></tfoot></table></div><p class="muted">مجموع التخفيضات على المكتمل: '+money(s.discounts)+'</p></div>';
 $('#exportReport').disabled=false;await loadInvoiceList(1);
 }catch(err){if(run===reportRun&&state.tab==='reports')out.innerHTML='<p class="note">'+e(err.message)+'</p>'}
 finally{if(run===reportRun&&button.isConnected)button.disabled=false}
}
let invoiceRun=0;
async function loadInvoiceList(page=1){
 const box=$('#invoiceResults');if(!box)return;const run=++invoiceRun;box.innerHTML='<p class="muted">جاري تحميل الفواتير...</p>';
 try{const params=reportQuery(state.reportFilters)+'&archive='+state.reportFilters.archive+'&page='+page,result=await api('/api/admin/invoices?'+params);if(run!==invoiceRun||state.tab!=='reports')return;
 let previousDate='';const rows=result.invoices.map(o=>{let head='';if(o.invoice_date!==previousDate){previousDate=o.invoice_date;head='<tr class="invoice-date-row"><td colspan="5">'+e(o.invoice_date)+'</td></tr>'}return head+'<tr><td>'+e(o.id.slice(0,8))+'</td><td>'+e(o.customer_name)+'</td><td><span class="status-badge '+e(o.status)+'">'+e(orderStatuses[o.status]||o.status)+'</span></td><td>'+money(o.total)+'</td><td><div class="order-actions"><button class="btn alt" data-invoice="'+e(o.id)+'">تحميل PDF</button><button class="btn alt" data-archive-invoice="'+e(o.id)+'" data-archived="'+(o.invoice_archived?1:0)+'">'+(o.invoice_archived?'استعادة':'أرشفة')+'</button></div></td></tr>'}).join('');
 const pages=Math.max(1,Math.ceil(result.total/result.page_size));box.innerHTML='<p class="muted">'+result.total+' فاتورة ضمن الفلتر</p><div class="table-scroll"><table><thead><tr><th>الطلب</th><th>الزبون</th><th>الحالة</th><th>الإجمالي</th><th>الإجراءات</th></tr></thead><tbody>'+rows+(rows?'':'<tr><td colspan="5">لا توجد فواتير ضمن هذا الفلتر.</td></tr>')+'</tbody></table></div><div class="flex between" style="margin-top:15px"><button class="btn alt" id="invoicePrev" '+(page<=1?'disabled':'')+'>السابق</button><span>صفحة '+page+' / '+pages+'</span><button class="btn alt" id="invoiceNext" '+(page>=pages?'disabled':'')+'>التالي</button></div>';
 state.invoicePage=page;$('#invoicePrev').onclick=()=>loadInvoiceList(page-1);$('#invoiceNext').onclick=()=>loadInvoiceList(page+1);
 $$('[data-invoice]').forEach(b=>b.onclick=()=>downloadInvoice(b.dataset.invoice,b));$$('[data-archive-invoice]').forEach(b=>b.onclick=()=>archiveInvoice(b.dataset.archiveInvoice,Number(b.dataset.archived)===0,b));
 }catch(err){if(run===invoiceRun&&box.isConnected)box.innerHTML='<p class="note">'+e(err.message)+'</p>'}
}
async function archiveInvoice(id,archived,button){
 button.disabled=true;
 try{await api('/api/admin/orders/'+encodeURIComponent(id)+'/invoice-archive',{method:'PATCH',body:JSON.stringify({archived})});const o=state.orders.find(x=>x.id===id);if(o)o.invoice_archived=archived?1:0;toast(archived?'تمت أرشفة الفاتورة؛ الطلب والمبيعات محفوظة.':'تمت استعادة الفاتورة');if(state.tab==='reports')await loadInvoiceList(1);else render()}
 catch(err){toast(err.message);button.disabled=false}
}
