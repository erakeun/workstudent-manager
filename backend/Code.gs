/**
 * 근로장학생 근무관리 V0.3.0
 * Google Sheet 원본을 보존하면서 TERM_ID로 학기 데이터를 분리한다.
 * 기존 배포본의 모든 action 계약을 유지한다.
 */
const APP_VERSION_ = "V0.3.0";
const INITIAL_TERM_ID_ = "2026-2";
const INITIAL_TERM_NAME_ = "2026-2학기";

const SHEETS = {
  STUDENTS:"학생DB", SCHEDULES:"고정근무표", ABSENCES:"출근불가", SUBS:"대타신청",
  EXTRA:"추가근무", EXTRA_JOINS:"추가근무신청", NOTICES:"공지사항",
  PUBLIC_NOTICES:"첫화면공지", HOLIDAYS:"휴일", EVENTS:"운영이벤트", BUDGETS:"예산",
  SETTINGS:"설정", TERMS:"학기", TERM_SETTINGS:"학기설정"
};

const HEADERS = {};
HEADERS[SHEETS.STUDENTS] = ["STUDENT_KEY","STUDENT_ID","NAME","PHONE","LOGIN_PIN","WORK_TYPE","DEPARTMENT","ACTIVE","ADMIN_MEMO","STUDENT_COLOR","TERM_ID"];
HEADERS[SHEETS.SCHEDULES] = ["SCHEDULE_ID","STUDENT_KEY","STUDENT_ID","NAME","WORK_TYPE","PERIOD_TYPE","DAY","START","END","LUNCH_ALLOWED","ACTIVE","TERM_ID"];
HEADERS[SHEETS.ABSENCES] = ["ABSENCE_ID","CREATED_AT","STUDENT_KEY","STUDENT_ID","NAME","DATE","START","END","REASON","NOTE","STATUS","SUBSTITUTE_KEY","SUBSTITUTE_ID","SUBSTITUTE_NAME","TERM_ID"];
HEADERS[SHEETS.SUBS] = ["APP_ID","ABSENCE_ID","STUDENT_KEY","STUDENT_ID","NAME","APPLIED_AT","STATUS","DECIDED_AT","TERM_ID"];
HEADERS[SHEETS.EXTRA] = ["SHIFT_ID","TITLE","DATE","START","END","CAPACITY","DESCRIPTION","STATUS","CREATED_AT","TERM_ID"];
HEADERS[SHEETS.EXTRA_JOINS] = ["JOIN_ID","SHIFT_ID","STUDENT_KEY","STUDENT_ID","NAME","APPLIED_AT","STATUS","TERM_ID"];
HEADERS[SHEETS.NOTICES] = ["NOTICE_ID","DATE","TITLE","CONTENT","LINK","ACTIVE","CREATED_AT","TERM_ID"];
HEADERS[SHEETS.PUBLIC_NOTICES] = ["PUBLIC_NOTICE_ID","DATE","TITLE","CONTENT","LINK","ACTIVE","CREATED_AT","TERM_ID"];
HEADERS[SHEETS.HOLIDAYS] = ["HOLIDAY_ID","DATE","NAME","ACTIVE","SOURCE","TERM_ID"];
HEADERS[SHEETS.EVENTS] = ["EVENT_ID","DATE","TITLE","MESSAGE","LEVEL","SHOW_PUBLIC","ACTIVE","CREATED_AT","TERM_ID"];
HEADERS[SHEETS.BUDGETS] = ["WORK_TYPE","TOTAL_BUDGET","NOTE","TERM_ID"];
HEADERS[SHEETS.SETTINGS] = ["KEY","VALUE"];
HEADERS[SHEETS.TERMS] = ["TERM_ID","YEAR","TERM_TYPE","TERM_NAME","START_DATE","END_DATE","STATUS","CREATED_AT"];
HEADERS[SHEETS.TERM_SETTINGS] = ["TERM_ID","KEY","VALUE"];

const TERM_DATA_SHEETS_ = [SHEETS.STUDENTS,SHEETS.SCHEDULES,SHEETS.ABSENCES,SHEETS.SUBS,SHEETS.EXTRA,SHEETS.EXTRA_JOINS,SHEETS.NOTICES,SHEETS.PUBLIC_NOTICES,SHEETS.HOLIDAYS,SHEETS.EVENTS,SHEETS.BUDGETS];
const STUDENT_COLORS = ["#D9EAF7","#FCE2C4","#DDF1E0","#F7DCE8","#E5E0F7","#FFF0B8","#D8F0EE","#E8E2D4","#DDE5FF","#F5D8D0"];
const TERM_SETTING_KEYS_ = [
  "SYSTEM_NAME","TERM_NAME","SEMESTER_START","CLASS_END","MAKEUP_DATE","SEMESTER_END","BREAK_START","BREAK_END",
  "SHORT_START","SHORT_END","NORMAL_START_TIME","NORMAL_END_TIME","SHORT_START_TIME","SHORT_END_TIME",
  "SEMESTER_WEEK_LIMIT","BREAK_WEEK_LIMIT","WAGE_2026","WAGE_2027","STUDENT_HOME_MESSAGE","STUDENT_NO_WORK_MESSAGE",
  "HANDOVER_PDF_LABEL","HANDOVER_PDF_URL","DONATION_LINK_LABEL","DONATION_LINK_URL","LANDING_TITLE","LANDING_DESCRIPTION"
];
let REQUEST_ROWS_CACHE_ = {};

function setupSystem(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(name=>ensureSheet_(ss,name,HEADERS[name]));
  ensureStudentSchema_();migrateTerms();
  if(!rowsForTerm_(SHEETS.BUDGETS,activeTermId_()).length){
    appendObject_(SHEETS.BUDGETS,{WORK_TYPE:"국가",TOTAL_BUDGET:"0",NOTE:"미확정이면 0 사용 가능",TERM_ID:activeTermId_()});
    appendObject_(SHEETS.BUDGETS,{WORK_TYPE:"교내",TOTAL_BUDGET:"0",NOTE:"미확정이면 0 사용 가능",TERM_ID:activeTermId_()});
  }
  SpreadsheetApp.getActive().toast("V0.3.0 학기 분리 구성이 완료됐습니다.");
}

