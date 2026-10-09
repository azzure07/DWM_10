let charts={};
const base={responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#aeb8c6',font:{size:10}}}},scales:{x:{ticks:{color:'#778397',font:{size:9}},grid:{color:'rgba(255,255,255,.04)'}},y:{ticks:{color:'#778397',font:{size:9}},grid:{color:'rgba(255,255,255,.04)'}}}};
function draw(id,type,labels,data,extra={}){if(charts[id])charts[id].destroy();const el=document.getElementById(id);if(!el||typeof Chart==='undefined')return;charts[id]=new Chart(el,{type,data:{labels,datasets:[{label:extra.label||'',data,backgroundColor:type==='doughnut'?['#7c5cff','#00d4a8','#ff5574','#ffb84d','#4ea5ff','#e879f9','#22d3ee']: 'rgba(124,92,255,.55)',borderColor:'#8f7cff',borderWidth:1,borderRadius:5}]},options:{...base,...(type==='doughnut'?{scales:{x:{display:false},y:{display:false}}}:{}),plugins:{...base.plugins}}})}
export function dashboardCharts(rows,schema){if(!rows?.length)return;const dims=schema?.categorical||Object.keys(rows[0]).filter(k=>typeof rows[0][k]==='string');const nums=schema?.numeric||Object.keys(rows[0]).filter(k=>Number.isFinite(Number(rows[0][k])));const d=dims[0],n=nums.find(x=>/amount|revenue|sales|price|total|value|cost|profit/i.test(x))||nums[0];if(d&&n){const g={};rows.forEach(r=>(g[r[d]]??=[]).push(r));draw('areaChart','bar',Object.keys(g).slice(0,12),Object.values(g).slice(0,12).map(a=>a.reduce((s,r)=>s+Number(r[n]||0),0)),{label:n})}else draw('areaChart','bar',[],[],{});const d2=dims[1]||dims[0];if(d2){const g={};rows.forEach(r=>(g[r[d2]]??=[]).push(r));draw('foodChart','bar',Object.keys(g).slice(0,12),Object.values(g).slice(0,12).map(a=>a.length),{label:'Records'})}else draw('foodChart','bar',[],[],{});const status=schema?.target&&dims.includes(schema.target)?schema.target:dims.find(x=>/status|outcome|class|label/i.test(x));if(status){const g={};rows.forEach(r=>(g[r[status]]??=0,g[r[status]]++));draw('statusChart','doughnut',Object.keys(g),Object.values(g))}}
export function olapChart(r){draw('olapChart','bar',r.chart?.labels||[],r.chart?.values||[],{label:'OLAP measure'})}
export function clusterChart(rows,xFeature,yFeature){
  const x=xFeature;
  const y=yFeature||xFeature;
  const ctx=document.getElementById('clusterChart');
  if(!ctx||typeof Chart==='undefined')return;
  if(charts.clusterChart)charts.clusterChart.destroy();

  const groups={};
  rows.forEach(r=>{
    if(r.Cluster===undefined||r.Cluster===null)return;
    (groups[r.Cluster]??=[]).push(r);
  });

  const colors=['#7c5cff','#00d4a8','#ffb84d','#ff5574','#4ea5ff','#e879f9','#22d3ee'];

  charts.clusterChart=new Chart(ctx,{
    type:'scatter',
    data:{
      datasets:Object.entries(groups).map(([c,a])=>({
        label:`Cluster ${Number(c)+1}`,
        data:a.map(r=>({x:Number(r[x]),y:Number(r[y])})),
        backgroundColor:colors[Number(c)%colors.length],
        borderColor:colors[Number(c)%colors.length],
        pointRadius:4,
        pointHoverRadius:7
      }))
    },
    options:{
      ...base,
      interaction:{mode:'nearest',intersect:false},
      plugins:{
        ...base.plugins,
        tooltip:{
          callbacks:{
            label:context=>`Cluster ${Number(context.dataset.label.replace('Cluster ',''))}: ${x} ${context.parsed.x}, ${y} ${context.parsed.y}`
          }
        }
      },
      scales:{
        x:{
          ...base.scales.x,
          title:{display:true,text:x,color:'#778397'}
        },
        y:{
          ...base.scales.y,
          title:{display:true,text:y,color:'#778397'}
        }
      }
    }
  });
}
