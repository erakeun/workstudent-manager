const assert=require('node:assert/strict'),model=require('../monthly-hours');
const d={selectedTermId:'T',activeTermId:'T',settings:{SEMESTER_START:'2026-10-01',SEMESTER_END:'2026-12-31',BREAK_END:'2026-12-31',WAGE_2026:'10320'},students:[{STUDENT_KEY:'A'},{STUDENT_KEY:'B'}],schedules:[{SCHEDULE_ID:'S',STUDENT_KEY:'A',ACTIVE:'Y',PERIOD_TYPE:'학기중',DAY:'목',START:'9:00',END:'12:00'}],monthlyCorrections:[]};
let row=()=>model.summarize(d,'2026-10')[0];assert.equal(row().baseMinutes,900);assert.equal(row().settlementAmount,154800);const padded=structuredClone(d);padded.schedules[0].START='09:00';assert.equal(model.summarize(padded,'2026-10')[0].baseMinutes,900);
function save(changes={}){const r=row(),p={studentKey:'A',month:'2026-10',mode:'OVERRIDE',minutes:r.appliedMinutes??60,expectedVersion:r.version,expectedBaseMinutes:r.baseMinutes,reason:'fixture',actorLabel:'관리자A',requestId:'TEST_'+String(r.version).padStart(8,'0'),...changes};const e=model.correctionEvent(d,p,{eventId:'E'+r.version,timestamp:'2026-10-01T03:00:00Z'});d.monthlyCorrections.push(e);return e;}
save({minutes:600,amountMode:'DIRECT',amount:'0'});assert.equal(row().baseAmount,154800);assert.equal(row().calculatedAmount,103200);assert.equal(row().settlementAmount,0);assert.equal(row().amountDirect,true);
save({minutes:630,amountMode:'KEEP'});assert.equal(row().settlementAmount,0);assert.equal(row().calculatedAmount,108360);
save({amountMode:'DIRECT',amount:'123456'});assert.equal(row().settlementAmount,123456);
assert.equal(model.summarize(d,'2026-11')[0].amountDirect,false);assert.equal(model.summarize(d,'2026-10')[1].settlementAmount,0);
for(const amount of ['','-1','1.5','Infinity','abc','9007199254740992'])assert.throws(()=>save({amountMode:'DIRECT',amount}),/최종 금액/);
assert.throws(()=>save({minutes:-1}),/총시간/);assert.throws(()=>save({expectedVersion:0}),/변경/);
save({mode:'BASE',amountMode:'DIRECT',amount:'9'});assert.equal(row().amountDirect,false);assert.equal(row().appliedMinutes,900);
d.schedules[0].START='bad';assert.equal(row().baseMinutes,null);const e=save({minutes:60,amountMode:'DIRECT',amount:'5000'});assert.equal(e.BASE_MINUTES,'');assert.equal(row().baseAmount,null);assert.equal(row().appliedMinutes,60);assert.equal(row().settlementAmount,5000);assert.equal(row().needsReview,true);
save({minutes:120,amountMode:'KEEP'});assert.equal(row().settlementAmount,5000);assert.equal(row().calculatedAmount,20640);
save({amountMode:'AUTO'});assert.equal(row().settlementAmount,20640);save({mode:'BASE'});assert.equal(row().appliedMinutes,null);assert.equal(row().settlementAmount,null);
const replay={studentKey:'A',month:'2026-10',mode:'OVERRIDE',minutes:60,amountMode:'DIRECT',amount:'5000'};assert.equal(model.replayMatches(e,replay),true);assert.equal(model.replayMatches(e,{...replay,amount:'5001'}),false);assert.equal(model.replayMatches(e,{...replay,amountMode:'KEEP'}),false);
console.log('monthly-final-amount: legacy time, zero/blank, priority, preservation, reset, invalid originals, isolation, conflict and replay passed');