/** 기존 행은 삭제/이동하지 않고 TERM_ID만 빈 셀에 채우는 멱등 마이그레이션. */
function migrateTerms(){
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    REQUEST_ROWS_CACHE_={};const ss=SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(HEADERS).forEach(name=>ensureSheet_(ss,name,HEADERS[name]));ensureStudentSchema_();
    let terms=rows_(SHEETS.TERMS),activeId=setting_("ACTIVE_TERM_ID");
    if(!terms.length){
      const legacyName=setting_("TERM_NAME")||INITIAL_TERM_NAME_,inferred=inferTermId_(legacyName)||INITIAL_TERM_ID_;
      activeId=inferred;
      appendObject_(SHEETS.TERMS,{TERM_ID:inferred,YEAR:inferred.slice(0,4),TERM_TYPE:inferred.slice(5),TERM_NAME:legacyName,START_DATE:setting_("SEMESTER_START")||"2026-09-01",END_DATE:setting_("BREAK_END")||setting_("SEMESTER_END")||"2027-02-28",STATUS:"ACTIVE",CREATED_AT:now_()});
      terms=rows_(SHEETS.TERMS);
    }
    if(!activeId||!terms.some(x=>x.TERM_ID===activeId))activeId=(terms.find(x=>x.STATUS==="ACTIVE")||terms[0]).TERM_ID;
    upsertSetting_("ACTIVE_TERM_ID",activeId);
    const active=terms.find(x=>x.TERM_ID===activeId)||terms[0];upsertSetting_("TERM_NAME",active.TERM_NAME);
    TERM_DATA_SHEETS_.forEach(name=>backfillTermId_(name,activeId));
    if(!rows_(SHEETS.TERM_SETTINGS).some(x=>x.TERM_ID===activeId)){
      TERM_SETTING_KEYS_.forEach(key=>appendObject_(SHEETS.TERM_SETTINGS,{TERM_ID:activeId,KEY:key,VALUE:setting_(key)}));
    }
    return "기존 데이터가 "+activeId+" 학기로 안전하게 인식되었습니다.";
  }finally{lock.releaseLock();}
}

function doGet(e){
  REQUEST_ROWS_CACHE_={};
  try{ensureTermSchema_();const p=e&&e.parameter?e.parameter:{},result=route_(String(p.action||""),p);return output_(result,p.callback);}
  catch(err){return output_({ok:false,error:String(err&&err.message?err.message:err)},e&&e.parameter?e.parameter.callback:"");}
}

function route_(action,p){
  switch(action){
    case "studentLogin":return studentLogin_(p);case "adminLogin":return adminLogin_(p);
    case "getPublicHome":return getPublicHome_();case "getStudentDashboard":return getStudentDashboard_(p);case "getAdminDashboard":return getAdminDashboard_(p);
    case "createTerm":return createTerm_(p);case "activateTerm":return activateTerm_(p);
    case "createAbsence":return createAbsence_(p);case "cancelAbsence":return cancelAbsence_(p);case "deleteAbsence":return deleteAbsence_(p);
    case "applySubstitute":return applySubstitute_(p);case "approveSubstitute":return approveSubstitute_(p);case "rejectSubstitute":return rejectSubstitute_(p);case "deleteSubstitute":return deleteSubstitute_(p);
    case "upsertStudent":return upsertStudent_(p);case "deleteStudent":return deleteStudent_(p);case "addSchedule":return addSchedule_(p);case "deleteSchedule":return deleteSchedule_(p);
    case "createExtraShift":return createExtraShift_(p);case "deleteExtraShift":return deleteExtraShift_(p);case "applyExtraShift":return applyExtraShift_(p);case "deleteExtraJoin":return deleteExtraJoin_(p);
    case "createPublicNotice":return createPublicNotice_(p);case "deletePublicNotice":return deletePublicNotice_(p);case "createNotice":return createNotice_(p);case "deleteNotice":return deleteNotice_(p);
    case "saveSettings":return saveSettings_(p);case "saveBudget":return saveBudget_(p);case "upsertHoliday":return upsertHoliday_(p);case "deleteHoliday":return deleteHoliday_(p);case "upsertEvent":return upsertEvent_(p);case "deleteEvent":return deleteEvent_(p);
    default:throw new Error("지원하지 않는 action이야: "+action);
  }
}

function output_(obj,callback){const json=JSON.stringify(obj);if(callback){if(!/^[A-Za-z_$][0-9A-Za-z_$.]*$/.test(callback))throw new Error("callback 형식 오류");return ContentService.createTextOutput(callback+"("+json+");").setMimeType(ContentService.MimeType.JAVASCRIPT);}return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);}

function studentLogin_(p){return{ok:true,student:authStudent_(p.studentId,p.loginPin||p.last4)};}
function adminLogin_(p){authAdmin_(p.pin);return{ok:true};}
function authAdmin_(pin){if(String(pin||"")!==String(setting_("ADMIN_PIN")||""))throw new Error("관리자 PIN이 맞지 않아.");}
function authStudent_(studentId,pin){
  if(!studentId||!pin)throw new Error("학번과 로그인 PIN을 입력해줘.");
  const s=rowsForTerm_(SHEETS.STUDENTS,activeTermId_()).find(x=>String(x.STUDENT_ID)===String(studentId)&&String(x.LOGIN_PIN||x.PHONE_LAST4||"")===String(pin)&&x.ACTIVE==="Y");
  if(!s)throw new Error("현재 학기의 학번 또는 로그인 PIN을 확인해줘.");return s;
}

