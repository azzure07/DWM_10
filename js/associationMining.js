export function mineRules(rows,columnA,columnB,minConfidence=.4,minLift=1){
 if(!columnA||!columnB||columnA===columnB)return [];
 const total=rows.length;const A=[...new Set(rows.map(r=>String(r[columnA]??'(blank)')))];const B=[...new Set(rows.map(r=>String(r[columnB]??'(blank)')))];const rules=[];
 for(const a of A)for(const b of B){const both=rows.filter(r=>String(r[columnA]??'(blank)')===a&&String(r[columnB]??'(blank)')===b).length;const ac=rows.filter(r=>String(r[columnA]??'(blank)')===a).length;const bc=rows.filter(r=>String(r[columnB]??'(blank)')===b).length;if(!ac||!bc)continue;const support=both/total,confidence=both/ac,lift=confidence/(bc/total);if(confidence>=minConfidence&&lift>=minLift)rules.push({Rule:`${a} → ${b}`,Support:(support*100).toFixed(2)+'%',Confidence:(confidence*100).toFixed(2)+'%',Lift:lift.toFixed(2),Antecedent:columnA,Consequent:columnB,Strength:lift>=1.5?'Strong':lift>1?'Positive':'Neutral'});}return rules.sort((a,b)=>Number(b.Lift)-Number(a.Lift));
}
