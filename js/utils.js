export const AREAS=['Kothrud','Baner','Wakad','Hinjewadi','Kharadi'];
export const FOODS=['Pizza','Burger','Biryani','Chinese','Dessert'];
export const PAYMENTS=['UPI','Cash','Card'];
export const STATUSES=['Delivered','Cancelled'];
export const money=n=>`₹${Math.round(Number(n)||0).toLocaleString('en-IN')}`;
export const avg=a=>a?.length?a.reduce((s,x)=>s+Number(x||0),0)/a.length:0;
export const sum=a=>(a||[]).reduce((s,x)=>s+Number(x||0),0);
export const mean=(rows,key)=>avg(rows.map(r=>r[key]).filter(v=>v!==null&&v!==undefined&&v!==''&&!Number.isNaN(Number(v))));
export const round=(n,d=2)=>Number(Number(n||0).toFixed(d));
export const groupBy=(rows,key)=>rows.reduce((m,r)=>{const v=r[key]??'(blank)';(m[v]??=[]).push(r);return m},{});
export const isBlank=v=>v===null||v===undefined||String(v).trim()==='';
export const numericValues=(rows,key)=>rows.map(r=>Number(r[key])).filter(Number.isFinite);
export const isNumericColumn=(rows,key)=>{const vals=rows.map(r=>r[key]).filter(v=>!isBlank(v));if(!vals.length)return false;return vals.filter(v=>Number.isFinite(Number(v))).length/vals.length>=.85};
export const uniqueCount=(rows,key)=>new Set(rows.map(r=>String(r[key]??''))).size;
export function csvDownload(rows,filename){if(!rows?.length)return false;const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))];const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;const csv=[cols.join(','),...rows.map(r=>cols.map(c=>esc(r[c])).join(','))].join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),100);return true}
export function toast(msg){const c=document.getElementById('toastContainer');if(!c)return;const el=document.createElement('div');el.className='toast';el.textContent=msg;c.appendChild(el);setTimeout(()=>el.remove(),2800)}
export function escapeHTML(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
export function tableHTML(rows,columns=rows?.length?Object.keys(rows[0]):[]){if(!rows?.length)return '<tbody><tr><td>No data</td></tr></tbody>';return `<thead><tr>${columns.map(c=>`<th>${escapeHTML(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${columns.map(c=>{const v=r[c];const cls=(String(c).toLowerCase().includes('status')&&v)?`<span class="badge ${String(v).toLowerCase().replace(/\s+/g,'-')}">${escapeHTML(v)}</span>`:escapeHTML(v);return `<td>${cls}</td>`}).join('')}</tr>`).join('')}</tbody>`}

export function inferSchema(rows){
  if(!rows?.length)return {columns:[],numeric:[],categorical:[],date:[],id:null,target:null};
  const columns=Object.keys(rows[0]);
  const info=columns.map(name=>{
    const vals=rows.map(r=>r[name]).filter(v=>!isBlank(v));
    const numeric=vals.length>0 && vals.filter(v=>Number.isFinite(Number(String(v).replace(/[,₹$€£%]/g,'')))).length/vals.length>=.85;
    const unique=new Set(vals.map(v=>String(v))).size;
    const samples=vals.slice(0,20);
    const dateLike=!numeric && samples.length>0 && samples.filter(v=>!Number.isNaN(Date.parse(v))).length/samples.length>=.8;
    return {name,type:numeric?'numeric':dateLike?'date':'categorical',missing:rows.length-vals.length,unique,ratio:unique/rows.length};
  });
  const aliases={id:['id','orderid','transactionid','transaction_id','invoice','invoiceid','receipt','number'],target:['status','orderstatus','outcome','target','label','class','cancelled','delivered']};
  const norm=x=>x.toLowerCase().replace(/[^a-z0-9]/g,'');
  const id=info.find(c=>aliases.id.includes(norm(c.name)))?.name || info.find(c=>/id|order|transaction|invoice/i.test(c.name))?.name || null;
  const target=info.find(c=>aliases.target.includes(norm(c.name)))?.name || info.find(c=>/status|outcome|target|label|class/i.test(c.name))?.name || null;
  return {columns:info,numeric:info.filter(c=>c.type==='numeric'&&c.name!==id).map(c=>c.name),categorical:info.filter(c=>c.type==='categorical'&&c.name!==id).map(c=>c.name),date:info.filter(c=>c.type==='date').map(c=>c.name),id,target};
}

export function parseCSV(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'){
      if(quoted&&next==='"'){field+='"';i++}else quoted=!quoted;
    }else if(ch===','&&!quoted){row.push(field);field=''}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(field);if(row.some(x=>String(x).trim()!==''))rows.push(row);row=[];field=''}
    else field+=ch;
  }
  row.push(field);if(row.some(x=>String(x).trim()!==''))rows.push(row);
  if(!rows.length)return [];
  const headers=rows[0].map((h,i)=>String(h||`Column_${i+1}`).trim()||`Column_${i+1}`);
  const seen={};const safeHeaders=headers.map(h=>{seen[h]=(seen[h]||0)+1;return seen[h]===1?h:`${h}_${seen[h]}`});
  return rows.slice(1).map(r=>Object.fromEntries(safeHeaders.map((h,i)=>[h,(r[i]??'').trim()])));
}