function getPublicHome_(){
  const cache=CacheService.getScriptCache(),key="PUBLIC_HOME_V030",cached=cache.get(key);if(cached)return JSON.parse(cached);
  const termId=activeTermId_(),s=settingsObject_(termId),result={ok:true,version:APP_VERSION_,activeTermId:termId,terms:termRows_().map(publicTerm_),settings:{SYSTEM_NAME:s.SYSTEM_NAME||"근로장학생 근무관리",TERM_NAME:s.TERM_NAME||"",LANDING_TITLE:s.LANDING_TITLE||"한양대학교 ERICA\n근로장학생 관리 시스템",LANDING_DESCRIPTION:s.LANDING_DESCRIPTION||"Google Sheet를 원본 DB로 사용하는 근로장학생 관리 시스템.",HANDOVER_PDF_LABEL:s.HANDOVER_PDF_LABEL||"근로장학생 업무 인수인계서 보기",HANDOVER_PDF_URL:s.HANDOVER_PDF_URL||""},notices:rowsForTerm_(SHEETS.PUBLIC_NOTICES,termId).filter(x=>x.ACTIVE==="Y").sort((a,b)=>String(a.DATE).localeCompare(String(b.DATE))).slice(0,12)};
  cache.put(key,JSON.stringify(result),60);return result;
}
function getAdminDashboard_(p){
  authAdmin_(p.pin);const activeId=activeTermId_(),termId=validTermId_(p.termId||activeId);
  return{ok:true,students:rowsForTerm_(SHEETS.STUDENTS,termId),schedules:rowsForTerm_(SHEETS.SCHEDULES,termId),absences:rowsForTerm_(SHEETS.ABSENCES,termId),substitutes:rowsForTerm_(SHEETS.SUBS,termId),extraShifts:rowsForTerm_(SHEETS.EXTRA,termId),extraJoins:rowsForTerm_(SHEETS.EXTRA_JOINS,termId),notices:rowsForTerm_(SHEETS.NOTICES,termId),publicNotices:rowsForTerm_(SHEETS.PUBLIC_NOTICES,termId),holidays:rowsForTerm_(SHEETS.HOLIDAYS,termId),events:rowsForTerm_(SHEETS.EVENTS,termId),budgets:rowsForTerm_(SHEETS.BUDGETS,termId),settings:settingsObject_(termId),terms:termRows_().map(publicTerm_),activeTermId:activeId,selectedTermId:termId,readOnly:termId!==activeId,backendVersion:APP_VERSION_};
}
function getStudentDashboard_(p){
  const s=authStudent_(p.studentId,p.loginPin||p.last4),termId=activeTermId_();
  return{ok:true,student:s,schedules:rowsForTerm_(SHEETS.SCHEDULES,termId).filter(x=>x.STUDENT_KEY===s.STUDENT_KEY&&x.ACTIVE==="Y"),absences:rowsForTerm_(SHEETS.ABSENCES,termId),substitutes:rowsForTerm_(SHEETS.SUBS,termId),extraShifts:rowsForTerm_(SHEETS.EXTRA,termId),extraJoins:rowsForTerm_(SHEETS.EXTRA_JOINS,termId),notices:rowsForTerm_(SHEETS.NOTICES,termId),holidays:rowsForTerm_(SHEETS.HOLIDAYS,termId),events:rowsForTerm_(SHEETS.EVENTS,termId),settings:settingsObject_(termId),terms:termRows_().map(publicTerm_),activeTermId:termId};
}

function createTerm_(p){
  authAdmin_(p.pin);const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const year=String(p.year||""),type=String(p.termType||""),labels={"1":"1학기",summer:"여름학기","2":"2학기",winter:"겨울학기"},termId=year+"-"+type;
    if(!/^20\d{2}$/.test(year)||!labels[type]||!/^\d{4}-\d{2}-\d{2}$/.test(p.startDate||"")||!/^\d{4}-\d{2}-\d{2}$/.test(p.endDate||"")||p.startDate>p.endDate)throw new Error("학기 정보를 확인해줘.");
    if(termRows_().some(x=>x.TERM_ID===termId))throw new Error("동일한 학기가 이미 존재해.");
    const sourceId=validTermId_(p.copyFromTermId||activeTermId_()),name=year+"-"+labels[type];
    if(p.copySchedules==="Y"&&p.copyStudents!=="Y")throw new Error("근무표 복사에는 학생 기본정보 복사가 필요해.");
    appendObject_(SHEETS.TERMS,{TERM_ID:termId,YEAR:year,TERM_TYPE:type,TERM_NAME:name,START_DATE:p.startDate,END_DATE:p.endDate,STATUS:"INACTIVE",CREATED_AT:now_()});
    const base=p.copySettings==="Y"?settingsObject_(sourceId):defaultTermSettings_();base.TERM_NAME=name;base.SEMESTER_START=p.startDate;base.CLASS_END=p.endDate;base.MAKEUP_DATE="";base.SEMESTER_END=p.endDate;base.BREAK_START="";base.BREAK_END=p.endDate;base.SHORT_START="";base.SHORT_END="";
    TERM_SETTING_KEYS_.forEach(key=>appendObject_(SHEETS.TERM_SETTINGS,{TERM_ID:termId,KEY:key,VALUE:base[key]===undefined?"":base[key]}));
    if(p.copyStudents==="Y")rowsForTerm_(SHEETS.STUDENTS,sourceId).filter(x=>x.ACTIVE==="Y").forEach(x=>appendObject_(SHEETS.STUDENTS,Object.assign({},x,{TERM_ID:termId})));
    if(p.copySchedules==="Y"){
      rowsForTerm_(SHEETS.SCHEDULES,sourceId).filter(x=>x.ACTIVE==="Y").forEach(x=>appendObject_(SHEETS.SCHEDULES,Object.assign({},x,{SCHEDULE_ID:id_("S"),TERM_ID:termId})));
    }
    if(p.copyHolidays==="Y")rowsForTerm_(SHEETS.HOLIDAYS,sourceId).filter(x=>x.ACTIVE==="Y").forEach(x=>appendObject_(SHEETS.HOLIDAYS,Object.assign({},x,{HOLIDAY_ID:id_("H"),TERM_ID:termId})));
    ["국가","교내"].forEach(typeName=>appendObject_(SHEETS.BUDGETS,{WORK_TYPE:typeName,TOTAL_BUDGET:"0",NOTE:"새 학기 초기값",TERM_ID:termId}));
    clearPublicCache_();return{ok:true,termId:termId};
  }finally{lock.releaseLock();}
}

function activateTerm_(p){
  authAdmin_(p.pin);const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const termId=validTermId_(p.activateTermId),sh=getSheet_(SHEETS.TERMS),data=table_(sh),target=data.rows.find(x=>x.TERM_ID===termId);if(!target)throw new Error("학기를 찾을 수 없어.");
    data.rows.forEach(x=>{if(x.TERM_ID===termId)setCellByHeader_(sh,x.__ROW_NUMBER,data.headers,"STATUS","ACTIVE");else if(x.STATUS==="ACTIVE")setCellByHeader_(sh,x.__ROW_NUMBER,data.headers,"STATUS","ARCHIVED");});
    upsertSetting_("ACTIVE_TERM_ID",termId);upsertSetting_("TERM_NAME",target.TERM_NAME);
    const settings=settingsObject_(termId);TERM_SETTING_KEYS_.forEach(key=>{if(key!=="TERM_NAME")upsertSetting_(key,settings[key]||"");});
    clearPublicCache_();return{ok:true,activeTermId:termId};
  }finally{lock.releaseLock();}
}

