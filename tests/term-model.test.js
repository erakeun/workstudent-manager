const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Range {
  constructor(sheet,row,col,numRows=1,numCols=1){Object.assign(this,{sheet,row,col,numRows,numCols});}
  getDisplayValues(){const out=[];for(let r=0;r<this.numRows;r++){const row=[];for(let c=0;c<this.numCols;c++)row.push(String(this.sheet.data[this.row-1+r]?.[this.col-1+c]??""));out.push(row);}return out;}
  setValues(values){values.forEach((row,r)=>row.forEach((value,c)=>this.setAt(r,c,value)));return this;}
  setValue(value){this.setAt(0,0,value);return this;}
  setAt(r,c,value){const rr=this.row-1+r,cc=this.col-1+c;while(this.sheet.data.length<=rr)this.sheet.data.push([]);while(this.sheet.data[rr].length<=cc)this.sheet.data[rr].push("");this.sheet.data[rr][cc]=value;}
  setFontWeight(){return this;} setBackground(){return this;} setFontColor(){return this;}
}
class Sheet {
  constructor(name,data=[]){this.name=name;this.data=data.map(r=>r.slice());}
  getName(){return this.name;} getLastRow(){let n=this.data.length;while(n&&this.data[n-1].every(v=>v===""||v===undefined))n--;return n;}
  getLastColumn(){return this.data.reduce((n,r)=>Math.max(n,r.length),0);}
  getRange(row,col,numRows,numCols){return new Range(this,row,col,numRows,numCols);}
  appendRow(row){this.data.push(row.slice());} setFrozenRows(){} autoResizeColumns(){}
}
class Spreadsheet {
  constructor(seed){this.sheets=new Map(Object.entries(seed).map(([name,data])=>[name,new Sheet(name,data)]));}
  getSheetByName(name){return this.sheets.get(name)||null;} insertSheet(name){const sh=new Sheet(name);this.sheets.set(name,sh);return sh;} toast(){}
}

function runtime(){
  const seed={
    "설정":[["KEY","VALUE"],["SYSTEM_NAME","근로장학생 근무관리"],["TERM_NAME","2026-2학기"],["ADMIN_PIN","1234"],["SEMESTER_START","2026-09-01"],["SEMESTER_END","2026-12-22"],["BREAK_END","2027-02-28"]],
    "학생DB":[["STUDENT_KEY","STUDENT_ID","NAME","PHONE","LOGIN_PIN","WORK_TYPE","DEPARTMENT","ACTIVE","ADMIN_MEMO","STUDENT_COLOR"],["K01","20260001","학생A","010-0000-1111","1111","국가","학과","Y","기존 메모","#D9EAF7"]],
    "고정근무표":[["SCHEDULE_ID","STUDENT_KEY","STUDENT_ID","NAME","WORK_TYPE","PERIOD_TYPE","DAY","START","END","LUNCH_ALLOWED","ACTIVE"],["S1","K01","20260001","학생A","국가","학기중","월","09:00","12:00","N","Y"]],
    "출근불가":[["ABSENCE_ID","CREATED_AT","STUDENT_KEY","STUDENT_ID","NAME","DATE","START","END","REASON","NOTE","STATUS","SUBSTITUTE_KEY","SUBSTITUTE_ID","SUBSTITUTE_NAME"],["A1","2026-09-01","K01","20260001","학생A","2026-09-07","09:00","12:00","수업","원본 기록","대타모집","","",""]],
    "예산":[["WORK_TYPE","TOTAL_BUDGET","NOTE"],["국가","1000000","기존 예산"]]
  };
  const book=new Spreadsheet(seed),cache=new Map();
  const context={console,Date,JSON,Math,Number,String,Object,Array,RegExp,Error,Map,Set,
    SpreadsheetApp:{getActiveSpreadsheet:()=>book,getActive:()=>book},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
    ContentService:{MimeType:{JAVASCRIPT:"js",JSON:"json"},createTextOutput:value=>({value,setMimeType(){return this;}})},
    Utilities:{getUuid:(()=>{let i=0;return()=>`uuid-${++i}-abcdefgh`;})(),formatDate:(date,_tz,format)=>format==="yyyy-MM-dd"?"2026-09-08":"2026-09-08 12:00:00"},
    Session:{getScriptTimeZone:()=>"Asia/Seoul"}
  };
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,"..","backend","Code.gs"),"utf8"),context);
  return {context,book};
}

function rows(book,name){const data=book.getSheetByName(name).data,headers=data[0];return data.slice(1).filter(r=>r.some(v=>v!=="")).map(r=>Object.fromEntries(headers.map((h,i)=>[h,String(r[i]??"")])));}

