export function buildWarehouse(rows,schema){
  const dimensions=[];
  const dimensionColumns=[...schema.categorical,...schema.date];
  for(const col of dimensionColumns){
    const values=[...new Set(rows.map(r=>String(r[col]??'(blank)')))];
    const key=`${col.replace(/[^A-Za-z0-9]/g,'_')}ID`;
    const isDate=schema.date.includes(col);
    const dimRows=values.map((value,i)=>{const base={[key]:i+1,[col]:value};if(isDate&&!Number.isNaN(Date.parse(value))){const d=new Date(value);base.Year=d.getFullYear();base.Month=d.toLocaleString('en',{month:'long'});base.MonthNumber=d.getMonth()+1;base.Quarter=`Q${Math.floor(d.getMonth()/3)+1}`}return base});
    dimensions.push({name:`Dim_${col.replace(/\s+/g,'_')}`,sourceColumn:col,key,rows:dimRows});
  }
  const lookups=Object.fromEntries(dimensions.map(d=>[d.sourceColumn,new Map(d.rows.map(x=>[x[d.sourceColumn],x[d.key]]))]));
  const fact=rows.map((r,i)=>{const x={FactID:i+1};if(schema.id)x[schema.id]=r[schema.id];for(const d of dimensions)x[d.key]=lookups[d.sourceColumn].get(String(r[d.sourceColumn]??'(blank)'));for(const m of schema.numeric)x[m]=Number(r[m])||0;return x});
  return {dimensions,fact,measures:schema.numeric,sourceColumns:schema.columns.map(c=>c.name)};
}