// ---------- ABSENCE / SUBSTITUTE ----------
function createAbsence_(p){
  const s=authStudent_(p.studentId,p.loginPin||p.last4),termId=activeTermId_(),start=normalizeTime_(p.start),end=normalizeTime_(p.end);assertActiveTerm_(termId);
  if(!p.date||!start||!end||timeMin_(start)>=timeMin_(end))throw new Error("날짜와 시간을 확인해줘.");
  const day=dayKo_(p.date),pt=periodType_(p.date,termId);if(!pt)throw new Error("현재 학기 운영기간 밖이야.");if(isHoliday_(p.date,termId))throw new Error("공휴일에는 고정근무가 없어.");
  const owns=rowsForTerm_(SHEETS.SCHEDULES,termId).some(x=>x.STUDENT_KEY===s.STUDENT_KEY&&x.ACTIVE==="Y"&&x.PERIOD_TYPE===pt&&x.DAY===day&&overlap_(x.START,x.END,start,end));if(!owns)throw new Error("본인의 고정근무와 겹치는 시간만 신청할 수 있어.");
  if(rowsForTerm_(SHEETS.ABSENCES,termId).some(x=>x.STUDENT_KEY===s.STUDENT_KEY&&x.DATE===p.date&&!['취소','삭제'].includes(x.STATUS)&&overlap_(x.START,x.END,start,end)))throw new Error("이미 겹치는 출근불가 신청이 있어.");
  appendObject_(SHEETS.ABSENCES,{ABSENCE_ID:id_("A"),CREATED_AT:now_(),STUDENT_KEY:s.STUDENT_KEY,STUDENT_ID:s.STUDENT_ID,NAME:s.NAME,DATE:p.date,START:start,END:end,REASON:p.reason||"개인 일정",NOTE:p.note||"",STATUS:"대타모집",SUBSTITUTE_KEY:"",SUBSTITUTE_ID:"",SUBSTITUTE_NAME:"",TERM_ID:termId});return{ok:true};
}
function cancelAbsence_(p){const s=authStudent_(p.studentId,p.loginPin||p.last4),termId=activeTermId_(),f=findRow_(SHEETS.ABSENCES,x=>x.ABSENCE_ID===p.absenceId&&x.STUDENT_KEY===s.STUDENT_KEY&&x.TERM_ID===termId);if(!f)throw new Error("신청을 찾을 수 없어.");if(f.row.STATUS==="대타확정")throw new Error("대타 확정 후에는 관리자에게 요청해줘.");setCellByHeader_(f.sh,f.rowNumber,f.headers,"STATUS","취소");return{ok:true};}
function deleteAbsence_(p){const termId=writeTermId_(p),f=findRow_(SHEETS.ABSENCES,x=>x.ABSENCE_ID===p.absenceId&&x.TERM_ID===termId);if(!f)throw new Error("건을 찾을 수 없어.");setCellByHeader_(f.sh,f.rowNumber,f.headers,"STATUS","삭제");updateWhere_(SHEETS.SUBS,x=>x.ABSENCE_ID===p.absenceId&&x.TERM_ID===termId,"STATUS","삭제");return{ok:true};}
function applySubstitute_(p){
  const s=authStudent_(p.studentId,p.loginPin||p.last4),termId=activeTermId_(),a=rowsForTerm_(SHEETS.ABSENCES,termId).find(x=>x.ABSENCE_ID===p.absenceId&&x.STATUS==="대타모집");if(!a)throw new Error("현재 대타 모집 중인 건이 아니야.");if(a.STUDENT_KEY===s.STUDENT_KEY)throw new Error("본인 결근에는 지원할 수 없어.");
  if(rowsForTerm_(SHEETS.SUBS,termId).some(x=>x.ABSENCE_ID===a.ABSENCE_ID&&x.STUDENT_KEY===s.STUDENT_KEY&&x.STATUS==="신청"))throw new Error("이미 신청했어.");
  if(rowsForTerm_(SHEETS.SCHEDULES,termId).some(x=>x.STUDENT_KEY===s.STUDENT_KEY&&x.ACTIVE==="Y"&&x.PERIOD_TYPE===periodType_(a.DATE,termId)&&x.DAY===dayKo_(a.DATE)&&overlap_(x.START,x.END,a.START,a.END)))throw new Error("같은 시간에 본인 고정근무가 있어.");
  appendObject_(SHEETS.SUBS,{APP_ID:id_("P"),ABSENCE_ID:a.ABSENCE_ID,STUDENT_KEY:s.STUDENT_KEY,STUDENT_ID:s.STUDENT_ID,NAME:s.NAME,APPLIED_AT:now_(),STATUS:"신청",DECIDED_AT:"",TERM_ID:termId});return{ok:true};
}
function approveSubstitute_(p){
  const termId=writeTermId_(p),sub=findRow_(SHEETS.SUBS,x=>x.APP_ID===p.appId&&x.TERM_ID===termId);if(!sub)throw new Error("신청을 찾을 수 없어.");const abs=findRow_(SHEETS.ABSENCES,x=>x.ABSENCE_ID===sub.row.ABSENCE_ID&&x.TERM_ID===termId);if(!abs||abs.row.STATUS!=="대타모집")throw new Error("이미 처리된 결근이야.");
  setCellByHeader_(sub.sh,sub.rowNumber,sub.headers,"STATUS","승인");setCellByHeader_(sub.sh,sub.rowNumber,sub.headers,"DECIDED_AT",now_());
  [["STATUS","대타확정"],["SUBSTITUTE_KEY",sub.row.STUDENT_KEY],["SUBSTITUTE_ID",sub.row.STUDENT_ID],["SUBSTITUTE_NAME",sub.row.NAME]].forEach(v=>setCellByHeader_(abs.sh,abs.rowNumber,abs.headers,v[0],v[1]));
  const sh=getSheet_(SHEETS.SUBS),d=table_(sh);d.rows.forEach(x=>{if(x.TERM_ID===termId&&x.ABSENCE_ID===sub.row.ABSENCE_ID&&x.APP_ID!==p.appId&&x.STATUS==="신청"){setCellByHeader_(sh,x.__ROW_NUMBER,d.headers,"STATUS","미선정");setCellByHeader_(sh,x.__ROW_NUMBER,d.headers,"DECIDED_AT",now_());}});return{ok:true};
}
function rejectSubstitute_(p){return setSubStatus_(p,"미선정");}function deleteSubstitute_(p){return setSubStatus_(p,"삭제");}
function setSubStatus_(p,status){const termId=writeTermId_(p),f=findRow_(SHEETS.SUBS,x=>x.APP_ID===p.appId&&x.TERM_ID===termId);if(!f)throw new Error("신청을 찾을 수 없어.");setCellByHeader_(f.sh,f.rowNumber,f.headers,"STATUS",status);setCellByHeader_(f.sh,f.rowNumber,f.headers,"DECIDED_AT",now_());return{ok:true};}

