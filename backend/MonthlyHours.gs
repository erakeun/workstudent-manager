/* Shared monthly schedule and settlement reference model. Keep backend/MonthlyHours.gs identical. */
var WorkMonthly = (() => {
  const ALL_DAYS=["일","월","화","수","목","금","토"];
  function parseDate(v){const d=new Date(`${v}T00:00:00`);return Number.isNaN(d.getTime())?null:d;}
  function isoDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
  function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
  function timeMin(t){const [h,m]=String(t||"00:00").split(":").map(Number);return h*60+(m||0);}
  function minTime(a,b){return timeMin(a)<=timeMin(b)?a:b;}
  function maxTime(a,b){return timeMin(a)>=timeMin(b)?a:b;}
  function overlap(a1,a2,b1,b2){return timeMin(a1)<timeMin(b2)&&timeMin(b1)<timeMin(a2);}
  function hoursBetween(a,b){return Math.max(0,(timeMin(b)-timeMin(a))/60);}
  function intervalHours(start,end,lunchAllowed="N"){
    let h=hoursBetween(start,end);
    if(lunchAllowed!=="Y" && overlap(start,end,"12:00","13:00")) h-=hoursBetween(maxTime(start,"12:00"),minTime(end,"13:00"));
    return Math.max(0,h);
  }
  function dataSettings(d){return d.settings||{};}
  function holidayFor(d,date){return (d.holidays||[]).find(h=>h.ACTIVE==="Y"&&h.DATE===date);}
  function isWeekend(date){const x=parseDate(date);return !x||x.getDay()===0||x.getDay()===6;}
  function periodType(d,date){const s=dataSettings(d);if(s.SEMESTER_START&&date>=s.SEMESTER_START&&date<=s.SEMESTER_END)return "학기중";if(s.BREAK_START&&date>=s.BREAK_START&&date<=s.BREAK_END)return "방학중";return "";}
  function workHours(d,date){const s=dataSettings(d),short=s.SHORT_START&&s.SHORT_END&&date>=s.SHORT_START&&date<=s.SHORT_END;return short?{mode:"단축근무",start:s.SHORT_START_TIME||"10:00",end:s.SHORT_END_TIME||"17:00"}:{mode:"정상근무",start:s.NORMAL_START_TIME||"09:00",end:s.NORMAL_END_TIME||"17:00"};}
  function effectiveInterval(d,schedule,date){
    if(schedule.ACTIVE!=="Y"||schedule.PERIOD_TYPE!==periodType(d,date)||holidayFor(d,date)||isWeekend(date))return null;
    const wd=ALL_DAYS[parseDate(date).getDay()];if(wd!==schedule.DAY)return null;
    const op=workHours(d,date),start=maxTime(schedule.START,op.start),end=minTime(schedule.END,op.end);if(timeMin(start)>=timeMin(end))return null;return {start,end,lunchAllowed:schedule.LUNCH_ALLOWED||"N",mode:op.mode};
  }
  function activeSchedulesForDate(d,date){return (d.schedules||[]).map(s=>({s,iv:effectiveInterval(d,s,date)})).filter(x=>x.iv);}
  function validAbsences(d,date){return (d.absences||[]).filter(a=>a.DATE===date&&!['취소','삭제'].includes(a.STATUS));}
  function dailyHoursLedger(d,date){
    const ledger={};const add=(key,h)=>{if(!key||h<=0)return;ledger[key]=(ledger[key]||0)+h;};
    activeSchedulesForDate(d,date).forEach(({s,iv})=>{
      let base=intervalHours(iv.start,iv.end,iv.lunchAllowed);const abs=validAbsences(d,date).filter(a=>a.STUDENT_KEY===s.STUDENT_KEY&&overlap(a.START,a.END,iv.start,iv.end));
      abs.forEach(a=>{
        const cut=intervalHours(maxTime(a.START,iv.start),minTime(a.END,iv.end),iv.lunchAllowed);base=Math.max(0,base-cut);
        if(a.STATUS==="대타확정"&&a.SUBSTITUTE_KEY)add(a.SUBSTITUTE_KEY,cut);
      });add(s.STUDENT_KEY,base);
    });
    (d.extraShifts||[]).filter(x=>x.STATUS==="모집중"&&x.DATE===date).forEach(sh=>{
      const h=intervalHours(sh.START,sh.END,"Y");(d.extraJoins||[]).filter(j=>j.SHIFT_ID===sh.SHIFT_ID&&j.STATUS==="신청").forEach(j=>add(j.STUDENT_KEY,h));
    });
    return ledger;
  }
  function validMonth(month){return /^20\d{2}-(0[1-9]|1[0-2])$/.test(String(month||""));}
  function baseMinutes(d,month){
    if(!validMonth(month))throw new Error("조회 월을 확인해줘.");
    const [y,m]=month.split("-").map(Number),last=new Date(y,m,0).getDate(),totals={};
    const invalid=new Set(),validTime=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t||"")),validInterval=x=>validTime(x.START)&&validTime(x.END)&&timeMin(x.START)<timeMin(x.END);
    const duplicateKeys=(items,id)=>{const seen=new Map();items.forEach(x=>{if(!x[id])return;const previous=seen.get(x[id]);if(previous){invalid.add(previous.STUDENT_KEY);invalid.add(x.STUDENT_KEY);if(previous.SUBSTITUTE_KEY)invalid.add(previous.SUBSTITUTE_KEY);if(x.SUBSTITUTE_KEY)invalid.add(x.SUBSTITUTE_KEY);}else seen.set(x[id],x);});};
    duplicateKeys((d.schedules||[]).filter(x=>x.ACTIVE==="Y"),"SCHEDULE_ID");
    duplicateKeys((d.absences||[]).filter(x=>!['취소','삭제'].includes(x.STATUS)&&String(x.DATE||"").slice(0,7)===month),"ABSENCE_ID");
    const joinSeen=new Set();(d.extraJoins||[]).filter(j=>j.STATUS==="신청"&&(d.extraShifts||[]).some(x=>x.SHIFT_ID===j.SHIFT_ID&&x.STATUS==="모집중"&&String(x.DATE||"").slice(0,7)===month)).forEach(j=>{const key=JSON.stringify([j.SHIFT_ID,j.STUDENT_KEY]);if(joinSeen.has(key))invalid.add(j.STUDENT_KEY);joinSeen.add(key);});
    const monthDates=Array.from({length:last},(_,i)=>`${month}-${String(i+1).padStart(2,"0")}`);
    (d.schedules||[]).filter(x=>x.ACTIVE==="Y"&&monthDates.some(date=>periodType(d,date)===x.PERIOD_TYPE)).forEach(x=>{if(!ALL_DAYS.includes(x.DAY)||!validInterval(x))invalid.add(x.STUDENT_KEY);});
    (d.absences||[]).filter(x=>!['취소','삭제'].includes(x.STATUS)&&String(x.DATE||"").slice(0,7)===month).forEach(x=>{if(!monthDates.includes(x.DATE)||!validInterval(x)){invalid.add(x.STUDENT_KEY);if(x.SUBSTITUTE_KEY)invalid.add(x.SUBSTITUTE_KEY);}});
    (d.extraShifts||[]).filter(x=>x.STATUS==="모집중"&&String(x.DATE||"").slice(0,7)===month).forEach(x=>{if(!monthDates.includes(x.DATE)||!validInterval(x))(d.extraJoins||[]).filter(j=>j.SHIFT_ID===x.SHIFT_ID&&j.STATUS==="신청").forEach(j=>invalid.add(j.STUDENT_KEY));});
    const settings=dataSettings(d),ledgerDates=monthDates.filter(date=>(!settings.SEMESTER_START||date>=settings.SEMESTER_START)&&(!settings.BREAK_END||date<=settings.BREAK_END));
    ledgerDates.forEach(date=>Object.entries(dailyHoursLedger(d,date)).forEach(([k,h])=>{if(!Number.isFinite(h))invalid.add(k);else totals[k]=(totals[k]||0)+h;}));
    Object.keys(totals).forEach(k=>totals[k]=Math.round(totals[k]*60));invalid.forEach(k=>totals[k]=null);return totals;
  }
  function rate(d,month){const text=String(dataSettings(d)[`WAGE_${month.slice(0,4)}`]??"").trim().replace(/,/g,"");return /^\d+(\.\d+)?$/.test(text)&&Number(text)>0&&Number.isFinite(Number(text))?Number(text):null;}
  function latest(rows,key,month,termId){return (rows||[]).filter(x=>x.STUDENT_KEY===key&&x.MONTH===month&&x.TERM_ID===termId).reduce((last,x)=>!last||Number(x.VERSION)>Number(last.VERSION)?x:last,null);}
  function summarize(d,month){
    const base=baseMinutes(d,month),wage=rate(d,month),termId=d.selectedTermId||d.activeTermId;
    return (d.students||[]).map(student=>{
      const correction=latest(d.monthlyCorrections,student.STUDENT_KEY,month,termId),minutes=Object.prototype.hasOwnProperty.call(base,student.STUDENT_KEY)?base[student.STUDENT_KEY]:0;
      const applied=correction&&correction.MODE!=="BASE"?Number(correction.AFTER_MINUTES):minutes;
      const invalid=correction&&(!["OVERRIDE","BASE"].includes(correction.MODE)||!/^\d+$/.test(String(correction.AFTER_MINUTES))||!Number.isSafeInteger(Number(correction.AFTER_MINUTES))||Number(correction.AFTER_MINUTES)<0||!/^\d+$/.test(String(correction.BASE_MINUTES))||!/^\d+$/.test(String(correction.VERSION))||Number(correction.VERSION)<1);
      const needsReview=!!(minutes===null||invalid||correction&&correction.MODE!=="BASE"&&Number(correction.BASE_MINUTES)!==minutes);
      return {student,baseMinutes:minutes,appliedMinutes:invalid?null:applied,correction,wage,needsReview,
        baseAmount:wage===null||minutes===null?null:minutes/60*wage,settlementAmount:wage===null||invalid||minutes===null?null:applied/60*wage,
        version:correction?Number(correction.VERSION):0,paymentConfirmed:false};
    });
  }
  function correctionEvent(d,p,meta){
    if(d.readOnly)throw new Error("과거 학기는 읽기 전용이야.");
    const month=String(p.month||"");if(!validMonth(month))throw new Error("조회 월을 확인해줘.");
    const term=(d.terms||[]).find(x=>x.TERM_ID===d.selectedTermId);
    if(term&&((term.START_DATE&&month<term.START_DATE.slice(0,7))||(term.END_DATE&&month>term.END_DATE.slice(0,7))))throw new Error("선택 학기 밖의 월은 보정할 수 없어.");
    const row=summarize(d,month).find(x=>x.student.STUDENT_KEY===p.studentKey);if(!row)throw new Error("학생을 찾을 수 없어.");
    if(row.baseMinutes===null)throw new Error("근무표 원본 시간에 오류가 있어. 원본을 확인해줘.");
    const reason=String(p.reason||"").trim(),label=String(p.actorLabel||"").trim();
    if(!reason||reason.length>500)throw new Error("보정 사유는 1~500자로 입력해줘.");
    if(!label||label.length>80)throw new Error("수정자 표시는 1~80자로 입력해줘.");
    if(!/^[A-Za-z0-9_-]{8,100}$/.test(String(p.requestId||"")))throw new Error("요청 식별자를 확인해줘.");
    if(!/^\d+$/.test(String(p.expectedVersion))||Number(p.expectedVersion)!==row.version||Number(p.expectedBaseMinutes)!==row.baseMinutes)throw new Error("근무표 또는 보정 이력이 변경됐어. 새로고침 후 다시 확인해줘.");
    if(!["OVERRIDE","BASE"].includes(p.mode))throw new Error("보정 방식을 확인해줘.");
    const minutes=p.mode==="BASE"?row.baseMinutes:Number(p.minutes);
    if(p.mode!=="BASE"&&(!/^\d+$/.test(String(p.minutes))||!Number.isSafeInteger(minutes)||minutes<0||minutes>new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate()*1440))throw new Error("월 총시간은 해당 월의 총 분 이내 정수로 입력해줘.");
    return {EVENT_ID:meta.eventId,REQUEST_ID:p.requestId,TERM_ID:d.selectedTermId,STUDENT_KEY:p.studentKey,MONTH:month,
      MODE:p.mode,BASE_MINUTES:row.baseMinutes,BEFORE_MINUTES:row.appliedMinutes===null?"확인 필요":row.appliedMinutes,AFTER_MINUTES:minutes,
      VERSION:row.version+1,REASON:reason,ACTOR_ROLE:"ADMIN",ACTOR_LABEL:label,MODIFIED_AT:meta.timestamp};
  }
  return {validMonth,baseMinutes,rate,latest,summarize,correctionEvent};
})();
if(typeof module!=="undefined"&&module.exports)module.exports=WorkMonthly;