(() => {
  const {context:c,book}=runtime();
  const originalStudent=JSON.stringify(rows(book,"학생DB"));
  c.migrateTerms();
  assert.equal(rows(book,"학기").length,1);
  assert.equal(rows(book,"학기")[0].TERM_ID,"2026-2");
  assert.equal(rows(book,"학생DB")[0].TERM_ID,"2026-2");
  assert.equal(rows(book,"출근불가")[0].TERM_ID,"2026-2");
  assert.equal(rows(book,"출근불가")[0].NOTE,"원본 기록");
  assert.equal(rows(book,"예산")[0].TOTAL_BUDGET,"1000000");
  const counts={terms:rows(book,"학기").length,students:rows(book,"학생DB").length,absences:rows(book,"출근불가").length};
  c.migrateTerms();
  assert.deepEqual({terms:rows(book,"학기").length,students:rows(book,"학생DB").length,absences:rows(book,"출근불가").length},counts,"migration must be idempotent");
  assert.ok(JSON.stringify(rows(book,"학생DB")).includes(JSON.parse(originalStudent)[0].ADMIN_MEMO));

  c.createTerm_({pin:"1234",year:"2027",termType:"1",startDate:"2027-03-02",endDate:"2027-06-21",copyFromTermId:"2026-2",copyStudents:"Y",copySchedules:"Y",copySettings:"Y",copyHolidays:"Y"});
  assert.equal(rows(book,"학기").length,2);
  assert.equal(rows(book,"학생DB").filter(x=>x.TERM_ID==="2027-1").length,1);
  assert.equal(rows(book,"학생DB").find(x=>x.TERM_ID==="2027-1").LOGIN_PIN,"1111");
  assert.equal(rows(book,"고정근무표").filter(x=>x.TERM_ID==="2027-1").length,1);
  assert.equal(rows(book,"출근불가").filter(x=>x.TERM_ID==="2027-1").length,0);
  assert.equal(rows(book,"예산").find(x=>x.TERM_ID==="2027-1"&&x.WORK_TYPE==="국가").TOTAL_BUDGET,"0");
  assert.throws(()=>c.createTerm_({pin:"1234",year:"2027",termType:"1",startDate:"2027-03-02",endDate:"2027-06-21"}),/이미 존재/);

  c.activateTerm_({pin:"1234",activateTermId:"2027-1"});
  assert.equal(rows(book,"설정").find(x=>x.KEY==="ACTIVE_TERM_ID").VALUE,"2027-1");
  assert.equal(rows(book,"학기").find(x=>x.TERM_ID==="2027-1").STATUS,"ACTIVE");
  assert.equal(rows(book,"출근불가").find(x=>x.TERM_ID==="2026-2").NOTE,"원본 기록","activation must preserve old records");
  assert.equal(c.getAdminDashboard_({pin:"1234",termId:"2026-2"}).readOnly,true);
  assert.throws(()=>c.saveBudget_({pin:"1234",termId:"2026-2",national:"1",internal:"1"}),/읽기 전용/);

  assert.equal(c.authStudent_("20260001","1111").NAME,"학생A","copied PIN login must keep working");
  c.upsertStudent_({pin:"1234",termId:"2027-1",studentId:"20270002",name:"학생B",phone:"010-0000-2222",loginPin:"2222",workType:"교내",active:"Y"});
  c.createAbsence_({studentId:"20260001",loginPin:"1111",date:"2027-03-08",start:"09:00",end:"12:00",reason:"수업"});
  const absence=rows(book,"출근불가").find(x=>x.TERM_ID==="2027-1");
  c.applySubstitute_({studentId:"20270002",loginPin:"2222",absenceId:absence.ABSENCE_ID});
  const application=rows(book,"대타신청").find(x=>x.TERM_ID==="2027-1");
  c.approveSubstitute_({pin:"1234",termId:"2027-1",appId:application.APP_ID});
  assert.equal(rows(book,"출근불가").find(x=>x.ABSENCE_ID===absence.ABSENCE_ID).STATUS,"대타확정");

  c.createExtraShift_({pin:"1234",termId:"2027-1",title:"행사 지원",date:"2027-03-09",start:"14:00",end:"16:00",capacity:"2"});
  const extra=rows(book,"추가근무").find(x=>x.TERM_ID==="2027-1");
  c.applyExtraShift_({studentId:"20270002",loginPin:"2222",shiftId:extra.SHIFT_ID});
  assert.equal(rows(book,"추가근무신청").filter(x=>x.TERM_ID==="2027-1").length,1);

  c.saveBudget_({pin:"1234",termId:"2027-1",national:"500000",internal:"300000"});
  c.saveSettings_({pin:"1234",termId:"2027-1",STUDENT_HOME_MESSAGE:"새 학기 안내"});
  c.upsertHoliday_({pin:"1234",termId:"2027-1",date:"2027-05-05",name:"어린이날"});
  c.upsertEvent_({pin:"1234",termId:"2027-1",date:"2027-03-10",title:"방문 일정"});
  c.createNotice_({pin:"1234",termId:"2027-1",date:"2027-03-02",title:"개강"});
  c.createPublicNotice_({pin:"1234",termId:"2027-1",date:"2027-03-02",title:"근로 시작"});
  const dashboard=c.getAdminDashboard_({pin:"1234",termId:"2027-1"});
  assert.equal(dashboard.readOnly,false);assert.equal(dashboard.students.length,2);assert.equal(dashboard.absences.length,1);assert.equal(dashboard.extraShifts.length,1);
  assert.equal(dashboard.settings.STUDENT_HOME_MESSAGE,"새 학기 안내");
  assert.equal(dashboard.budgets.find(x=>x.WORK_TYPE==="국가").TOTAL_BUDGET,"500000");
  assert.equal(rows(book,"출근불가").filter(x=>x.TERM_ID==="2026-2").length,1,"new operations must not mix into legacy term");
  console.log("term-model.test.js: all assertions passed");
})();