// ---------- STUDENTS / SCHEDULE ----------
function upsertStudent_(p){
  const termId=writeTermId_(p);if(!p.name)throw new Error("이름은 필수야.");ensureStudentSchema_();const sh=getSheet_(SHEETS.STUDENTS),d=table_(sh),i=p.studentKey?d.rows.findIndex(x=>x.STUDENT_KEY===p.studentKey&&x.TERM_ID===termId):-1,old=i>=0?d.rows[i]:null,digits=String(p.phone||"").replace(/\D/g,""),pin=String(p.loginPin||"").trim()||(old?String(old.LOGIN_PIN||old.PHONE_LAST4||""):digits.slice(-4)),color=String(p.studentColor||"").trim()||(old?old.STUDENT_COLOR:"")||nextStudentColor_(rowsForTerm_(SHEETS.STUDENTS,termId),old?old.STUDENT_KEY:"");
  if(!pin)throw new Error("로그인 PIN 또는 전화번호를 입력해줘.");if(p.studentId&&rowsForTerm_(SHEETS.STUDENTS,termId).some(x=>x.STUDENT_ID===p.studentId&&(!old||x.STUDENT_KEY!==old.STUDENT_KEY)))throw new Error("현재 학기에 동일 학번이 이미 있어.");
  const obj={STUDENT_KEY:old?old.STUDENT_KEY:id_("K"),STUDENT_ID:p.studentId||"",NAME:p.name,PHONE:p.phone||"",LOGIN_PIN:pin,WORK_TYPE:p.workType||"국가",DEPARTMENT:p.department||"",ACTIVE:p.active||"Y",ADMIN_MEMO:p.memo||"",STUDENT_COLOR:color,TERM_ID:termId};if(i<0)appendObject_(SHEETS.STUDENTS,obj);else HEADERS[SHEETS.STUDENTS].forEach(h=>setCellByHeader_(sh,old.__ROW_NUMBER,d.headers,h,obj[h]));
  const sc=getSheet_(SHEETS.SCHEDULES),sd=table_(sc);sd.rows.forEach(x=>{if(x.TERM_ID===termId&&x.STUDENT_KEY===obj.STUDENT_KEY){[["STUDENT_ID",obj.STUDENT_ID],["NAME",obj.NAME],["WORK_TYPE",obj.WORK_TYPE]].forEach(v=>setCellByHeader_(sc,x.__ROW_NUMBER,sd.headers,v[0],v[1]));}});return{ok:true};
}
function deleteStudent_(p){const termId=writeTermId_(p),f=findRow_(SHEETS.STUDENTS,x=>x.STUDENT_KEY===p.studentKey&&x.TERM_ID===termId);if(!f)throw new Error("학생을 찾을 수 없어.");setCellByHeader_(f.sh,f.rowNumber,f.headers,"ACTIVE","N");updateWhere_(SHEETS.SCHEDULES,x=>x.STUDENT_KEY===p.studentKey&&x.TERM_ID===termId,"ACTIVE","N");return{ok:true};}
function addSchedule_(p){const termId=writeTermId_(p),s=rowsForTerm_(SHEETS.STUDENTS,termId).find(x=>x.STUDENT_KEY===p.studentKey&&x.ACTIVE==="Y"),start=normalizeTime_(p.start),end=normalizeTime_(p.end);if(!s)throw new Error("학생을 찾을 수 없어.");if(!["학기중","방학중"].includes(p.periodType)||!["월","화","수","목","금"].includes(p.day)||!start||!end||timeMin_(start)<timeMin_("09:00")||timeMin_(end)>timeMin_("17:00")||timeMin_(start)>=timeMin_(end))throw new Error("기간·요일·시간을 확인해줘.");appendObject_(SHEETS.SCHEDULES,{SCHEDULE_ID:id_("S"),STUDENT_KEY:s.STUDENT_KEY,STUDENT_ID:s.STUDENT_ID,NAME:s.NAME,WORK_TYPE:s.WORK_TYPE,PERIOD_TYPE:p.periodType,DAY:p.day,START:start,END:end,LUNCH_ALLOWED:p.lunchAllowed||"N",ACTIVE:"Y",TERM_ID:termId});return{ok:true};}
function deleteSchedule_(p){const termId=writeTermId_(p),f=findRow_(SHEETS.SCHEDULES,x=>x.SCHEDULE_ID===p.scheduleId&&x.TERM_ID===termId);if(!f)throw new Error("근무시간을 찾을 수 없어.");setCellByHeader_(f.sh,f.rowNumber,f.headers,"ACTIVE","N");return{ok:true};}

