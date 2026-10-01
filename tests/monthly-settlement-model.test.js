const assert=require('node:assert/strict'),fs=require('node:fs');const model=require('../monthly-hours');
const d={selectedTermId:'2026-2',activeTermId:'2026-2',terms:[{TERM_ID:'2026-2',START_DATE:'2026-09-01',END_DATE:'2027-02-28'}],settings:{SEMESTER_START:'2026-09-01',SEMESTER_END:'2026-12-31',BREAK_START:'2027-01-01',BREAK_END:'2027-02-28',WAGE_2026:'10320',WAGE_2027:'10700'},students:[{STUDENT_KEY:'A',NAME:'학생A',WORK_TYPE:'국가',ACTIVE:'Y'},{STUDENT_KEY:'B',NAME:'학생B',WORK_TYPE:'교내',ACTIVE:'N'}],schedules:[{STUDENT_KEY:'A',ACTIVE:'Y',PERIOD_TYPE:'학기중',DAY:'월',START:'09:00',END:'12:00',LUNCH_ALLOWED:'N'}],absences:[],extraShifts:[],extraJoins:[],holidays:[],monthlyCorrections:[]};
let r=model.summarize(d,'2026-09')[0];assert.equal(r.baseMinutes,720);assert.equal(r.baseAmount,123840);
const p={studentKey:'A',month:'2026-09',mode:'OVERRIDE',minutes:600,expectedBaseMinutes:720,expectedVersion:0,requestId:'MODEL_0001',reason:'조기 퇴근 반영',actorLabel:'검토자A'};
const event=model.correctionEvent(d,p,{eventId:'EVENT1',timestamp:'2026-10-01T03:00:00Z'});d.monthlyCorrections.push(event);r=model.summarize(d,'2026-09')[0];assert.equal(r.appliedMinutes,600);assert.equal(r.settlementAmount,103200);assert.equal(r.needsReview,false);
assert.equal(model.summarize(d,'2026-10')[0].correction,null);
const savedAfter=event.AFTER_MINUTES;event.AFTER_MINUTES='';assert.equal(model.summarize(d,'2026-09')[0].settlementAmount,null);event.AFTER_MINUTES=savedAfter;
// Schedule change retains the explicit total once and calls out stale baseline.
d.holidays.push({DATE:'2026-09-07',ACTIVE:'Y'});r=model.summarize(d,'2026-09')[0];assert.equal(r.baseMinutes,540);assert.equal(r.appliedMinutes,600);assert.equal(r.needsReview,true);assert.throws(()=>model.correctionEvent(d,{...p,expectedVersion:1},{eventId:'E2',timestamp:'now'}),/변경/);
const reset=model.correctionEvent(d,{...p,mode:'BASE',expectedVersion:1,expectedBaseMinutes:540},{eventId:'E2',timestamp:'2026-10-01T04:00:00Z'});d.monthlyCorrections.push(reset);assert.equal(model.summarize(d,'2026-09')[0].appliedMinutes,540);
d.holidays=[];assert.equal(model.summarize(d,'2026-09')[0].appliedMinutes,720);assert.equal(model.summarize(d,'2026-09')[0].needsReview,false);
d.extraShifts=[{SHIFT_ID:'EDGE',DATE:'2027-02-28',START:'09:00',END:'10:00',STATUS:'모집중'}];d.extraJoins=[{SHIFT_ID:'EDGE',STUDENT_KEY:'B',STATUS:'신청'}];d.settings.BREAK_END='2027-02-27';assert.equal(model.summarize(d,'2027-02')[1].baseMinutes,0);d.extraShifts=[];d.extraJoins=[];d.settings.BREAK_END='2027-02-28';
assert.equal(model.rate(d,'2027-01'),10700);assert.equal(model.summarize(d,'2027-01')[0].baseMinutes,0);
d.schedules[0].START='bad';r=model.summarize(d,'2026-09')[0];assert.equal(r.baseMinutes,null);assert.equal(r.settlementAmount,null);assert.equal(r.needsReview,true);assert.throws(()=>model.correctionEvent(d,{...p,expectedVersion:2,expectedBaseMinutes:0},{eventId:'E3',timestamp:'now'}),/원본/);
d.schedules[0].START='09:00';d.schedules[0].END='09:01';assert.equal(model.summarize(d,'2026-09')[0].baseMinutes,4);
d.schedules[0].SCHEDULE_ID='S1';d.schedules.push({...d.schedules[0]});assert.equal(model.summarize(d,'2026-09')[0].baseMinutes,null);d.schedules.pop();
d.extraShifts=[{SHIFT_ID:'X1',DATE:'2026-09-01',START:'09:00',END:'10:00',STATUS:'모집중'}];d.extraJoins=[{SHIFT_ID:'X1',STUDENT_KEY:'A',STATUS:'신청'},{SHIFT_ID:'X1',STUDENT_KEY:'A',STATUS:'신청'}];assert.equal(model.summarize(d,'2026-09')[0].baseMinutes,null);
assert.equal(fs.readFileSync('monthly-hours.js','utf8'),fs.readFileSync('backend/MonthlyHours.gs','utf8'));
console.log('monthly-settlement-model: override once, stale baseline, restore follows schedule, year rate, malformed source and minute precision passed');