// ---------- EXTRA WORK ----------
function createExtraShift_(p){const termId=writeTermId_(p),start=normalizeTime_(p.start),end=normalizeTime_(p.end);if(!p.title||!p.date||!start||!end||timeMin_(start)>=timeMin_(end))throw new Error("추가근무 정보를 확인해줘.");appendObject_(SHEETS.EXTRA,{SHIFT_ID:id_("X"),TITLE:p.title,DATE:p.date,START:start,END:end,CAPACITY:Number(p.capacity||1),DESCRIPTION:p.description||"",STATUS:"모집중",CREATED_AT:now_(),TERM_ID:termId});return{ok:true};}
function deleteExtraShift_(p){const termId=writeTermId_(p),f=findRow_(SHEETS.EXTRA,x=>x.SHIFT_ID===p.shiftId&&x.TERM_ID===termId);if(!f)throw new Error("추가근무를 찾을 수 없어.");setCellByHeader_(f.sh,f.rowNumber,f.headers,"STATUS","삭제");updateWhere_(SHEETS.EXTRA_JOINS,x=>x.SHIFT_ID===p.shiftId&&x.TERM_ID===termId,"STATUS","삭제");return{ok:true};}
function applyExtraShift_(p){const s=authStudent_(p.studentId,p.loginPin||p.last4),termId=activeTermId_(),sh=rowsForTerm_(SHEETS.EXTRA,termId).find(x=>x.SHIFT_ID===p.shiftId&&x.STATUS==="모집중");if(!sh)throw new Error("현재 모집 중인 추가근무가 아니야.");const joins=rowsForTerm_(SHEETS.EXTRA_JOINS,termId).filter(x=>x.SHIFT_ID===sh.SHIFT_ID&&x.STATUS==="신청");if(joins.some(x=>x.STUDENT_KEY===s.STUDENT_KEY))throw new Error("이미 신청했어.");if(joins.length>=Number(sh.CAPACITY))throw new Error("모집 인원이 찼어.");appendObject_(SHEETS.EXTRA_JOINS,{JOIN_ID:id_("J"),SHIFT_ID:sh.SHIFT_ID,STUDENT_KEY:s.STUDENT_KEY,STUDENT_ID:s.STUDENT_ID,NAME:s.NAME,APPLIED_AT:now_(),STATUS:"신청",TERM_ID:termId});return{ok:true};}
function deleteExtraJoin_(p){const termId=writeTermId_(p),f=findRow_(SHEETS.EXTRA_JOINS,x=>x.JOIN_ID===p.joinId&&x.TERM_ID===termId);if(!f)throw new Error("신청을 찾을 수 없어.");setCellByHeader_(f.sh,f.rowNumber,f.headers,"STATUS","삭제");return{ok:true};}

// ---------- NOTICES / SETTINGS / HOLIDAYS ----------
function createPublicNotice_(p){const termId=writeTermId_(p);if(!p.date||!p.title)throw new Error("첫 화면 공지는 날짜와 제목이 필수야.");appendObject_(SHEETS.PUBLIC_NOTICES,{PUBLIC_NOTICE_ID:id_("PN"),DATE:p.date,TITLE:p.title,CONTENT:p.content||"",LINK:p.link||"",ACTIVE:"Y",CREATED_AT:now_(),TERM_ID:termId});clearPublicCache_();return{ok:true};}
function deletePublicNotice_(p){const termId=writeTermId_(p),f=findRow_(SHEETS.PUBLIC_NOTICES,x=>x.PUBLIC_NOTICE_ID===p.publicNoticeId&&x.TERM_ID===termId);if(!f)throw new Error("첫 화면 공지를 찾을 수 없어.");setCellByHeader_(f.sh,f.rowNumber,f.headers,"ACTIVE","N");clearPublicCache_();return{ok:true};}
function createNotice_(p){const termId=writeTermId_(p);appendObject_(SHEETS.NOTICES,{NOTICE_ID:id_("N"),DATE:p.date||isoToday_(),TITLE:p.title||"공지",CONTENT:p.content||"",LINK:p.link||"",ACTIVE:"Y",CREATED_AT:now_(),TERM_ID:termId});return{ok:true};}
function deleteNotice_(p){const termId=writeTermId_(p),f=findRow_(SHEETS.NOTICES,x=>x.NOTICE_ID===p.noticeId&&x.TERM_ID===termId);if(!f)throw new Error("공지를 찾을 수 없어.");setCellByHeader_(f.sh,f.rowNumber,f.headers,"ACTIVE","N");return{ok:true};}
function saveSettings_(p){const termId=writeTermId_(p);TERM_SETTING_KEYS_.forEach(key=>{if(key!=="TERM_NAME"&&p[key]!==undefined)upsertTermSetting_(termId,key,p[key]);});if(termId===activeTermId_())TERM_SETTING_KEYS_.forEach(key=>{if(key!=="TERM_NAME"&&p[key]!==undefined)upsertSetting_(key,p[key]);});clearPublicCache_();return{ok:true};}
function saveBudget_(p){const termId=writeTermId_(p);setBudget_(termId,"국가",Math.max(0,Number(p.national||0)));setBudget_(termId,"교내",Math.max(0,Number(p.internal||0)));return{ok:true};}
function setBudget_(termId,type,value){const f=findRow_(SHEETS.BUDGETS,x=>x.TERM_ID===termId&&x.WORK_TYPE===type);if(!f)appendObject_(SHEETS.BUDGETS,{WORK_TYPE:type,TOTAL_BUDGET:value,NOTE:"관리자 입력",TERM_ID:termId});else{setCellByHeader_(f.sh,f.rowNumber,f.headers,"TOTAL_BUDGET",value);setCellByHeader_(f.sh,f.rowNumber,f.headers,"NOTE","관리자 입력");}}
function upsertHoliday_(p){const termId=writeTermId_(p);if(!p.date||!p.name)throw new Error("날짜와 휴일명을 입력해줘.");const f=p.holidayId?findRow_(SHEETS.HOLIDAYS,x=>x.HOLIDAY_ID===p.holidayId&&x.TERM_ID===termId):null,obj={HOLIDAY_ID:f?f.row.HOLIDAY_ID:id_("H"),DATE:p.date,NAME:p.name,ACTIVE:"Y",SOURCE:p.source||"관리자 입력",TERM_ID:termId};if(!f)appendObject_(SHEETS.HOLIDAYS,obj);else HEADERS[SHEETS.HOLIDAYS].forEach(h=>setCellByHeader_(f.sh,f.rowNumber,f.headers,h,obj[h]));return{ok:true};}
function deleteHoliday_(p){const termId=writeTermId_(p),f=findRow_(SHEETS.HOLIDAYS,x=>x.HOLIDAY_ID===p.holidayId&&x.TERM_ID===termId);if(!f)throw new Error("휴일을 찾을 수 없어.");setCellByHeader_(f.sh,f.rowNumber,f.headers,"ACTIVE","N");return{ok:true};}
function upsertEvent_(p){const termId=writeTermId_(p);if(!p.date||!p.title)throw new Error("이벤트 날짜와 제목은 필수야.");const f=p.eventId?findRow_(SHEETS.EVENTS,x=>x.EVENT_ID===p.eventId&&x.TERM_ID===termId):null,obj={EVENT_ID:f?f.row.EVENT_ID:id_("E"),DATE:p.date,TITLE:p.title,MESSAGE:p.message||"",LEVEL:p.level||"주의",SHOW_PUBLIC:p.showPublic||"Y",ACTIVE:"Y",CREATED_AT:f?f.row.CREATED_AT:now_(),TERM_ID:termId};if(!f)appendObject_(SHEETS.EVENTS,obj);else HEADERS[SHEETS.EVENTS].forEach(h=>setCellByHeader_(f.sh,f.rowNumber,f.headers,h,obj[h]));clearPublicCache_();return{ok:true};}
function deleteEvent_(p){const termId=writeTermId_(p),f=findRow_(SHEETS.EVENTS,x=>x.EVENT_ID===p.eventId&&x.TERM_ID===termId);if(!f)throw new Error("업무 이벤트를 찾을 수 없어.");setCellByHeader_(f.sh,f.rowNumber,f.headers,"ACTIVE","N");clearPublicCache_();return{ok:true};}

// ---------- TERM / DATE HELPERS ----------
function termRows_(){return rows_(SHEETS.TERMS);}
function activeTermId_(){const id=setting_("ACTIVE_TERM_ID"),terms=termRows_();return terms.some(x=>x.TERM_ID===id)?id:(terms.find(x=>x.STATUS==="ACTIVE")||terms[0]||{TERM_ID:INITIAL_TERM_ID_}).TERM_ID;}
function validTermId_(id){if(!id||!termRows_().some(x=>x.TERM_ID===id))throw new Error("학기를 찾을 수 없어.");return id;}
function assertActiveTerm_(termId){if(termId!==activeTermId_())throw new Error("과거 학기는 읽기 전용이야. 먼저 현재 운영 학기로 활성화해줘.");}
function writeTermId_(p){authAdmin_(p.pin);const id=validTermId_(p.termId||activeTermId_());assertActiveTerm_(id);return id;}
function publicTerm_(x){return{TERM_ID:x.TERM_ID,YEAR:x.YEAR,TERM_TYPE:x.TERM_TYPE,TERM_NAME:x.TERM_NAME,START_DATE:x.START_DATE,END_DATE:x.END_DATE,STATUS:x.STATUS,CREATED_AT:x.CREATED_AT};}
function inferTermId_(name){const m=String(name||"").match(/(20\d{2})\s*[-년 ]\s*(1|2|여름|겨울)/);if(!m)return"";return m[1]+"-"+({여름:"summer",겨울:"winter"}[m[2]]||m[2]);}
function rowsForTerm_(name,termId){return rows_(name).filter(x=>x.TERM_ID===termId);}
function defaultTermSettings_(){return{SYSTEM_NAME:"근로장학생 근무관리",TERM_NAME:"",SEMESTER_START:"",CLASS_END:"",MAKEUP_DATE:"",SEMESTER_END:"",BREAK_START:"",BREAK_END:"",SHORT_START:"",SHORT_END:"",NORMAL_START_TIME:"09:00",NORMAL_END_TIME:"17:00",SHORT_START_TIME:"10:00",SHORT_END_TIME:"17:00",SEMESTER_WEEK_LIMIT:"20",BREAK_WEEK_LIMIT:"30",WAGE_2026:"0",WAGE_2027:"0",STUDENT_HOME_MESSAGE:"오늘의 업무와 본인 근무 일정을 확인해줘.",STUDENT_NO_WORK_MESSAGE:"오늘은 정규 근무가 없어.",HANDOVER_PDF_LABEL:"근로장학생 업무 인수인계서 보기",HANDOVER_PDF_URL:"",DONATION_LINK_LABEL:"업무 관리 시트",DONATION_LINK_URL:"",LANDING_TITLE:"한양대학교 ERICA\n근로장학생 관리 시스템",LANDING_DESCRIPTION:"Google Sheet를 원본 DB로 사용하는 근로장학생 관리 시스템."};}
function settingsObject_(termId){const out={};rows_(SHEETS.SETTINGS).forEach(x=>out[x.KEY]=x.VALUE);rows_(SHEETS.TERM_SETTINGS).filter(x=>x.TERM_ID===termId).forEach(x=>out[x.KEY]=x.VALUE);const term=termRows_().find(x=>x.TERM_ID===termId);if(term){out.TERM_NAME=term.TERM_NAME;out.ACTIVE_TERM_ID=activeTermId_();}return out;}
function upsertTermSetting_(termId,key,value){const f=findRow_(SHEETS.TERM_SETTINGS,x=>x.TERM_ID===termId&&x.KEY===key);if(!f)appendObject_(SHEETS.TERM_SETTINGS,{TERM_ID:termId,KEY:key,VALUE:value});else setCellByHeader_(f.sh,f.rowNumber,f.headers,"VALUE",value);}
function periodType_(date,termId){const s=settingsObject_(termId);if(date>=s.SEMESTER_START&&date<=s.SEMESTER_END)return"학기중";if(s.BREAK_START&&date>=s.BREAK_START&&date<=s.BREAK_END)return"방학중";return"";}
function isHoliday_(date,termId){return rowsForTerm_(SHEETS.HOLIDAYS,termId).some(x=>x.DATE===date&&x.ACTIVE==="Y");}
function dayKo_(date){return["일","월","화","수","목","금","토"][new Date(date+"T00:00:00").getDay()];}
function normalizeTime_(v){const m=String(v||"").trim().match(/^(\d{1,2}):(\d{2})$/);if(!m)return"";const h=Number(m[1]),min=Number(m[2]);return h>=0&&h<=23&&min>=0&&min<=59?String(h).padStart(2,"0")+":"+String(min).padStart(2,"0"):"";}
function timeMin_(v){const t=normalizeTime_(v);if(!t)return NaN;const a=t.split(":").map(Number);return a[0]*60+a[1];}
function overlap_(a1,a2,b1,b2){const values=[timeMin_(a1),timeMin_(a2),timeMin_(b1),timeMin_(b2)];return!values.some(Number.isNaN)&&values[0]<values[3]&&values[2]<values[1];}

// ---------- SAFE, ADDITIVE SCHEMA MIGRATION ----------
function ensureTermSchema_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();Object.keys(HEADERS).forEach(name=>ensureSheet_(ss,name,HEADERS[name]));ensureStudentSchema_();REQUEST_ROWS_CACHE_={};
  const missingTerms=!rows_(SHEETS.TERMS).length||!setting_("ACTIVE_TERM_ID"),missingIds=TERM_DATA_SHEETS_.some(name=>rows_(name).some(x=>!x.TERM_ID));if(missingTerms||missingIds)migrateTerms();
}
function ensureSheet_(ss,name,headers){
  let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);
  if(sh.getLastRow()===0){sh.getRange(1,1,1,headers.length).setValues([headers]);styleHeader_(sh,headers.length);return sh;}
  const current=sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getDisplayValues()[0];let changed=false;headers.forEach(h=>{if(current.indexOf(h)<0){current.push(h);sh.getRange(1,current.length).setValue(h);changed=true;}});if(changed)styleHeader_(sh,current.length);return sh;
}
function styleHeader_(sh,count){sh.getRange(1,1,1,count).setFontWeight("bold").setBackground("#16794b").setFontColor("#ffffff");sh.setFrozenRows(1);}
function backfillTermId_(name,termId){const sh=getSheet_(name),last=sh.getLastRow();if(last<2)return;const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0],col=headers.indexOf("TERM_ID")+1;if(!col)return;const range=sh.getRange(2,col,last-1,1),values=range.getDisplayValues();let changed=false;values.forEach(r=>{if(!r[0]){r[0]=termId;changed=true;}});if(changed)range.setValues(values);clearRequestCache_(name);}
function ensureStudentSchema_(){
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.STUDENTS);if(!sh||sh.getLastRow()<1)return;let headers=sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getDisplayValues()[0],pin=headers.indexOf("LOGIN_PIN")+1,old=headers.indexOf("PHONE_LAST4")+1;if(!pin&&old)sh.getRange(1,old).setValue("LOGIN_PIN");
  headers=sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getDisplayValues()[0];let color=headers.indexOf("STUDENT_COLOR")+1;if(!color){color=headers.length+1;sh.getRange(1,color).setValue("STUDENT_COLOR");}
  if(sh.getLastRow()>1){const range=sh.getRange(2,color,sh.getLastRow()-1,1),values=range.getDisplayValues();let changed=false;values.forEach((r,i)=>{if(!r[0]){r[0]=STUDENT_COLORS[i%STUDENT_COLORS.length];changed=true;}});if(changed)range.setValues(values);}
}

// ---------- SHEET HELPERS ----------
function getSheet_(name){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);if(!sh)throw new Error(name+" 시트가 없어. setupSystem()을 먼저 실행해줘.");return sh;}
function table_(sh){const lastRow=sh.getLastRow(),lastCol=sh.getLastColumn();if(lastRow<1||lastCol<1)return{headers:[],rows:[]};const values=sh.getRange(1,1,lastRow,lastCol).getDisplayValues(),headers=values[0],rows=[];values.slice(1).forEach((r,rowIndex)=>{if(!r.some(v=>v!==""))return;const o={};Object.defineProperty(o,"__ROW_NUMBER",{value:rowIndex+2});headers.forEach((h,i)=>o[h]=r[i]);rows.push(o);});return{headers:headers,rows:rows};}
function rows_(name){if(Object.prototype.hasOwnProperty.call(REQUEST_ROWS_CACHE_,name))return REQUEST_ROWS_CACHE_[name];return REQUEST_ROWS_CACHE_[name]=table_(getSheet_(name)).rows;}
function clearRequestCache_(name){if(name)delete REQUEST_ROWS_CACHE_[name];else REQUEST_ROWS_CACHE_={};}
function appendObject_(name,obj){const sh=getSheet_(name),headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];sh.appendRow(headers.map(h=>obj[h]===undefined?"":obj[h]));clearRequestCache_(name);clearPublicCache_();}
function setCellByHeader_(sh,row,headers,header,value){const col=headers.indexOf(header)+1;if(col<=0)throw new Error(header+" 컬럼이 없어.");sh.getRange(row,col).setValue(value);clearRequestCache_(sh.getName());clearPublicCache_();}
function findRow_(name,predicate){const sh=getSheet_(name),d=table_(sh),index=d.rows.findIndex(predicate);return index<0?null:{sh:sh,headers:d.headers,index:index,rowNumber:d.rows[index].__ROW_NUMBER,row:d.rows[index]};}
function updateWhere_(name,predicate,header,value){const sh=getSheet_(name),d=table_(sh);d.rows.forEach(x=>{if(predicate(x))setCellByHeader_(sh,x.__ROW_NUMBER,d.headers,header,value);});}
function setting_(key){const row=rows_(SHEETS.SETTINGS).find(x=>x.KEY===key);return row?row.VALUE:"";}
function upsertSetting_(key,value){const f=findRow_(SHEETS.SETTINGS,x=>x.KEY===key);if(!f)appendObject_(SHEETS.SETTINGS,{KEY:key,VALUE:value});else setCellByHeader_(f.sh,f.rowNumber,f.headers,"VALUE",value);}
function nextStudentColor_(students,currentKey){const used={};(students||[]).forEach(s=>{if(s.STUDENT_KEY!==currentKey&&s.ACTIVE!=="N"&&s.STUDENT_COLOR)used[String(s.STUDENT_COLOR).toUpperCase()]=true;});return STUDENT_COLORS.find(c=>!used[c.toUpperCase()])||STUDENT_COLORS[(students||[]).length%STUDENT_COLORS.length];}
function id_(prefix){return prefix+"_"+Utilities.getUuid().slice(0,8);}function now_(){return Utilities.formatDate(new Date(),Session.getScriptTimeZone()||"Asia/Seoul","yyyy-MM-dd HH:mm:ss");}function isoToday_(){return Utilities.formatDate(new Date(),Session.getScriptTimeZone()||"Asia/Seoul","yyyy-MM-dd");}
function clearPublicCache_(){try{CacheService.getScriptCache().remove("PUBLIC_HOME_V030");CacheService.getScriptCache().remove("PUBLIC_HOME_V027");}catch(e){}}
