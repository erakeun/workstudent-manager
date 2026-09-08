(() => {
  const CONFIG = window.WORK_CONFIG || {};
  const APP_VERSION = CONFIG.APP_VERSION || "V0.3.2";
  const DAYS = ["월","화","수","목","금"];
  const ALL_DAYS = ["일","월","화","수","목","금","토"];
  const state = { mode:null, auth:null, student:null, adminData:null, studentData:null, publicHome:null, view:null, selectedTermId:null };
  const ui = { adminWeekAnchor:new Date(), adminMonth:new Date(), studentMonth:new Date() };
  const STUDENT_COLORS = [
    "#D9EAF7", "#FCE2C4", "#DDF1E0", "#F7DCE8", "#E5E0F7",
    "#FFF0B8", "#D8F0EE", "#E8E2D4", "#DDE5FF", "#F5D8D0"
  ];
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>[...r.querySelectorAll(s)];

  function esc(v=""){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
  function num(v){const n=Number(String(v??"").replace(/,/g,""));return Number.isFinite(n)?n:0;}
  function money(v){return `${Math.round(num(v)).toLocaleString("ko-KR")}원`;}
  function parseDate(v){const d=new Date(`${v}T00:00:00`);return Number.isNaN(d.getTime())?null:d;}
  function isoDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
  function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
  function fmtDate(v){const d=parseDate(v);return d?`${d.getMonth()+1}/${d.getDate()} (${ALL_DAYS[d.getDay()]})`:v||"";}
  function fmtDateTime(v){const m=String(v||"").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);return m?`${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}`:String(v||"");}
  function fmtMonth(d){return `${d.getFullYear()}년 ${d.getMonth()+1}월`;}
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
  function uid(prefix){return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;}
  function toast(msg){const e=document.createElement("div");e.className="toast-item";e.textContent=msg;$("#toast").appendChild(e);setTimeout(()=>e.remove(),2600);}
  function showModal(title,html){$("#modal-root").innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h3>${esc(title)}</h3><button class="modal-close" type="button">✕</button></div>${html}</div></div>`;$(".modal-close").onclick=closeModal;$(".modal-backdrop").onclick=e=>{if(e.target.classList.contains("modal-backdrop"))closeModal();};}
  function closeModal(){$("#modal-root").innerHTML="";}
  function studentColor(d,key){
    const s=(d?.students||[]).find(x=>x.STUDENT_KEY===key) || (d?.student?.STUDENT_KEY===key?d.student:null);
    return s?.STUDENT_COLOR || STUDENT_COLORS[0];
  }
  function studentChipStyle(color){
    const c=color||STUDENT_COLORS[0];
    return `background:${esc(c)};border-color:${esc(c)};color:#17211c`;
  }
  function studentColorLegend(d){
    const students=(d?.students||[]).filter(s=>s.ACTIVE!=="N");
    if(!students.length)return "";
    return `<div class="student-color-legend"><strong>학생별 색상</strong>${students.map(s=>`<span><i style="background:${esc(studentColor(d,s.STUDENT_KEY))}"></i>${esc(s.NAME)}</span>`).join("")}</div>`;
  }
  function nextStudentColor(students,currentKey=""){
    const used=new Set((students||[]).filter(x=>x.STUDENT_KEY!==currentKey&&x.ACTIVE!=="N").map(x=>String(x.STUDENT_COLOR||"").toUpperCase()));
    return STUDENT_COLORS.find(c=>!used.has(c.toUpperCase())) || STUDENT_COLORS[(students||[]).length%STUDENT_COLORS.length];
  }

  // ---------------- API ----------------
  async function api(action,params={}){
    if(state.mode==="admin" && state.selectedTermId && params.termId===undefined) params={...params,termId:state.selectedTermId};
    if(CONFIG.DEMO_MODE) return mockApi(action,params);
    if(!CONFIG.API_URL) throw new Error("config.js에 Apps Script API_URL을 입력해줘.");
    const r=await jsonpRequest(CONFIG.API_URL,{action,...params});
    if(r && r.ok===false) throw new Error(r.error||"처리에 실패했어.");
    return r;
  }

  function activeTerm(d){return (d?.terms||[]).find(x=>x.TERM_ID===(d.activeTermId||d.settings?.ACTIVE_TERM_ID))||(d?.terms||[]).find(x=>x.STATUS==="ACTIVE")||null;}
  function selectedTerm(d){return (d?.terms||[]).find(x=>x.TERM_ID===(d.selectedTermId||state.selectedTermId))||activeTerm(d);}
  function currentTermName(d){return activeTerm(d)?.TERM_NAME||d?.settings?.TERM_NAME||CONFIG.TERM_NAME||"";}
  function selectedTermName(d){return selectedTerm(d)?.TERM_NAME||currentTermName(d);}
  function adminReadOnly(){return state.mode==="admin"&&state.view!=="admin-terms"&&!!state.adminData?.readOnly;}
  function updateTermChrome(d){
    const active=currentTermName(d),selected=state.mode==="admin"?selectedTermName(d):active;
    if(active){$("#login-term").textContent=active;$("#sidebar-term").textContent=active;}
    const header=$("#header-term");
    if(header){header.textContent=state.mode==="admin"&&selected&&selected!==active?`조회: ${selected} · 운영: ${active}`:(active||"학기 정보 없음");header.classList.toggle("readonly",!!(state.mode==="admin"&&selected&&selected!==active));}
  }
  function jsonpRequest(url,params){
    return new Promise((resolve,reject)=>{
      const cb=`__work_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script=document.createElement("script");const qs=new URLSearchParams({...params,callback:cb,_:Date.now()});
      const timer=setTimeout(()=>finish(new Error("서버 응답 시간이 초과됐어.")),15000);
      function finish(err,data){clearTimeout(timer);delete window[cb];script.remove();err?reject(err):resolve(data);}
      window[cb]=data=>finish(null,data);script.onerror=()=>finish(new Error("Apps Script 연결에 실패했어."));
      script.src=`${url}${url.includes("?")?"&":"?"}${qs.toString()}`;document.head.appendChild(script);
    });
  }

  // ---------------- DEMO DB: actual 2026-2 spreadsheet data ----------------
  function seedMock(){
    const key="workstudent_demo_db_v022";if(localStorage.getItem(key))return;
    const students=[
      {STUDENT_KEY:"K01",STUDENT_ID:"",NAME:"유동채",PHONE:"",LOGIN_PIN:"",WORK_TYPE:"국가",DEPARTMENT:"",ACTIVE:"Y",ADMIN_MEMO:"원본 2학기표에 연락처·학번 미기재",STUDENT_COLOR:STUDENT_COLORS[0]},
      {STUDENT_KEY:"K02",STUDENT_ID:"",NAME:"김건우",PHONE:"010-4445-3255",LOGIN_PIN:"3255",WORK_TYPE:"교내",DEPARTMENT:"",ACTIVE:"Y",ADMIN_MEMO:"전화번호는 기존 1학기표에서 연계",STUDENT_COLOR:STUDENT_COLORS[1]},
      {STUDENT_KEY:"K03",STUDENT_ID:"",NAME:"이현서",PHONE:"",LOGIN_PIN:"",WORK_TYPE:"교내",DEPARTMENT:"",ACTIVE:"Y",ADMIN_MEMO:"원본 2학기표에 연락처·학번 미기재",STUDENT_COLOR:STUDENT_COLORS[2]},
      {STUDENT_KEY:"K04",STUDENT_ID:"",NAME:"차명진",PHONE:"010-8982-7255",LOGIN_PIN:"7255",WORK_TYPE:"교내",DEPARTMENT:"",ACTIVE:"Y",ADMIN_MEMO:"전화번호는 기존 1학기표에서 연계",STUDENT_COLOR:STUDENT_COLORS[3]},
      {STUDENT_KEY:"K05",STUDENT_ID:"",NAME:"박지선",PHONE:"010-3509-4825",LOGIN_PIN:"4825",WORK_TYPE:"국가",DEPARTMENT:"",ACTIVE:"Y",ADMIN_MEMO:"전화번호는 기존 1학기표에서 연계",STUDENT_COLOR:STUDENT_COLORS[4]},
      {STUDENT_KEY:"K06",STUDENT_ID:"",NAME:"이민규",PHONE:"010-8703-5841",LOGIN_PIN:"5841",WORK_TYPE:"국가",DEPARTMENT:"",ACTIVE:"Y",ADMIN_MEMO:"전화번호는 기존 1학기표에서 연계",STUDENT_COLOR:STUDENT_COLORS[5]},
      {STUDENT_KEY:"K07",STUDENT_ID:"",NAME:"양예주",PHONE:"010-2295-8736",LOGIN_PIN:"8736",WORK_TYPE:"교내",DEPARTMENT:"",ACTIVE:"Y",ADMIN_MEMO:"전화번호는 기존 1학기표에서 연계",STUDENT_COLOR:STUDENT_COLORS[6]}
    ];
    students.forEach(x=>x.TERM_ID="2026-2");
    const schedules=[
      ["K01","유동채","국가","학기중","월","09:00","12:00"],["K02","김건우","교내","학기중","월","13:00","16:00"],["K03","이현서","교내","학기중","월","15:00","17:00"],
      ["K04","차명진","교내","학기중","화","13:00","17:00"],
      ["K05","박지선","국가","학기중","수","09:00","12:00"],["K01","유동채","국가","학기중","수","09:00","12:00"],["K06","이민규","국가","학기중","수","13:00","15:00"],["K04","차명진","교내","학기중","수","13:00","17:00"],
      ["K02","김건우","교내","학기중","목","09:00","12:00"],["K06","이민규","국가","학기중","목","13:00","17:00"],["K07","양예주","교내","학기중","목","13:00","17:00"],
      ["K05","박지선","국가","학기중","금","09:00","12:00"],["K07","양예주","교내","학기중","금","13:00","16:00"],["K03","이현서","교내","학기중","금","15:00","17:00"]
    ].map((x,i)=>({SCHEDULE_ID:`S${i+1}`,STUDENT_KEY:x[0],STUDENT_ID:"",NAME:x[1],WORK_TYPE:x[2],PERIOD_TYPE:x[3],DAY:x[4],START:x[5],END:x[6],LUNCH_ALLOWED:"N",ACTIVE:"Y",TERM_ID:"2026-2"}));
    const settings={
      SYSTEM_NAME:"근로장학생 근무관리",TERM_NAME:"2026-2학기",ACTIVE_TERM_ID:"2026-2",ADMIN_PIN:"1234",
      SEMESTER_START:"2026-09-01",CLASS_END:"2026-12-21",MAKEUP_DATE:"2026-12-22",SEMESTER_END:"2026-12-22",
      BREAK_START:"2026-12-23",BREAK_END:"2027-02-28",SHORT_START:"",SHORT_END:"",
      NORMAL_START_TIME:"09:00",NORMAL_END_TIME:"17:00",SHORT_START_TIME:"10:00",SHORT_END_TIME:"17:00",
      SEMESTER_WEEK_LIMIT:"20",BREAK_WEEK_LIMIT:"30",WAGE_2026:"10320",WAGE_2027:"10700",
      STUDENT_HOME_MESSAGE:"오늘도 필요한 일만 차근차근 처리해줘.",
      STUDENT_NO_WORK_MESSAGE:"오늘은 정규 근무가 없어.",
      HANDOVER_PDF_LABEL:"근로장학생 업무 인수인계서 보기",
      HANDOVER_PDF_URL:"./근로장학생_업무_인수인계서_샘플.pdf",
      DONATION_LINK_LABEL:"무인기부코너 관리 시트",
      DONATION_LINK_URL:"https://www.naver.com/",
      LANDING_TITLE:"한양대학교 ERICA 발전협력팀\n근로장학생 관리 시트",
      LANDING_DESCRIPTION:"Google Sheet는 기록 원본으로 남기고, 학생과 직원은 웹에서 필요한 일만 처리하는 근로장학생 관리도구."
    };
    const holidays=[
      ["2026-09-24","추석 연휴"],["2026-09-25","추석"],["2026-09-26","추석 연휴"],["2026-10-03","개천절"],["2026-10-05","개천절 대체공휴일"],["2026-10-09","한글날"],["2026-12-25","성탄절"],
      ["2027-01-01","신정"],["2027-02-06","설날 연휴"],["2027-02-07","설날"],["2027-02-08","설날 연휴"],["2027-02-09","설날 대체공휴일"]
    ].map((x,i)=>({HOLIDAY_ID:`H${i+1}`,DATE:x[0],NAME:x[1],ACTIVE:"Y",SOURCE:"대한민국 공휴일"}));
    const events=[
      {EVENT_ID:"E_DEMO",DATE:"2026-09-17",TITLE:"[데모] 주요 내빈 방문",MESSAGE:"사무실 정돈 및 복장 유의",LEVEL:"주의",SHOW_PUBLIC:"Y",ACTIVE:"Y",CREATED_AT:new Date().toISOString()}
    ];
    const publicNotices=[
      {PUBLIC_NOTICE_ID:"PN_DEMO1",DATE:"2026-09-01",TITLE:"2학기 근로 시작 안내",CONTENT:"첫 근무 전 본인 시간표와 업무 인수인계서를 확인해줘.",LINK:"",ACTIVE:"Y",CREATED_AT:new Date().toISOString()}
    ];
    const terms=[{TERM_ID:"2026-2",YEAR:"2026",TERM_TYPE:"2",TERM_NAME:"2026-2학기",START_DATE:"2026-09-01",END_DATE:"2027-02-28",STATUS:"ACTIVE",CREATED_AT:new Date().toISOString()}];
    holidays.forEach(x=>x.TERM_ID="2026-2");events.forEach(x=>x.TERM_ID="2026-2");publicNotices.forEach(x=>x.TERM_ID="2026-2");
    const db={settings,terms,termSettings:{"2026-2":{...settings}},students,schedules,holidays,events,publicNotices,budgets:[{WORK_TYPE:"국가",TOTAL_BUDGET:"6006240",NOTE:"기존 파일 2학기 배정액",TERM_ID:"2026-2"},{WORK_TYPE:"교내",TOTAL_BUDGET:"8173440",NOTE:"기존 파일 2학기 배정액",TERM_ID:"2026-2"}],absences:[],substitutes:[],extraShifts:[],extraJoins:[],notices:[{NOTICE_ID:"N1",DATE:"2026-09-01",TITLE:"오늘의 안내",CONTENT:"우편물 확인 → 홍보물 정리 → 공용 스프레드시트 업데이트 → 자료실 정리 → 행사 준비물 점검",LINK:"",ACTIVE:"Y",CREATED_AT:new Date().toISOString(),TERM_ID:"2026-2"}],sharedMemos:[]};
    // 상태가 눈에 보이도록 1건만 데모 예외 생성. 실제 원본 데이터가 아니라 데모 표시용.
    db.absences.push({ABSENCE_ID:"A_DEMO",CREATED_AT:new Date().toISOString(),STUDENT_KEY:"K05",STUDENT_ID:"",NAME:"박지선",DATE:"2026-09-04",START:"09:00",END:"12:00",REASON:"개인 일정",NOTE:"V0.2 기능 확인용 데모 데이터",STATUS:"대타모집",SUBSTITUTE_KEY:"",SUBSTITUTE_ID:"",SUBSTITUTE_NAME:"",TERM_ID:"2026-2"});
    localStorage.setItem(key,JSON.stringify(db));
  }
  function readMock(){seedMock();const db=JSON.parse(localStorage.getItem("workstudent_demo_db_v022"));return migrateMockTerms(db);}
  function writeMock(db){localStorage.setItem("workstudent_demo_db_v022",JSON.stringify(db));}
  function migrateMockTerms(db){
    const id=db.settings?.ACTIVE_TERM_ID||"2026-2";
    db.settings={...(db.settings||{}),ACTIVE_TERM_ID:id};
    db.terms=db.terms?.length?db.terms:[{TERM_ID:id,YEAR:"2026",TERM_TYPE:"2",TERM_NAME:db.settings.TERM_NAME||"2026-2학기",START_DATE:db.settings.SEMESTER_START||"2026-09-01",END_DATE:db.settings.BREAK_END||db.settings.SEMESTER_END||"2027-02-28",STATUS:"ACTIVE",CREATED_AT:new Date().toISOString()}];
    db.termSettings=db.termSettings||{[id]:{...db.settings}};
    db.sharedMemos=db.sharedMemos||[];
    ["students","schedules","holidays","events","publicNotices","budgets","absences","substitutes","extraShifts","extraJoins","notices","sharedMemos"].forEach(k=>(db[k]||[]).forEach(x=>{if(!x.TERM_ID)x.TERM_ID=id;}));
    return db;
  }
  function mockActiveTermId(db){return db.settings.ACTIVE_TERM_ID||db.terms.find(x=>x.STATUS==="ACTIVE")?.TERM_ID;}
  function mockRows(db,key,termId){return (db[key]||[]).filter(x=>x.TERM_ID===(termId||mockActiveTermId(db)));}
  function mockSettings(db,termId){return {...db.settings,...(db.termSettings?.[termId||mockActiveTermId(db)]||{})};}
  function mockAuthStudent(db,p){
    let s=null;
    const students=mockRows(db,"students",mockActiveTermId(db));
    if(p.previewKey) s=students.find(x=>x.STUDENT_KEY===p.previewKey&&x.ACTIVE==="Y");
    else s=students.find(x=>x.STUDENT_ID&&x.STUDENT_ID===p.studentId&&String(x.LOGIN_PIN||x.PHONE_LAST4||"")===String(p.loginPin||p.last4||"")&&x.ACTIVE==="Y");
    if(!s) throw new Error("학번 또는 로그인 PIN을 확인해줘. (데모는 이름 미리보기를 사용하면 돼.)");return s;
  }
  function mockAdmin(db,p){if(String(p.pin)!==String(db.settings.ADMIN_PIN))throw new Error("관리자 PIN이 맞지 않아.");}
  function mockMemoPage(db,termId,offset=0,limit=5){const all=mockRows(db,"sharedMemos",termId).filter(x=>x.STATUS!=="삭제").sort((a,b)=>String(b.CREATED_AT).localeCompare(String(a.CREATED_AT))||String(b.MEMO_ID).localeCompare(String(a.MEMO_ID))),start=Math.max(0,Number(offset)||0),size=Math.min(20,Math.max(1,Number(limit)||5));return{sharedMemos:all.slice(start,start+size),sharedMemoHasMore:all.length>start+size};}
  function mockDashboard(db,requestedTermId){const activeTermId=mockActiveTermId(db),termId=requestedTermId||activeTermId,memos=mockMemoPage(db,termId);return {students:mockRows(db,"students",termId),schedules:mockRows(db,"schedules",termId),holidays:mockRows(db,"holidays",termId),events:mockRows(db,"events",termId),publicNotices:mockRows(db,"publicNotices",termId),budgets:mockRows(db,"budgets",termId),settings:mockSettings(db,termId),absences:mockRows(db,"absences",termId),substitutes:mockRows(db,"substitutes",termId),extraShifts:mockRows(db,"extraShifts",termId),extraJoins:mockRows(db,"extraJoins",termId),notices:mockRows(db,"notices",termId),sharedMemos:memos.sharedMemos,sharedMemoHasMore:memos.sharedMemoHasMore,features:{sharedMemos:true},terms:db.terms,activeTermId,selectedTermId:termId,readOnly:termId!==activeTermId,backendVersion:"V0.3.2"};}
  async function mockApi(action,p){
    await new Promise(r=>setTimeout(r,60));const db=readMock();
    if(action==="getPublicHome"){const termId=mockActiveTermId(db),s=mockSettings(db,termId);return {ok:true,version:"V0.3.2",activeTermId:termId,terms:db.terms.map(x=>({...x})),settings:{
      SYSTEM_NAME:s.SYSTEM_NAME,TERM_NAME:s.TERM_NAME,
      LANDING_TITLE:s.LANDING_TITLE,LANDING_DESCRIPTION:s.LANDING_DESCRIPTION,
      HANDOVER_PDF_LABEL:s.HANDOVER_PDF_LABEL,HANDOVER_PDF_URL:s.HANDOVER_PDF_URL
    },notices:mockRows(db,"publicNotices",termId).filter(x=>x.ACTIVE==="Y")};}
    if(action==="getPublicLanding"){return {ok:true,
      students:mockRows(db,"students").filter(x=>x.ACTIVE==="Y").map(x=>({STUDENT_KEY:x.STUDENT_KEY,NAME:x.NAME,STUDENT_COLOR:x.STUDENT_COLOR})),
      schedules:mockRows(db,"schedules").filter(x=>x.ACTIVE==="Y"),
      holidays:mockRows(db,"holidays").filter(x=>x.ACTIVE==="Y"),
      events:mockRows(db,"events").filter(x=>x.ACTIVE==="Y"&&x.SHOW_PUBLIC==="Y"),
      absences:mockRows(db,"absences").filter(x=>!["취소","삭제"].includes(x.STATUS)).map(x=>({STUDENT_KEY:x.STUDENT_KEY,DATE:x.DATE,START:x.START,END:x.END,STATUS:x.STATUS,SUBSTITUTE_KEY:x.SUBSTITUTE_KEY,SUBSTITUTE_NAME:x.SUBSTITUTE_NAME})),
      settings:mockSettings(db)
    };}
    if(action==="getPublicSettings"){return {ok:true,settings:{
      SYSTEM_NAME:db.settings.SYSTEM_NAME,TERM_NAME:db.settings.TERM_NAME,
      HANDOVER_PDF_LABEL:db.settings.HANDOVER_PDF_LABEL,HANDOVER_PDF_URL:db.settings.HANDOVER_PDF_URL
    }};}
    if(action==="getDemoStudents") return {ok:true,students:mockRows(db,"students").filter(x=>x.ACTIVE==="Y").map(x=>({STUDENT_KEY:x.STUDENT_KEY,NAME:x.NAME}))};
    if(action==="studentLogin"){const s=mockAuthStudent(db,p);return {ok:true,student:s};}
    if(action==="adminLogin"){mockAdmin(db,p);return {ok:true};}
    if(action==="getStudentDashboard"){const s=mockAuthStudent(db,p),termId=mockActiveTermId(db),memos=mockMemoPage(db,termId);return {ok:true,student:s,schedules:mockRows(db,"schedules",termId).filter(x=>x.STUDENT_KEY===s.STUDENT_KEY&&x.ACTIVE==="Y"),holidays:mockRows(db,"holidays",termId),events:mockRows(db,"events",termId),settings:mockSettings(db,termId),absences:mockRows(db,"absences",termId),substitutes:mockRows(db,"substitutes",termId),extraShifts:mockRows(db,"extraShifts",termId),extraJoins:mockRows(db,"extraJoins",termId),notices:mockRows(db,"notices",termId),sharedMemos:memos.sharedMemos,sharedMemoHasMore:memos.sharedMemoHasMore,features:{sharedMemos:true},terms:db.terms,activeTermId:termId};}
    if(action==="getAdminDashboard"){mockAdmin(db,p);return {ok:true,...mockDashboard(db,p.termId)};}
    if(action==="getSharedMemos"){
      let termId;if(p.role==="admin"){mockAdmin(db,p);termId=p.termId||mockActiveTermId(db);}else{mockAuthStudent(db,p);termId=mockActiveTermId(db);}return{ok:true,...mockMemoPage(db,termId,p.offset,p.limit)};
    }
    if(action==="createSharedMemo"){
      const content=String(p.content||"").trim();if(!content)throw new Error("공유 메모 내용을 입력해줘.");if(content.length>500)throw new Error("공유 메모는 500자까지 입력할 수 있어.");let termId,authorId,authorRole,authorName;if(p.role==="admin"){mockAdmin(db,p);termId=p.termId||mockActiveTermId(db);if(termId!==mockActiveTermId(db))throw new Error("과거 학기는 읽기 전용이야.");authorId="ADMIN";authorRole="ADMIN";authorName="관리자";}else{const s=mockAuthStudent(db,p);termId=mockActiveTermId(db);authorId=s.STUDENT_KEY;authorRole="STUDENT";authorName=s.NAME;}const memo={MEMO_ID:uid("M"),AUTHOR_ID:authorId,AUTHOR_ROLE:authorRole,AUTHOR_NAME:authorName,CONTENT:content,CREATED_AT:new Date().toISOString(),STATUS:"게시",TERM_ID:termId};db.sharedMemos.push(memo);writeMock(db);return{ok:true,memo};
    }
    if(action==="deleteSharedMemo"){
      let termId,student=null;if(p.role==="admin"){mockAdmin(db,p);termId=p.termId||mockActiveTermId(db);if(termId!==mockActiveTermId(db))throw new Error("과거 학기는 읽기 전용이야.");}else{student=mockAuthStudent(db,p);termId=mockActiveTermId(db);}const memo=db.sharedMemos.find(x=>x.MEMO_ID===p.memoId&&x.TERM_ID===termId&&x.STATUS!=="삭제");if(!memo)throw new Error("공유 메모를 찾을 수 없어.");if(student&&(memo.AUTHOR_ROLE!=="STUDENT"||memo.AUTHOR_ID!==student.STUDENT_KEY))throw new Error("본인이 작성한 공유 메모만 삭제할 수 있어.");memo.STATUS="삭제";writeMock(db);return{ok:true};
    }
    if(action==="createAdminAbsence"){
      mockAdmin(db,p);const termId=p.termId||mockActiveTermId(db);if(termId!==mockActiveTermId(db))throw new Error("과거 학기는 읽기 전용이야.");const s=mockRows(db,"students",termId).find(x=>x.STUDENT_KEY===p.studentKey&&x.ACTIVE==="Y"),d=mockDashboard(db,termId);if(!s)throw new Error("학생을 찾을 수 없어.");if(!p.date||timeMin(p.start)>=timeMin(p.end)||!mockRows(db,"schedules",termId).some(x=>x.STUDENT_KEY===s.STUDENT_KEY&&x.ACTIVE==="Y"&&x.PERIOD_TYPE===periodType(d,p.date)&&x.DAY===ALL_DAYS[parseDate(p.date)?.getDay()]&&overlap(x.START,x.END,p.start,p.end)))throw new Error("학생의 고정근무와 겹치는 시간만 등록할 수 있어.");if(mockRows(db,"absences",termId).some(x=>x.STUDENT_KEY===s.STUDENT_KEY&&x.DATE===p.date&&!['취소','삭제'].includes(x.STATUS)&&overlap(x.START,x.END,p.start,p.end)))throw new Error("이미 겹치는 결근 기록이 있어.");db.absences.push({ABSENCE_ID:uid("A"),CREATED_AT:new Date().toISOString(),STUDENT_KEY:s.STUDENT_KEY,STUDENT_ID:s.STUDENT_ID,NAME:s.NAME,DATE:p.date,START:p.start,END:p.end,REASON:p.reason||"관리자 등록",NOTE:p.note||"",STATUS:"대타모집",SUBSTITUTE_KEY:"",SUBSTITUTE_ID:"",SUBSTITUTE_NAME:"",TERM_ID:termId});writeMock(db);return {ok:true};
    }
    if(action==="createAbsence"){
      const s=mockAuthStudent(db,p);db.absences.push({ABSENCE_ID:uid("A"),CREATED_AT:new Date().toISOString(),STUDENT_KEY:s.STUDENT_KEY,STUDENT_ID:s.STUDENT_ID,NAME:s.NAME,DATE:p.date,START:p.start,END:p.end,REASON:p.reason||"개인 일정",NOTE:p.note||"",STATUS:"대타모집",SUBSTITUTE_KEY:"",SUBSTITUTE_ID:"",SUBSTITUTE_NAME:"",TERM_ID:mockActiveTermId(db)});writeMock(db);return {ok:true};
    }
    if(action==="cancelAbsence"){const s=mockAuthStudent(db,p),a=db.absences.find(x=>x.ABSENCE_ID===p.absenceId&&x.STUDENT_KEY===s.STUDENT_KEY);if(!a)throw new Error("신청을 찾을 수 없어.");if(a.STATUS==="대타확정")throw new Error("대타 확정 후에는 관리자에게 요청해줘.");a.STATUS="취소";writeMock(db);return {ok:true};}
    if(action==="deleteAbsence"){mockAdmin(db,p);const a=db.absences.find(x=>x.ABSENCE_ID===p.absenceId);if(a)a.STATUS="삭제";db.substitutes.filter(x=>x.ABSENCE_ID===p.absenceId).forEach(x=>x.STATUS="삭제");writeMock(db);return {ok:true};}
    if(action==="applySubstitute"){
      const s=mockAuthStudent(db,p),a=db.absences.find(x=>x.ABSENCE_ID===p.absenceId&&x.STATUS==="대타모집");if(!a)throw new Error("현재 대타 모집 중인 건이 아니야.");if(a.STUDENT_KEY===s.STUDENT_KEY)throw new Error("본인 결근에는 신청할 수 없어.");
      if(db.substitutes.some(x=>x.ABSENCE_ID===a.ABSENCE_ID&&x.STUDENT_KEY===s.STUDENT_KEY&&x.STATUS==="신청"))throw new Error("이미 신청했어.");
      db.substitutes.push({APP_ID:uid("P"),ABSENCE_ID:a.ABSENCE_ID,STUDENT_KEY:s.STUDENT_KEY,STUDENT_ID:s.STUDENT_ID,NAME:s.NAME,APPLIED_AT:new Date().toISOString(),STATUS:"신청",DECIDED_AT:"",TERM_ID:mockActiveTermId(db)});writeMock(db);return {ok:true};
    }
    if(action==="approveSubstitute"){
      mockAdmin(db,p);const app=db.substitutes.find(x=>x.APP_ID===p.appId);if(!app)throw new Error("신청을 찾을 수 없어.");const a=db.absences.find(x=>x.ABSENCE_ID===app.ABSENCE_ID&&x.STATUS==="대타모집");if(!a)throw new Error("이미 처리된 결근이야.");
      app.STATUS="승인";app.DECIDED_AT=new Date().toISOString();a.STATUS="대타확정";a.SUBSTITUTE_KEY=app.STUDENT_KEY;a.SUBSTITUTE_ID=app.STUDENT_ID;a.SUBSTITUTE_NAME=app.NAME;db.substitutes.filter(x=>x.ABSENCE_ID===a.ABSENCE_ID&&x.APP_ID!==app.APP_ID&&x.STATUS==="신청").forEach(x=>{x.STATUS="미선정";x.DECIDED_AT=new Date().toISOString();});writeMock(db);return {ok:true};
    }
    if(action==="rejectSubstitute"||action==="deleteSubstitute"){mockAdmin(db,p);const x=db.substitutes.find(v=>v.APP_ID===p.appId);if(x)x.STATUS=action==="deleteSubstitute"?"삭제":"미선정";writeMock(db);return {ok:true};}
    if(action==="upsertStudent"){
      mockAdmin(db,p);const termId=p.termId||mockActiveTermId(db);let s=p.studentKey?db.students.find(x=>x.STUDENT_KEY===p.studentKey&&x.TERM_ID===termId):null;const digits=String(p.phone||"").replace(/\D/g,"");const loginPin=String(p.loginPin||"").trim() || s?.LOGIN_PIN || digits.slice(-4);const studentColor=p.studentColor||s?.STUDENT_COLOR||nextStudentColor(mockRows(db,"students",termId),s?.STUDENT_KEY||"");const v={STUDENT_KEY:s?.STUDENT_KEY||uid("K"),STUDENT_ID:p.studentId||"",NAME:p.name,PHONE:p.phone||"",LOGIN_PIN:loginPin,WORK_TYPE:p.workType||"국가",DEPARTMENT:p.department||"",ACTIVE:p.active||"Y",ADMIN_MEMO:p.memo||"",STUDENT_COLOR:studentColor,TERM_ID:termId};if(s)Object.assign(s,v);else db.students.push(v);writeMock(db);return {ok:true};
    }
    if(action==="deleteStudent"){mockAdmin(db,p);const s=db.students.find(x=>x.STUDENT_KEY===p.studentKey);if(s)s.ACTIVE="N";db.schedules.filter(x=>x.STUDENT_KEY===p.studentKey).forEach(x=>x.ACTIVE="N");writeMock(db);return {ok:true};}
    if(action==="addSchedule"){
      mockAdmin(db,p);const termId=p.termId||mockActiveTermId(db),s=db.students.find(x=>x.STUDENT_KEY===p.studentKey&&x.TERM_ID===termId&&x.ACTIVE==="Y");if(!s)throw new Error("학생을 찾을 수 없어.");db.schedules.push({SCHEDULE_ID:uid("S"),STUDENT_KEY:s.STUDENT_KEY,STUDENT_ID:s.STUDENT_ID,NAME:s.NAME,WORK_TYPE:s.WORK_TYPE,PERIOD_TYPE:p.periodType,DAY:p.day,START:p.start,END:p.end,LUNCH_ALLOWED:p.lunchAllowed||"N",ACTIVE:"Y",TERM_ID:termId});writeMock(db);return {ok:true};
    }
    if(action==="deleteSchedule"){mockAdmin(db,p);const s=db.schedules.find(x=>x.SCHEDULE_ID===p.scheduleId);if(s)s.ACTIVE="N";writeMock(db);return {ok:true};}
    if(action==="createExtraShift"){mockAdmin(db,p);db.extraShifts.push({SHIFT_ID:uid("X"),TITLE:p.title,DATE:p.date,START:p.start,END:p.end,CAPACITY:String(p.capacity||1),DESCRIPTION:p.description||"",STATUS:"모집중",CREATED_AT:new Date().toISOString(),TERM_ID:p.termId||mockActiveTermId(db)});writeMock(db);return {ok:true};}
    if(action==="deleteExtraShift"){mockAdmin(db,p);const s=db.extraShifts.find(x=>x.SHIFT_ID===p.shiftId);if(s)s.STATUS="삭제";db.extraJoins.filter(x=>x.SHIFT_ID===p.shiftId).forEach(x=>x.STATUS="삭제");writeMock(db);return {ok:true};}
    if(action==="applyExtraShift"){const s=mockAuthStudent(db,p),termId=mockActiveTermId(db),sh=db.extraShifts.find(x=>x.SHIFT_ID===p.shiftId&&x.TERM_ID===termId&&x.STATUS==="모집중");if(!sh)throw new Error("현재 모집 중이 아니야.");const joins=db.extraJoins.filter(x=>x.SHIFT_ID===sh.SHIFT_ID&&x.TERM_ID===termId&&x.STATUS==="신청");if(joins.some(x=>x.STUDENT_KEY===s.STUDENT_KEY))throw new Error("이미 신청했어.");if(joins.length>=num(sh.CAPACITY))throw new Error("모집 인원이 찼어.");db.extraJoins.push({JOIN_ID:uid("J"),SHIFT_ID:sh.SHIFT_ID,STUDENT_KEY:s.STUDENT_KEY,STUDENT_ID:s.STUDENT_ID,NAME:s.NAME,APPLIED_AT:new Date().toISOString(),STATUS:"신청",TERM_ID:termId});writeMock(db);return {ok:true};}
    if(action==="deleteExtraJoin"){mockAdmin(db,p);const j=db.extraJoins.find(x=>x.JOIN_ID===p.joinId);if(j)j.STATUS="삭제";writeMock(db);return {ok:true};}
    if(action==="createPublicNotice"){
      mockAdmin(db,p);
      db.publicNotices=db.publicNotices||[];
      db.publicNotices.push({PUBLIC_NOTICE_ID:uid("PN"),DATE:p.date||isoDate(new Date()),TITLE:p.title||"안내",CONTENT:p.content||"",LINK:p.link||"",ACTIVE:"Y",CREATED_AT:new Date().toISOString(),TERM_ID:p.termId||mockActiveTermId(db)});
      writeMock(db);return {ok:true};
    }
    if(action==="deletePublicNotice"){
      mockAdmin(db,p);
      const n=(db.publicNotices||[]).find(x=>x.PUBLIC_NOTICE_ID===p.publicNoticeId);
      if(n)n.ACTIVE="N";
      writeMock(db);return {ok:true};
    }
    if(action==="createNotice"){mockAdmin(db,p);db.notices.push({NOTICE_ID:uid("N"),DATE:p.date,TITLE:p.title,CONTENT:p.content,LINK:p.link||"",ACTIVE:"Y",CREATED_AT:new Date().toISOString(),TERM_ID:p.termId||mockActiveTermId(db)});writeMock(db);return {ok:true};}
    if(action==="deleteNotice"){mockAdmin(db,p);const n=db.notices.find(x=>x.NOTICE_ID===p.noticeId);if(n)n.ACTIVE="N";writeMock(db);return {ok:true};}
    if(action==="upsertEvent"){
      mockAdmin(db,p);
      let e=p.eventId?(db.events||[]).find(x=>x.EVENT_ID===p.eventId):null;
      const v={EVENT_ID:e?.EVENT_ID||uid("E"),DATE:p.date,TITLE:p.title,MESSAGE:p.message||"",LEVEL:p.level||"주의",SHOW_PUBLIC:p.showPublic||"Y",ACTIVE:"Y",CREATED_AT:e?.CREATED_AT||new Date().toISOString(),TERM_ID:p.termId||mockActiveTermId(db)};
      if(e)Object.assign(e,v);else{db.events=db.events||[];db.events.push(v);}
      writeMock(db);return {ok:true};
    }
    if(action==="deleteEvent"){
      mockAdmin(db,p);const e=(db.events||[]).find(x=>x.EVENT_ID===p.eventId);if(e)e.ACTIVE="N";writeMock(db);return {ok:true};
    }
    if(action==="saveSettings"){mockAdmin(db,p);const termId=p.termId||mockActiveTermId(db);db.termSettings[termId]=db.termSettings[termId]||{};Object.entries(p).forEach(([k,v])=>{if(!["pin","action","termId"].includes(k))db.termSettings[termId][k]=v;});writeMock(db);return {ok:true};}
    if(action==="saveBudget"){mockAdmin(db,p);const termId=p.termId||mockActiveTermId(db);["국가","교내"].forEach(type=>{let b=db.budgets.find(x=>x.WORK_TYPE===type&&x.TERM_ID===termId);if(!b){b={WORK_TYPE:type,TOTAL_BUDGET:"0",NOTE:"",TERM_ID:termId};db.budgets.push(b);}b.TOTAL_BUDGET=String(p[type==="국가"?"national":"internal"]??"0");});writeMock(db);return {ok:true};}
    if(action==="upsertHoliday"){mockAdmin(db,p);const termId=p.termId||mockActiveTermId(db);let h=p.holidayId?db.holidays.find(x=>x.HOLIDAY_ID===p.holidayId&&x.TERM_ID===termId):null;const v={HOLIDAY_ID:h?.HOLIDAY_ID||uid("H"),DATE:p.date,NAME:p.name,ACTIVE:"Y",SOURCE:p.source||"관리자 입력",TERM_ID:termId};if(h)Object.assign(h,v);else db.holidays.push(v);writeMock(db);return {ok:true};}
    if(action==="deleteHoliday"){mockAdmin(db,p);const h=db.holidays.find(x=>x.HOLIDAY_ID===p.holidayId);if(h)h.ACTIVE="N";writeMock(db);return {ok:true};}
    if(action==="createTerm"){
      mockAdmin(db,p);const year=String(p.year||""),type=String(p.termType||""),termId=`${year}-${type}`,labels={"1":"1학기",summer:"여름학기","2":"2학기",winter:"겨울학기"};
      if(!/^20\d{2}$/.test(year)||!labels[type]||!p.startDate||!p.endDate||p.startDate>p.endDate)throw new Error("학기 정보를 확인해줘.");
      if(db.terms.some(x=>x.TERM_ID===termId))throw new Error("이미 생성된 학기야.");
      const source=p.copyFromTermId||mockActiveTermId(db),name=`${year}-${labels[type]}`;
      db.terms.push({TERM_ID:termId,YEAR:year,TERM_TYPE:type,TERM_NAME:name,START_DATE:p.startDate,END_DATE:p.endDate,STATUS:"INACTIVE",CREATED_AT:new Date().toISOString()});
      const base={...(db.termSettings[source]||db.settings),TERM_NAME:name,SEMESTER_START:p.startDate,CLASS_END:p.endDate,MAKEUP_DATE:"",SEMESTER_END:p.endDate,BREAK_START:"",BREAK_END:p.endDate,SHORT_START:"",SHORT_END:""};db.termSettings[termId]=base;
      if(p.copyStudents==="Y")mockRows(db,"students",source).filter(x=>x.ACTIVE==="Y").forEach(x=>db.students.push({...x,TERM_ID:termId}));
      if(p.copySchedules==="Y")mockRows(db,"schedules",source).filter(x=>x.ACTIVE==="Y").forEach(x=>db.schedules.push({...x,SCHEDULE_ID:uid("S"),TERM_ID:termId}));
      if(p.copyHolidays==="Y")mockRows(db,"holidays",source).filter(x=>x.ACTIVE==="Y").forEach(x=>db.holidays.push({...x,HOLIDAY_ID:uid("H"),TERM_ID:termId}));
      ["국가","교내"].forEach(typeName=>db.budgets.push({WORK_TYPE:typeName,TOTAL_BUDGET:"0",NOTE:"새 학기 초기값",TERM_ID:termId}));writeMock(db);return {ok:true,termId};
    }
    if(action==="activateTerm"){
      mockAdmin(db,p);const target=db.terms.find(x=>x.TERM_ID===p.activateTermId);if(!target)throw new Error("학기를 찾을 수 없어.");db.terms.forEach(x=>{if(x.TERM_ID===target.TERM_ID)x.STATUS="ACTIVE";else if(x.STATUS==="ACTIVE")x.STATUS="ARCHIVED";});db.settings.ACTIVE_TERM_ID=target.TERM_ID;db.settings.TERM_NAME=target.TERM_NAME;writeMock(db);return {ok:true,activeTermId:target.TERM_ID};
    }
    throw new Error(`지원하지 않는 작업: ${action}`);
  }

  // ---------------- settings / date model ----------------
  function dataSettings(d){return d.settings||{};}
  function holidayFor(d,date){return (d.holidays||[]).find(h=>h.ACTIVE==="Y"&&h.DATE===date);}
  function opsEventsFor(d,date,publicMode=false){
    return (d.events||[]).filter(e=>e.ACTIVE==="Y"&&e.DATE===date&&(!publicMode||e.SHOW_PUBLIC==="Y"));
  }
  function eventToneClass(level){
    if(level==="중요")return "important";
    if(level==="안내")return "info";
    return "";
  }
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
  function studentByKey(d,key){return (d.students||[]).find(s=>s.STUDENT_KEY===key);}
  function dateRange(start,end){const out=[],a=parseDate(start),b=parseDate(end);if(!a||!b)return out;for(let d=new Date(a);d<=b;d=addDays(d,1))out.push(isoDate(d));return out;}
  function mondayOf(d){const x=new Date(d);x.setHours(0,0,0,0);const delta=(x.getDay()+6)%7;x.setDate(x.getDate()-delta);return x;}
  function preferredAnchor(d){
    const s=dataSettings(d),today=isoDate(new Date());
    if(s.SEMESTER_START && today<s.SEMESTER_START){const start=parseDate(s.SEMESTER_START);if(start)return start;}
    return new Date();
  }
  function ensureAdminPeriodAnchors(d){
    const s=dataSettings(d),today=isoDate(new Date());
    if(s.SEMESTER_START && today<s.SEMESTER_START){
      const start=parseDate(s.SEMESTER_START);
      if(start && ui.adminWeekAnchor.getFullYear()===new Date().getFullYear() && ui.adminWeekAnchor.getMonth()===new Date().getMonth()){
        ui.adminWeekAnchor=start;ui.adminMonth=new Date(start.getFullYear(),start.getMonth(),1);
      }
    }
  }
  function ensureStudentPeriodAnchor(d){
    const s=dataSettings(d),today=isoDate(new Date());
    if(s.SEMESTER_START && today<s.SEMESTER_START){
      const start=parseDate(s.SEMESTER_START);
      if(start && ui.studentMonth.getFullYear()===new Date().getFullYear() && ui.studentMonth.getMonth()===new Date().getMonth()){
        ui.studentMonth=new Date(start.getFullYear(),start.getMonth(),1);
      }
    }
  }

  // Daily paid-hour ledger. Used by budget + weekly-limit warning.
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
  function projectedCostByMonth(d){
    const s=dataSettings(d),out={};for(const date of dateRange(s.SEMESTER_START,s.BREAK_END)){
      const ym=date.slice(0,7);if(!out[ym])out[ym]={국가:0,교내:0,hoursNational:0,hoursInternal:0};const wage=num(s[`WAGE_${date.slice(0,4)}`]);const led=dailyHoursLedger(d,date);
      Object.entries(led).forEach(([key,h])=>{const st=studentByKey(d,key);if(!st)return;const type=st.WORK_TYPE==="국가"?"국가":"교내";out[ym][type]+=h*wage;if(type==="국가")out[ym].hoursNational+=h;else out[ym].hoursInternal+=h;});
    }return out;
  }
  function weeklySummary(d){
    const s=dataSettings(d),start=parseDate(s.SEMESTER_START),end=parseDate(s.BREAK_END),map={};if(!start||!end)return [];
    for(let m=mondayOf(start);m<=end;m=addDays(m,7)){
      const weekKey=isoDate(m);const totals={};for(let i=0;i<7;i++){const date=isoDate(addDays(m,i));if(date<s.SEMESTER_START||date>s.BREAK_END)continue;const led=dailyHoursLedger(d,date);Object.entries(led).forEach(([k,h])=>totals[k]=(totals[k]||0)+h);}
      const weekPeriods=[];for(let i=0;i<7;i++){const pt=periodType(d,isoDate(addDays(m,i)));if(pt)weekPeriods.push(pt);}const pt=weekPeriods.includes("학기중")?"학기중":weekPeriods.includes("방학중")?"방학중":"학기중";const limit=num(pt==="방학중"?s.BREAK_WEEK_LIMIT:s.SEMESTER_WEEK_LIMIT);
      Object.entries(totals).forEach(([key,h])=>{if(!map[key]||h>map[key].maxHours)map[key]={STUDENT_KEY:key,maxHours:h,weekStart:weekKey,period:pt,limit};});
    }
    return (d.students||[]).filter(x=>x.ACTIVE==="Y").map(st=>({student:st,...(map[st.STUDENT_KEY]||{maxHours:0,weekStart:"",period:"학기중",limit:num(s.SEMESTER_WEEK_LIMIT)})}));
  }

  function normalizeLandingText(v){
    return String(v??"").replace(/\\n/g,"\n");
  }
  function applyLandingText(s={}){
    const title=$("#landing-title"),desc=$("#landing-description");
    if(title && s.LANDING_TITLE)title.textContent=normalizeLandingText(s.LANDING_TITLE);
    if(desc && s.LANDING_DESCRIPTION)desc.textContent=normalizeLandingText(s.LANDING_DESCRIPTION);
    if(s.SYSTEM_NAME)$("#login-system-name").textContent=s.SYSTEM_NAME;
    if(s.TERM_NAME){$("#login-term").textContent=s.TERM_NAME;$("#sidebar-term").textContent=s.TERM_NAME;}

    const link=$("#login-handover-link");
    if(link && s.HANDOVER_PDF_URL){
      link.href=s.HANDOVER_PDF_URL;
      $("#login-handover-label").textContent=s.HANDOVER_PDF_LABEL||"근로장학생 업무 인수인계서 보기";
      link.classList.remove("hidden");
    }else if(link){
      link.classList.add("hidden");
    }
  }

  function publicHomeCacheKey(){return "work_public_home_v030";}
  function readPublicHomeCache(){
    try{
      const x=JSON.parse(localStorage.getItem(publicHomeCacheKey())||"null");
      if(!x?.data||!x.savedAt)return null;
      return x;
    }catch(_e){return null;}
  }
  function writePublicHomeCache(data){
    try{localStorage.setItem(publicHomeCacheKey(),JSON.stringify({savedAt:Date.now(),data}));}catch(_e){}
  }
  function clearPublicHomeCache(){
    try{localStorage.removeItem(publicHomeCacheKey());}catch(_e){}
  }

  function renderLandingPublicNotices(notices=[]){
    const box=$("#landing-public-notices");
    if(!box)return;
    const active=(notices||[])
      .filter(x=>x.ACTIVE!=="N")
      .sort((a,b)=>String(a.DATE||"").localeCompare(String(b.DATE||"")))
      .slice(0,3);

    if(!active.length){
      box.classList.add("hidden");
      box.innerHTML="";
      return;
    }

    box.classList.remove("hidden");
    box.innerHTML=`<div class="landing-public-notices-head">NOTICE · 근로 안내</div>
      ${active.map(n=>`<div class="landing-public-notice">
        <span class="date">${esc(fmtDate(n.DATE))}</span>
        <div><strong>${esc(n.TITLE||"안내")}</strong><p>${esc(n.CONTENT||"")}</p></div>
        ${n.LINK?`<a href="${esc(n.LINK)}" target="_blank" rel="noopener">열기 ↗</a>`:""}
      </div>`).join("")}`;
  }

  async function loadPublicHome(force=false,attempt=1){
    const cached=!force?readPublicHomeCache():null;
    if(cached?.data){
      state.publicHome=cached.data;
      applyLandingText(cached.data.settings||{});
      renderLandingPublicNotices(cached.data.notices||[]);
      updateTermChrome(cached.data);
    }
    try{
      const r=await api("getPublicHome");
      state.publicHome=r;
      writePublicHomeCache(r);
      applyLandingText(r.settings||{});
      renderLandingPublicNotices(r.notices||[]);
      updateTermChrome(r);
    }catch(e){
      console.warn(`첫 화면 정보 로딩 실패 ${attempt}/3`,e);
      if(!cached && attempt<3)setTimeout(()=>loadPublicHome(force,attempt+1),attempt*700);
    }
  }

  function studentQuickLinks(d){
    const s=dataSettings(d), links=[];
    if(s.HANDOVER_PDF_URL) links.push({icon:"📄",label:s.HANDOVER_PDF_LABEL||"근로장학생 업무 인수인계서",url:s.HANDOVER_PDF_URL,desc:"업무 시작 전 참고자료"});
    if(s.DONATION_LINK_URL) links.push({icon:"📦",label:s.DONATION_LINK_LABEL||"무인기부코너 관리 시트",url:s.DONATION_LINK_URL,desc:"재고·운영 관리 바로가기"});
    if(!links.length)return "";
    return `<div class="section-head"><div><h3>업무 바로가기</h3><p>자주 쓰는 문서와 관리 시트.</p></div></div><div class="quick-link-grid">${links.map(x=>`<a class="quick-link-card" href="${esc(x.url)}" target="_blank" rel="noopener"><span class="quick-link-icon">${x.icon}</span><span><strong>${esc(x.label)}</strong><small>${esc(x.desc)}</small></span><b>↗</b></a>`).join("")}</div>`;
  }

  // ---------------- login / nav ----------------
  async function init(){
    $("#login-system-name").textContent=CONFIG.SYSTEM_NAME||"근로장학생 근무관리";$("#login-term").textContent=CONFIG.TERM_NAME||"학기 정보 불러오는 중";$("#sidebar-name").textContent=CONFIG.SYSTEM_NAME||"근로장학생 관리";$("#sidebar-term").textContent=CONFIG.TERM_NAME||"학기 정보 불러오는 중";$("#mode-badge").textContent=CONFIG.DEMO_MODE?"DEMO":"LIVE";$("#today-label").textContent=new Intl.DateTimeFormat("ko-KR",{dateStyle:"full"}).format(new Date());
    loadPublicHome();
    $$('[data-login-tab]').forEach(b=>b.onclick=()=>{$$('[data-login-tab]').forEach(x=>x.classList.toggle('active',x===b));$("#student-login-form").classList.toggle("hidden",b.dataset.loginTab!=="student");$("#admin-login-form").classList.toggle("hidden",b.dataset.loginTab!=="admin");$("#demo-preview-box").classList.toggle("hidden",!CONFIG.DEMO_MODE||b.dataset.loginTab!=="student");$("#login-student-resources").classList.toggle("hidden",b.dataset.loginTab!=="student");});
    $("#student-login-form").onsubmit=studentLogin;$("#admin-login-form").onsubmit=adminLogin;$$('.logout-btn').forEach(b=>b.onclick=logout);$$('.refresh-btn').forEach(b=>b.onclick=()=>state.view&&navigate(state.view,{force:true}));
    $$('[data-demo="admin"]').forEach(b=>b.onclick=()=>$("#admin-pin").value="1234");
    if(CONFIG.DEMO_MODE){$("#demo-preview-box").classList.remove("hidden");const r=await api("getDemoStudents");$("#demo-student-select").innerHTML=r.students.map(x=>`<option value="${esc(x.STUDENT_KEY)}">${esc(x.NAME)}</option>`).join("");if(r.students.some(x=>x.STUDENT_KEY==="K05"))$("#demo-student-select").value="K05";$("#demo-preview-btn").onclick=demoPreview;}
    bindNav();
  }
  async function demoPreview(){
    try{
      const previewKey=$("#demo-student-select").value;
      const r=await api("getStudentDashboard",{previewKey});
      state.mode="student";state.auth={previewKey};state.student=r.student;state.studentData=r;state.selectedTermId=r.activeTermId||null;
      enterApp("student-home",{useLoaded:true});
    }catch(e){toast(e.message);}
  }
  async function studentLogin(e){
    e.preventDefault();
    try{
      const studentId=$("#student-id").value.trim(),loginPin=$("#student-login-pin").value.trim();
      const r=await api("getStudentDashboard",{studentId,loginPin});
      state.mode="student";state.auth={studentId,loginPin};state.student=r.student;state.studentData=r;state.selectedTermId=r.activeTermId||null;
      enterApp("student-home",{useLoaded:true});
    }catch(err){toast(err.message);}
  }
  async function adminLogin(e){
    e.preventDefault();
    try{
      const pin=$("#admin-pin").value.trim();
      const r=await api("getAdminDashboard",{pin});
      state.mode="admin";state.auth={pin};state.adminData=r;state.selectedTermId=r.selectedTermId||r.activeTermId||null;
      enterApp("admin-dashboard",{useLoaded:true});
    }catch(err){toast(err.message);}
  }
  function enterApp(view,opts={}){
    $("#login-screen").classList.add("hidden");
    $("#app-shell").classList.remove("hidden");
    $("#admin-sidebar").classList.toggle("hidden",state.mode!=="admin");
    $("#student-bottom-nav").classList.toggle("hidden",state.mode!=="student");
    $(".main").classList.toggle("student-mode",state.mode==="student");
    updateTermChrome(state.mode==="admin"?state.adminData:state.studentData);
    navigate(view,{force:!opts.useLoaded});
  }
  function logout(){Object.assign(state,{mode:null,auth:null,student:null,adminData:null,studentData:null,view:null,selectedTermId:null});$("#app-shell").classList.add("hidden");$("#login-screen").classList.remove("hidden");closeModal();loadPublicHome(true);}
  function bindNav(){$$("#admin-nav [data-view],#student-bottom-nav [data-view]").forEach(b=>b.onclick=()=>navigate(b.dataset.view));}
  async function navigate(view,opts={}){state.view=view;$$('#admin-nav [data-view],#student-bottom-nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const titles={
    "admin-dashboard":["WORKSPACE","대시보드"],"admin-schedule":["SCHEDULE","근무표"],"admin-absence":["ABSENCE & SUBSTITUTE","결근·대타"],"admin-extra":["EXTRA SHIFT","추가근무"],"admin-students":["STUDENTS","학생관리"],"admin-budget":["BUDGET & HOURS","예산·시간"],"admin-notices":["NOTICE","공지"],"admin-terms":["TERMS","학기 관리"],"admin-settings":["SETTINGS","운영설정"],
    "student-home":["TODAY","홈"],"student-schedule":["MY CALENDAR","내 달력"],"student-substitute":["SUBSTITUTE","대타 모집"],"student-extra":["EXTRA SHIFT","추가근무"],"student-records":["HISTORY","내 기록"]};$("#page-eyebrow").textContent=titles[view]?.[0]||"WORKSPACE";$("#page-title").textContent=titles[view]?.[1]||"";
    const hasData=state.mode==="admin"?!!state.adminData:!!state.studentData;
    if(hasData&&!opts.force){render(view);return;}
    $("#page-content").innerHTML='<div class="card"><div class="empty">데이터 불러오는 중...</div></div>';
    try{
      if(state.mode==="admin")state.adminData=await api("getAdminDashboard",state.auth);
      else{
        state.studentData=await api("getStudentDashboard",state.auth);
        state.student=state.studentData.student;
      }
      updateTermChrome(state.mode==="admin"?state.adminData:state.studentData);render(view);
    }catch(e){
      $("#page-content").innerHTML=`<div class="card"><div class="empty">${esc(e.message)}</div></div>`;
    }
  }
  function render(v){({"admin-dashboard":renderAdminDashboard,"admin-schedule":renderAdminSchedule,"admin-absence":renderAdminAbsence,"admin-extra":renderAdminExtra,"admin-students":renderAdminStudents,"admin-budget":renderAdminBudget,"admin-notices":renderAdminNotices,"admin-terms":renderAdminTerms,"admin-settings":renderAdminSettings,"student-home":renderStudentHome,"student-schedule":renderStudentCalendar,"student-substitute":renderStudentSubstitute,"student-extra":renderStudentExtra,"student-records":renderStudentRecords}[v]||(()=>{}))();applyAdminReadOnly();}
  function applyAdminReadOnly(){
    if(!adminReadOnly())return;
    const root=$("#page-content"),term=selectedTermName(state.adminData);
    root.insertAdjacentHTML("afterbegin",`<div class="readonly-banner"><strong>${esc(term)} 비활성 학기 조회</strong><span>기록 보호를 위해 읽기 전용입니다. 수정하려면 먼저 이 학기를 현재 운영 학기로 활성화하세요.</span></div>`);
    $$('input,select,textarea,.del-schedule,.approve-sub,.reject-sub,.delete-sub,.delete-absence,.del-shift,.del-join,.edit-student,.del-student,#new-student,#add-schedule,#new-admin-absence,#new-extra,#edit-budget,#new-public-notice,.del-public-notice,#new-notice,.del-notice,#add-event,.del-event,#add-holiday,.del-holiday,.shared-memo-submit,.shared-memo-delete',root).forEach(el=>{el.disabled=true;});
  }

  // ---------------- common UI ----------------
  function badge(text,tone="green"){return `<span class="badge ${tone}">${esc(text)}</span>`;}
  function absenceBadge(a){if(a.STATUS==="대타모집")return badge("대타 모집중","red");if(a.STATUS==="대타확정")return badge(`대타 확정 · ${a.SUBSTITUTE_NAME}`,"green");if(a.STATUS==="취소")return badge("취소","amber");return badge(a.STATUS||"-");}
  function noticeList(d,admin=false){const arr=(d.notices||[]).filter(n=>n.ACTIVE==="Y").sort((a,b)=>String(b.DATE).localeCompare(String(a.DATE)));if(!arr.length)return '<div class="empty">등록된 공지가 없어.</div>';return `<div class="mobile-list">${arr.map(n=>`<div class="notice"><h4>${esc(n.TITLE)}</h4><p>${esc(n.CONTENT)} ${n.LINK?`<a href="${esc(n.LINK)}" target="_blank" rel="noopener">바로가기</a>`:""}</p>${admin?`<div class="action-row" style="margin-top:9px"><button class="danger compact del-notice" data-id="${esc(n.NOTICE_ID)}">삭제</button></div>`:""}</div>`).join("")}</div>`;}
  function sharedMemoCard(d,role){
    if(!d.features?.sharedMemos)return "";
    const memos=d.sharedMemos||[],studentKey=d.student?.STUDENT_KEY||"";
    return `<section class="card shared-memo-card">
      <div class="shared-memo-head"><div><h3>근무 공유 메모</h3><p>다음 근무자에게 전달할 업무 내용을 남겨줘. 공지와는 별도로 모든 근로학생이 함께 봐.</p></div>${badge("디지털 인수인계","blue")}</div>
      <form class="shared-memo-form"><textarea name="content" maxlength="500" placeholder="예: OO 서류는 여기까지 정리했습니다. 다음 근무자분 확인 부탁드립니다." aria-label="근무 공유 메모 내용" required></textarea><div class="shared-memo-compose"><small class="shared-memo-count">0 / 500</small><button class="primary shared-memo-submit" type="submit">등록</button></div></form>
      <div class="shared-memo-list">${memos.map(m=>{const canDelete=role==="admin"||(m.AUTHOR_ROLE==="STUDENT"&&m.AUTHOR_ID===studentKey);return `<article class="shared-memo-item"><p>${esc(m.CONTENT)}</p><div class="shared-memo-meta"><span><strong>${esc(m.AUTHOR_NAME||"-")}</strong>${m.AUTHOR_ROLE==="ADMIN"?` ${badge("관리자","green")}`:""} · ${esc(fmtDateTime(m.CREATED_AT))}</span>${canDelete?`<button class="danger compact shared-memo-delete" type="button" data-id="${esc(m.MEMO_ID)}">삭제</button>`:""}</div></article>`;}).join("")||'<div class="empty">아직 공유 메모가 없어. 첫 인수인계를 남겨줘.</div>'}</div>
      ${d.sharedMemoHasMore?'<button class="ghost wide shared-memo-more" type="button">이전 메모 더보기</button>':""}
    </section>`;
  }
  function bindSharedMemos(d,role){
    const form=$(".shared-memo-form"),input=form?.elements.content,count=$(".shared-memo-count");
    if(input&&count)input.oninput=()=>count.textContent=`${input.value.length} / 500`;
    if(form)form.onsubmit=async e=>{e.preventDefault();const content=String(input.value||"").trim();if(!content){toast("공유 메모 내용을 입력해줘.");return;}if(content.length>500){toast("공유 메모는 500자까지 입력할 수 있어.");return;}const button=$(".shared-memo-submit",form);button.disabled=true;try{await api("createSharedMemo",{...state.auth,role,content});toast("공유 메모를 등록했어.");navigate(state.view,{force:true});}catch(err){button.disabled=false;toast(err.message);}};
    $$(".shared-memo-delete").forEach(b=>b.onclick=async()=>{if(!confirm("이 공유 메모를 삭제하시겠습니까?"))return;b.disabled=true;try{await api("deleteSharedMemo",{...state.auth,role,memoId:b.dataset.id});toast("공유 메모를 삭제했어.");navigate(state.view,{force:true});}catch(err){b.disabled=false;toast(err.message);}});
    const more=$(".shared-memo-more");if(more)more.onclick=async()=>{more.disabled=true;try{const r=await api("getSharedMemos",{...state.auth,role,offset:(d.sharedMemos||[]).length,limit:5});d.sharedMemos=[...(d.sharedMemos||[]),...(r.sharedMemos||[])];d.sharedMemoHasMore=!!r.sharedMemoHasMore;navigate(state.view);}catch(err){more.disabled=false;toast(err.message);}};
  }
  function currentStudentScheduleEvents(d,key,date){
    const out=[];(d.schedules||[]).filter(s=>s.STUDENT_KEY===key&&s.ACTIVE==="Y").forEach(s=>{const iv=effectiveInterval(d,s,date);if(!iv)return;out.push({type:"fixed",label:`${iv.start}~${iv.end}`,title:"정규근무",s,iv});});
    validAbsences(d,date).filter(a=>a.STUDENT_KEY===key).forEach(a=>out.push({type:"absence",label:`${a.START}~${a.END}`,title:a.STATUS==="대타확정"?`출근불가 · ${a.SUBSTITUTE_NAME} 대타 확정`:"출근불가 · 대타 모집중",a}));
    validAbsences(d,date).filter(a=>a.STATUS==="대타확정"&&a.SUBSTITUTE_KEY===key).forEach(a=>out.push({type:"sub",label:`${a.START}~${a.END}`,title:`${a.NAME} 대타`,a}));
    (d.extraShifts||[]).filter(sh=>sh.STATUS==="모집중"&&sh.DATE===date).forEach(sh=>{if((d.extraJoins||[]).some(j=>j.SHIFT_ID===sh.SHIFT_ID&&j.STUDENT_KEY===key&&j.STATUS==="신청"))out.push({type:"extra",label:`${sh.START}~${sh.END}`,title:`추가 · ${sh.TITLE}`,sh});});return out;
  }
  function eventInterval_(e){
    const m=String(e?.label||"").match(/^(\d{1,2}:\d{2})~(\d{1,2}:\d{2})$/);
    if(!m)return null;
    const normalize=t=>t.padStart(5,"0");
    return {start:normalize(m[1]),end:normalize(m[2])};
  }
  function groupCalendarEvents_(events){
    const timed=events.map((e,i)=>({e,i,iv:eventInterval_(e)}));
    const result=[], withTime=timed.filter(x=>x.iv).sort((a,b)=>a.iv.start.localeCompare(b.iv.start)||a.iv.end.localeCompare(b.iv.end));
    let group=[], maxEnd="";
    withTime.forEach(x=>{
      if(!group.length){group=[x];maxEnd=x.iv.end;return;}
      if(x.iv.start<maxEnd){group.push(x);if(x.iv.end>maxEnd)maxEnd=x.iv.end;}
      else{result.push(group);group=[x];maxEnd=x.iv.end;}
    });
    if(group.length)result.push(group);
    timed.filter(x=>!x.iv).forEach(x=>result.push([x]));
    return result;
  }
  function calendarEventHTML_(d,e){
    const fixed=e.type==="fixed";
    const style=fixed?` style="${studentChipStyle(studentColor(d,e.studentKey))}"`:"";
    const cls=fixed?"fixed":e.type==="absence"?"absent":e.type==="sub"?"sub":e.type==="extra"?"extra":e.type==="ops"?`ops ${eventToneClass(e.level)}`:"";
    const title=e.message?` title="${esc(e.message)}"`:"";
    return `<div class="cal-event ${cls}"${style}${title}><span class="cal-event-time">${esc(e.label)}</span><span class="cal-event-name">${esc(e.title)}</span></div>`;
  }
  function calendarHTML(d,month,studentKey=null,opts={}){
    const y=month.getFullYear(),m=month.getMonth(),first=new Date(y,m,1),start=addDays(first,-first.getDay()),today=isoDate(new Date());let cells="";
    for(let i=0;i<42;i++){
      const x=addDays(start,i),date=isoDate(x),outside=x.getMonth()!==m,h=holidayFor(d,date);let events=[];
      if(studentKey){
        events=currentStudentScheduleEvents(d,studentKey,date).map(e=>({...e,studentKey:e.type==="sub"?e.a?.SUBSTITUTE_KEY:studentKey}));
      }else{
        const entries=activeSchedulesForDate(d,date);
        entries.forEach(({s,iv})=>{
          const a=validAbsences(d,date).find(a=>a.STUDENT_KEY===s.STUDENT_KEY&&overlap(a.START,a.END,iv.start,iv.end));
          if(!a)events.push({type:"fixed",label:`${iv.start}~${iv.end}`,title:s.NAME,studentKey:s.STUDENT_KEY});
          else if(a.STATUS==="대타확정")events.push({type:"sub",label:`${a.START}~${a.END}`,title:`${a.SUBSTITUTE_NAME}↺`,studentKey:a.SUBSTITUTE_KEY});
          else events.push({type:"absence",label:`${a.START}~${a.END}`,title:`공석(${s.NAME})`});
        });
        if(!opts.publicMode){
          (d.extraShifts||[]).filter(sh=>sh.STATUS!=="삭제"&&sh.DATE===date).forEach(sh=>{
            const joined=(d.extraJoins||[]).filter(j=>j.SHIFT_ID===sh.SHIFT_ID&&j.STATUS==="신청").length;
            events.push({type:"extra",label:`${sh.START}~${sh.END}`,title:`${sh.TITLE} ${joined}/${sh.CAPACITY}`});
          });
        }
      }

      opsEventsFor(d,date,!!opts.publicMode).forEach(ev=>{
        events.unshift({type:"ops",label:ev.LEVEL||"업무안내",title:ev.TITLE,message:ev.MESSAGE||"",level:ev.LEVEL||"주의"});
      });

      const shown=events.slice(0,7);
      const groups=groupCalendarEvents_(shown);
      const eventHTML=groups.map(g=>{
        if(g.length===1)return `<div class="cal-event-row">${calendarEventHTML_(d,g[0].e)}</div>`;
        return `<div class="cal-event-row overlap">${g.map(x=>calendarEventHTML_(d,x.e)).join("")}</div>`;
      }).join("");

      const past=date<today;
      cells+=`<div class="cal-day ${outside?"outside":""} ${h?"holiday":""} ${date===today?"today":""} ${past?"past":""}">
        <div class="cal-date"><span>${x.getDate()}</span>${h?`<span class="holiday-name">${esc(h.NAME)}</span>`:""}</div>
        ${eventHTML}
        ${events.length>7?`<div class="cal-event muted">+${events.length-7}건</div>`:""}
      </div>`;
    }
    return `<div class="calendar"><div class="calendar-head">${ALL_DAYS.map(x=>`<div>${x}</div>`).join("")}</div><div class="calendar-grid">${cells}</div></div><div class="legend"><span>학생별 색상: 정규근무</span><span>빨강: 출근불가/공석</span><span>파랑: 대타</span><span>주황: 업무이벤트/추가근무</span><span>연빨강 배경: 공휴일</span><span>취소선: 지나간 일정</span></div>`;
  }
  function weekBoard(d,anchor){
    const mon=mondayOf(anchor),dates=DAYS.map((day,i)=>({day,date:isoDate(addDays(mon,i)),label:`${addDays(mon,i).getMonth()+1}/${addDays(mon,i).getDate()}`}));const slots=[];for(let h=9;h<17;h++){slots.push(`${String(h).padStart(2,"0")}:00`);slots.push(`${String(h).padStart(2,"0")}:30`);}let html=`<div class="week-board"><div class="week-grid"><div class="week-cell head">시간</div>${dates.map(dy=>`<div class="week-cell head">${dy.day}<br><small>${dy.label}${holidayFor(d,dy.date)?` · ${esc(holidayFor(d,dy.date).NAME)}`:""}</small></div>`).join("")}`;
    slots.forEach(t=>{const end=(m=>`${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`)(timeMin(t)+30);html+=`<div class="week-cell time">${t}~${end}</div>`;dates.forEach(dy=>{const hol=holidayFor(d,dy.date);if(hol){html+=`<div class="week-cell slot lunch-row">공휴일</div>`;return;}const lunch=timeMin(t)>=720&&timeMin(t)<780;const people=[];activeSchedulesForDate(d,dy.date).forEach(({s,iv})=>{if(!overlap(iv.start,iv.end,t,end))return;if(lunch&&s.LUNCH_ALLOWED!=="Y")return;const a=validAbsences(d,dy.date).find(a=>a.STUDENT_KEY===s.STUDENT_KEY&&overlap(a.START,a.END,t,end));if(!a)people.push({name:s.NAME,key:s.STUDENT_KEY,sub:false});else if(a.STATUS==="대타확정")people.push({name:a.SUBSTITUTE_NAME,key:a.SUBSTITUTE_KEY,sub:true});});html+=`<div class="week-cell slot ${lunch&&people.length===0?"lunch-row":people.length===0?"empty-slot":people.length===1?"one":"many"}">${lunch&&people.length===0?"점심시간":people.length?people.map(p=>`<span class="person-chip ${p.sub?"sub":""}" style="${studentChipStyle(studentColor(d,p.key))}">${esc(p.name)}${p.sub?"↺":""}</span>`).join(""):'<span class="badge red">공석</span>'}</div>`;});});return html+"</div></div>";
  }
  function scheduleListCards(d,studentKey,days=28){
    const today=new Date(),arr=[];for(let i=0;i<days;i++){const date=isoDate(addDays(today,i));(d.schedules||[]).filter(s=>s.STUDENT_KEY===studentKey&&s.ACTIVE==="Y").forEach(s=>{const iv=effectiveInterval(d,s,date);if(iv)arr.push({date,s,iv});});}
    if(!arr.length)return '<div class="card empty">예정된 근무가 없어.</div>';
    return `<div class="mobile-list">${arr.slice(0,12).map(x=>{const a=validAbsences(d,x.date).find(a=>a.STUDENT_KEY===studentKey&&overlap(a.START,a.END,x.iv.start,x.iv.end));return `<div class="list-card"><div class="top"><div><h4>${fmtDate(x.date)} · ${esc(x.iv.start)}~${esc(x.iv.end)}</h4><p>${esc(x.s.PERIOD_TYPE)} · ${esc(x.iv.mode)} · ${esc(x.s.WORK_TYPE)}근로</p></div>${a?absenceBadge(a):badge("근무 예정")}</div>${a?`<div class="schedule-meta">${a.STATUS==="대타모집"?badge("대타 모집중","red"):a.STATUS==="대타확정"?badge(`${a.SUBSTITUTE_NAME} 대타 확정`,"blue"):""}</div>`:`<div class="actions"><button class="danger compact absence-btn" data-date="${x.date}" data-start="${x.iv.start}" data-end="${x.iv.end}">출근 불가</button></div>`}</div>`;}).join("")}</div>`;
  }

  // ---------------- ADMIN DASHBOARD ----------------
  function statCard(label,n,unit,tone="green",note=""){return `<div class="card stat"><div><div class="label">${esc(label)}</div><div class="number">${esc(n)}<small style="font-size:13px;margin-left:3px">${esc(unit)}</small></div>${note?`<div class="kpi-note">${esc(note)}</div>`:""}</div><div class="stat-icon" style="${tone==="red"?"background:var(--red-soft);color:var(--red)":tone==="amber"?"background:var(--amber-soft);color:var(--amber)":tone==="blue"?"background:var(--blue-soft);color:var(--blue)":""}">●</div></div>`;}
  function renderAdminDashboard(){const d=state.adminData,open=d.absences.filter(a=>a.STATUS==="대타모집"),apps=d.substitutes.filter(x=>x.STATUS==="신청"),warn=weeklySummary(d).filter(x=>x.maxHours>x.limit);$("#page-content").innerHTML=`<div class="grid cols-4">${statCard("활성 학생",d.students.filter(s=>s.ACTIVE==="Y").length,"명")}${statCard("대타 필요",open.length,"건","red")}${statCard("대타 지원",apps.length,"건","amber")}${statCard("주간시간 초과",warn.length,"명",warn.length?"red":"green")}</div>${sharedMemoCard(d,"admin")}<div class="section-head"><div><h3>이번 주 근무표</h3><p>공휴일과 결근·대타 상태까지 반영된 실제 표시야.</p></div><button class="soft" data-go="admin-schedule">주·월 근무표</button></div>${weekBoard(d,preferredAnchor(d))}<div class="grid cols-2" style="margin-top:20px"><div class="card"><h3>대타가 필요한 일정</h3>${open.length?open.slice(0,5).map(a=>`<div class="list-card" style="margin-top:8px"><strong>${fmtDate(a.DATE)} ${esc(a.START)}~${esc(a.END)}</strong><p>${esc(a.NAME)} · ${esc(a.REASON)}</p></div>`).join(""):'<div class="empty">현재 없음</div>'}</div><div class="card"><h3>운영 상태</h3>${warn.length?`<div class="warning-box"><strong>주간 근로시간 초과 경고</strong>${warn.map(x=>`${esc(x.student.NAME)} ${x.maxHours.toFixed(1)}시간 / ${x.limit}시간`).join("<br>")}</div>`:'<div class="ok-box">현재 등록된 일정 기준으로 주간 최대시간 초과 학생은 없어.</div>'}<div class="source-note" style="margin-top:10px">현재 구간: ${esc(periodType(d,isoDate(new Date()))||"운영기간 외")} · ${esc(workHours(d,isoDate(new Date())).mode)}</div></div></div>`;bindSharedMemos(d,"admin");$$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));}

  // ---------------- ADMIN SCHEDULE ----------------
  function renderAdminSchedule(){const d=state.adminData;ensureAdminPeriodAnchors(d);$("#page-content").innerHTML=`<details class="collapse" open><summary><span>주별 근무표</span><small>${fmtDate(isoDate(mondayOf(ui.adminWeekAnchor)))} 주간</small></summary><div class="collapse-body"><div class="month-toolbar"><div class="group"><button class="ghost compact week-prev">← 이전 주</button><button class="ghost compact week-today">이번 주</button><button class="ghost compact week-next">다음 주 →</button></div><button class="primary add-schedule">근무시간 추가</button></div>${weekBoard(d,ui.adminWeekAnchor)}</div></details><details class="collapse"><summary><span>월별 근무표</span><small>${fmtMonth(ui.adminMonth)}</small></summary><div class="collapse-body"><div class="month-toolbar"><h3>${fmtMonth(ui.adminMonth)}</h3><div class="group"><button class="ghost compact month-prev">←</button><button class="ghost compact month-now">이번 달</button><button class="ghost compact month-next">→</button></div></div>${calendarHTML(d,ui.adminMonth,null)}${studentColorLegend(d)}</div></details><div class="section-head"><div><h3>고정근무 목록</h3><p>학기중/방학중 표를 따로 등록할 수 있어. 단축근무 기간에는 시작시각이 자동으로 보정돼.</p></div><button class="primary add-schedule">근무시간 추가</button></div><div class="table-wrap"><table><thead><tr><th>학생</th><th>구분</th><th>기간</th><th>요일</th><th>시간</th><th>점심예외</th><th></th></tr></thead><tbody>${d.schedules.filter(s=>s.ACTIVE==="Y").map(s=>`<tr><td><strong>${esc(s.NAME)}</strong></td><td>${esc(s.WORK_TYPE)}</td><td>${badge(s.PERIOD_TYPE,s.PERIOD_TYPE==="학기중"?"green":"blue")}</td><td>${esc(s.DAY)}</td><td>${esc(s.START)} ~ ${esc(s.END)}</td><td>${s.LUNCH_ALLOWED==="Y"?badge("허용","amber"):"-"}</td><td><button class="danger compact del-schedule" data-id="${esc(s.SCHEDULE_ID)}">삭제</button></td></tr>`).join("")||'<tr><td colspan="7" class="empty">근무표가 없어.</td></tr>'}</tbody></table></div>`;
    $$('.add-schedule').forEach(b=>b.onclick=openScheduleModal);$('.week-prev').onclick=()=>{ui.adminWeekAnchor=addDays(ui.adminWeekAnchor,-7);renderAdminSchedule();};$('.week-next').onclick=()=>{ui.adminWeekAnchor=addDays(ui.adminWeekAnchor,7);renderAdminSchedule();};$('.week-today').onclick=()=>{ui.adminWeekAnchor=new Date();renderAdminSchedule();};$('.month-prev').onclick=()=>{ui.adminMonth=new Date(ui.adminMonth.getFullYear(),ui.adminMonth.getMonth()-1,1);renderAdminSchedule();};$('.month-next').onclick=()=>{ui.adminMonth=new Date(ui.adminMonth.getFullYear(),ui.adminMonth.getMonth()+1,1);renderAdminSchedule();};$('.month-now').onclick=()=>{ui.adminMonth=new Date();renderAdminSchedule();};$$('.del-schedule').forEach(b=>b.onclick=async()=>{if(!confirm('이 고정근무를 삭제할까?'))return;await actAndReload('deleteSchedule',{scheduleId:b.dataset.id},'근무시간을 삭제했어.','admin-schedule');});}
  function openScheduleModal(){const d=state.adminData,students=d.students.filter(s=>s.ACTIVE==="Y");showModal("고정근무 추가",`<form id="schedule-form"><div class="form-grid"><label class="full">학생<select name="studentKey">${students.map(s=>`<option value="${esc(s.STUDENT_KEY)}">${esc(s.NAME)} · ${esc(s.WORK_TYPE)}</option>`).join("")}</select></label><label>기간구분<select name="periodType"><option>학기중</option><option>방학중</option></select></label><label>요일<select name="day">${DAYS.map(x=>`<option>${x}</option>`).join("")}</select></label><label>시작<input type="time" name="start" min="09:00" max="17:00" value="09:00" required></label><label>종료<input type="time" name="end" min="09:00" max="17:00" value="12:00" required></label><label class="full">점심 12~13시<select name="lunchAllowed"><option value="N">원칙대로 근무 제외</option><option value="Y">관리자 예외 허용</option></select></label></div><div class="source-note" style="margin-top:12px">단축근무 기간에는 설정된 출근 가능 시각보다 이른 시간은 화면·예산 계산에서 자동으로 잘려서 반영돼.</div><div class="form-actions"><button type="button" class="ghost modal-cancel">취소</button><button class="primary">추가</button></div></form>`);$('.modal-cancel').onclick=closeModal;$('#schedule-form').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));if(timeMin(o.start)>=timeMin(o.end)){toast('시작/종료 시간을 확인해줘.');return;}try{await api('addSchedule',{...state.auth,...o});closeModal();toast('근무시간을 추가했어.');navigate('admin-schedule',{force:true});}catch(err){toast(err.message);}};}

  // ---------------- ADMIN ABSENCE ----------------
  function renderAdminAbsence(){
    const d=state.adminData,arr=d.absences.filter(a=>a.STATUS!=="삭제").sort((a,b)=>String(b.DATE).localeCompare(String(a.DATE)));
    $("#page-content").innerHTML=`<div class="section-head" style="margin-top:0"><div><h3>결근·대타 관리</h3><p>학생 신청을 처리하거나 관리자가 학생 대신 결근을 등록할 수 있어.</p></div><button id="new-admin-absence" class="primary">관리자 결근 등록</button></div><div class="table-wrap"><table><thead><tr><th>날짜</th><th>원 근무자</th><th>시간</th><th>사유</th><th>상태</th><th>지원/조치</th><th></th></tr></thead><tbody>${arr.map(a=>{const apps=d.substitutes.filter(x=>x.ABSENCE_ID===a.ABSENCE_ID&&x.STATUS!=="삭제");return `<tr><td>${fmtDate(a.DATE)}</td><td><strong>${esc(a.NAME)}</strong></td><td>${esc(a.START)}~${esc(a.END)}</td><td>${esc(a.REASON)}${a.NOTE?`<br><small>${esc(a.NOTE)}</small>`:""}</td><td>${absenceBadge(a)}</td><td>${a.STATUS==="대타모집"?(apps.filter(x=>x.STATUS==="신청").map(x=>`<div class="action-row" style="margin:4px 0"><span>${esc(x.NAME)}</span><button class="soft compact approve-sub" data-id="${esc(x.APP_ID)}">승인</button><button class="ghost compact reject-sub" data-id="${esc(x.APP_ID)}">미선정</button><button class="danger compact delete-sub" data-id="${esc(x.APP_ID)}">삭제</button></div>`).join("")||badge("지원자 없음","amber")):(a.SUBSTITUTE_NAME?esc(a.SUBSTITUTE_NAME):"-")}</td><td><button class="danger compact delete-absence" data-id="${esc(a.ABSENCE_ID)}">삭제</button></td></tr>`;}).join("")||'<tr><td colspan="7" class="empty">결근 신청이 없어.</td></tr>'}</tbody></table></div>`;
    $("#new-admin-absence").onclick=openAdminAbsenceModal;
    $$('.approve-sub').forEach(b=>b.onclick=()=>actAndReload('approveSubstitute',{appId:b.dataset.id},'대타를 확정했어.','admin-absence'));$$('.reject-sub').forEach(b=>b.onclick=()=>actAndReload('rejectSubstitute',{appId:b.dataset.id},'미선정 처리했어.','admin-absence'));$$('.delete-sub').forEach(b=>b.onclick=()=>confirm('이 대타 지원 기록을 삭제할까?')&&actAndReload('deleteSubstitute',{appId:b.dataset.id},'삭제했어.','admin-absence'));$$('.delete-absence').forEach(b=>b.onclick=()=>confirm('이 출근불가/대타 건을 삭제할까?')&&actAndReload('deleteAbsence',{absenceId:b.dataset.id},'삭제했어.','admin-absence'));
  }
  function openAdminAbsenceModal(){
    const students=state.adminData.students.filter(x=>x.ACTIVE==="Y");
    showModal('관리자 결근 등록',`<form id="admin-absence-form"><div class="form-grid"><label class="full">학생<select name="studentKey" required>${students.map(s=>`<option value="${esc(s.STUDENT_KEY)}">${esc(s.NAME)} · ${esc(s.WORK_TYPE)}</option>`).join('')}</select></label><label>날짜<input type="date" name="date" required></label><label>사유<select name="reason"><option>학생 요청</option><option>수업·학사 일정</option><option>질병</option><option>행사 참여</option><option>관리자 확인</option><option>기타</option></select></label><label>시작<input type="time" name="start" value="09:00" required></label><label>종료<input type="time" name="end" value="12:00" required></label><label class="full">관리 메모<textarea name="note" placeholder="등록 경위나 전달사항을 적어줘."></textarea></label></div><div class="source-note" style="margin-top:12px">선택한 학생의 해당 날짜 고정근무와 겹치는 시간만 등록할 수 있으며, 등록 즉시 대타 모집 상태가 됩니다.</div><div class="form-actions"><button type="button" class="ghost modal-cancel">취소</button><button class="primary">결근 등록</button></div></form>`);
    $('.modal-cancel').onclick=closeModal;$('#admin-absence-form').onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target));if(timeMin(values.start)>=timeMin(values.end)){toast('시작/종료 시간을 확인해줘.');return;}try{await api('createAdminAbsence',{...state.auth,...values});closeModal();toast('관리자 결근을 등록했어.');navigate('admin-absence',{force:true});}catch(err){toast(err.message);}};
  }

  // ---------------- ADMIN EXTRA ----------------
  function renderAdminExtra(){const d=state.adminData,shifts=d.extraShifts.filter(x=>x.STATUS!=="삭제");$("#page-content").innerHTML=`<div class="section-head" style="margin-top:0"><div><h3>추가근무 모집</h3><p>창고정리·행사지원 등 정규표 밖의 근무.</p></div><button id="new-extra" class="primary">추가근무 등록</button></div><div class="grid cols-3">${shifts.map(s=>{const joins=d.extraJoins.filter(x=>x.SHIFT_ID===s.SHIFT_ID&&x.STATUS==="신청");return `<div class="card"><span class="badge blue">${esc(s.STATUS)}</span><h3 style="margin-top:12px">${esc(s.TITLE)}</h3><p style="color:var(--muted);font-size:13px">${fmtDate(s.DATE)} · ${esc(s.START)}~${esc(s.END)}</p><p style="font-size:13px">${esc(s.DESCRIPTION)}</p><strong>${joins.length} / ${esc(s.CAPACITY)}명</strong><div class="mobile-list" style="margin-top:10px">${joins.map(j=>`<div class="action-row"><span>${esc(j.NAME)}</span><button class="danger compact del-join" data-id="${esc(j.JOIN_ID)}">신청 삭제</button></div>`).join("")}</div><div class="action-row" style="margin-top:14px"><button class="danger compact del-shift" data-id="${esc(s.SHIFT_ID)}">추가근무 삭제</button></div></div>`;}).join("")||'<div class="card empty">등록된 추가근무가 없어.</div>'}</div>`;$('#new-extra').onclick=openExtraModal;$$('.del-shift').forEach(b=>b.onclick=()=>confirm('추가근무와 연결된 신청을 함께 삭제할까?')&&actAndReload('deleteExtraShift',{shiftId:b.dataset.id},'삭제했어.','admin-extra'));$$('.del-join').forEach(b=>b.onclick=()=>actAndReload('deleteExtraJoin',{joinId:b.dataset.id},'신청을 삭제했어.','admin-extra'));}
  function openExtraModal(){showModal('추가근무 등록',`<form id="extra-form"><div class="form-grid"><label class="full">제목<input name="title" placeholder="예: 창고 정리" required></label><label>날짜<input type="date" name="date" required></label><label>모집인원<input type="number" name="capacity" min="1" value="3" required></label><label>시작<input type="time" name="start" value="14:00" required></label><label>종료<input type="time" name="end" value="17:00" required></label><label class="full">설명<textarea name="description"></textarea></label></div><div class="form-actions"><button type="button" class="ghost modal-cancel">취소</button><button class="primary">등록</button></div></form>`);$('.modal-cancel').onclick=closeModal;$('#extra-form').onsubmit=async e=>{e.preventDefault();try{await api('createExtraShift',{...state.auth,...Object.fromEntries(new FormData(e.target))});closeModal();toast('추가근무를 등록했어.');navigate('admin-extra',{force:true});}catch(err){toast(err.message);}};}

  // ---------------- ADMIN STUDENTS ----------------
  function renderAdminStudents(){const d=state.adminData,students=d.students.filter(x=>x.ACTIVE==="Y");$("#page-content").innerHTML=`<div class="section-head" style="margin-top:0"><div><h3>학생 DB</h3><p>로그인 PIN은 전화번호와 독립적으로 관리돼. 학생별 색상은 최대 10명까지 자동으로 겹치지 않게 배정돼.</p></div><button id="new-student" class="primary">학생 추가</button></div><div class="table-wrap"><table><thead><tr><th>색상</th><th>이름</th><th>학번</th><th>로그인 PIN</th><th>구분</th><th>학과</th><th>연락처</th><th>관리자 메모</th><th></th></tr></thead><tbody>${students.map(s=>`<tr><td><span class="student-color-swatch" style="background:${esc(s.STUDENT_COLOR||STUDENT_COLORS[0])}"></span></td><td><strong>${esc(s.NAME)}</strong></td><td>${esc(s.STUDENT_ID||'미입력')}</td><td><code>${esc(s.LOGIN_PIN||s.PHONE_LAST4||'미입력')}</code></td><td>${badge(s.WORK_TYPE,s.WORK_TYPE==="국가"?"green":"blue")}</td><td>${esc(s.DEPARTMENT||'-')}</td><td>${esc(s.PHONE||'미입력')}</td><td>${esc(s.ADMIN_MEMO||'')}</td><td><div class="action-row"><button class="ghost compact edit-student" data-key="${esc(s.STUDENT_KEY)}">수정</button><button class="danger compact del-student" data-key="${esc(s.STUDENT_KEY)}">삭제</button></div></td></tr>`).join("")}</tbody></table></div>`;$('#new-student').onclick=()=>openStudentModal();$$('.edit-student').forEach(b=>b.onclick=()=>openStudentModal(d.students.find(x=>x.STUDENT_KEY===b.dataset.key)));$$('.del-student').forEach(b=>b.onclick=()=>confirm('학생을 근로 종료 처리하고 고정근무에서도 숨길까? 기존 기록은 보존돼.')&&actAndReload('deleteStudent',{studentKey:b.dataset.key},'근로 종료 처리했어.','admin-students'));}
  function openStudentModal(s=null){const suggested=s?.STUDENT_COLOR||nextStudentColor(state.adminData?.students||[],s?.STUDENT_KEY||"");showModal(s?'학생 수정':'학생 추가',`<form id="student-form"><input type="hidden" name="studentKey" value="${esc(s?.STUDENT_KEY||'')}"><div class="form-grid"><label>이름<input name="name" value="${esc(s?.NAME||'')}" required></label><label>학번<input name="studentId" value="${esc(s?.STUDENT_ID||'')}" placeholder="학번"></label><label>전화번호<input name="phone" value="${esc(s?.PHONE||'')}" placeholder="010-0000-0000"></label><label>로그인 PIN<input name="loginPin" value="${esc(s?.LOGIN_PIN||s?.PHONE_LAST4||'')}" maxlength="12" placeholder="미입력 시 전화번호 뒤 4자리 사용"></label><label>근로구분<select name="workType"><option ${s?.WORK_TYPE==='국가'?'selected':''}>국가</option><option ${s?.WORK_TYPE==='교내'?'selected':''}>교내</option></select></label><label>학생 색상<div class="color-field"><input type="color" name="studentColor" value="${esc(suggested)}"><span>근무표에서 이 색으로 표시</span></div></label><label class="full">학과<input name="department" value="${esc(s?.DEPARTMENT||'')}"></label><label class="full">관리자 메모<textarea name="memo">${esc(s?.ADMIN_MEMO||'')}</textarea></label></div><div class="source-note" style="margin-top:12px">기존 학생의 PIN을 비워서 저장하면 현재 PIN을 유지해. 새 학생은 PIN을 비우면 전화번호 뒤 4자리를 최초 PIN으로 사용해.</div><div class="form-actions"><button type="button" class="ghost modal-cancel">취소</button><button class="primary">저장</button></div></form>`);$('.modal-cancel').onclick=closeModal;$('#student-form').onsubmit=async e=>{e.preventDefault();try{await api('upsertStudent',{...state.auth,...Object.fromEntries(new FormData(e.target)),active:'Y'});closeModal();toast('저장했어.');navigate('admin-students');}catch(err){toast(err.message);}};}

  function renderAdminBudget(){const d=state.adminData,costs=projectedCostByMonth(d),weeks=weeklySummary(d),national=num(d.budgets.find(x=>x.WORK_TYPE==='국가')?.TOTAL_BUDGET),internal=num(d.budgets.find(x=>x.WORK_TYPE==='교내')?.TOTAL_BUDGET),sumN=Object.values(costs).reduce((a,x)=>a+x.국가,0),sumI=Object.values(costs).reduce((a,x)=>a+x.교내,0);const budgetCard=(type,total,used)=>{const remain=total-used,p=total>0?Math.min(100,used/total*100):0;return `<div class="card"><div class="label">${type}근로 총예산</div><div class="big-money money">${total>0?money(total):'0원 · 미확정 가능'}</div><div class="kpi-note">등록 근무표 기준 예상 소요 ${money(used)} · ${total>0?`예상 잔액 ${money(remain)}`:'예산 0이어도 시스템은 정상 계산'}</div>${total>0?`<div class="progress ${used>total?'danger':''}"><i style="width:${p}%"></i></div>`:''}</div>`;};$("#page-content").innerHTML=`<div class="grid cols-2">${budgetCard('국가',national,sumN)}${budgetCard('교내',internal,sumI)}</div><div class="section-head"><div><h3>월별 예상 소요 예산</h3><p>공휴일·결근·대타확정·추가근무 신청과 연도별 시급을 반영한 계획값이야.</p></div><button id="edit-budget" class="primary">총예산 수정</button></div><div class="table-wrap"><table><thead><tr><th>월</th><th>국가 시간</th><th>국가 예상액</th><th>교내 시간</th><th>교내 예상액</th><th>적용 시급</th></tr></thead><tbody>${Object.keys(costs).sort().map(ym=>`<tr><td><strong>${ym}</strong></td><td>${costs[ym].hoursNational.toFixed(1)}h</td><td class="money">${money(costs[ym].국가)}</td><td>${costs[ym].hoursInternal.toFixed(1)}h</td><td class="money">${money(costs[ym].교내)}</td><td>${money(dataSettings(d)[`WAGE_${ym.slice(0,4)}`])}/h</td></tr>`).join('')}</tbody></table></div><div class="section-head"><div><h3>학생별 주간 최대시간 검사</h3><p>학기중 ${esc(dataSettings(d).SEMESTER_WEEK_LIMIT)}시간 / 방학중 ${esc(dataSettings(d).BREAK_WEEK_LIMIT)}시간 기준.</p></div></div><div class="table-wrap"><table><thead><tr><th>학생</th><th>근로구분</th><th>가장 많은 주</th><th>시간</th><th>한도</th><th>상태</th></tr></thead><tbody>${weeks.map(w=>`<tr class="${w.maxHours>w.limit?'week-limit-high':w.maxHours>w.limit-2?'week-limit-near':''}"><td><strong>${esc(w.student.NAME)}</strong></td><td>${esc(w.student.WORK_TYPE)}</td><td>${w.weekStart?fmtDate(w.weekStart):'-'}</td><td>${w.maxHours.toFixed(1)}h</td><td>${w.limit}h</td><td>${w.maxHours>w.limit?badge('초과','red'):w.maxHours>w.limit-2?badge('주의','amber'):badge('정상','green')}</td></tr>`).join('')}</tbody></table></div>`;$('#edit-budget').onclick=()=>openBudgetModal(national,internal);}
  function openBudgetModal(national,internal){showModal('총예산 설정',`<form id="budget-form"><div class="form-grid"><label>국가근로 총예산<input type="number" min="0" name="national" value="${national}"></label><label>교내근로 총예산<input type="number" min="0" name="internal" value="${internal}"></label></div><div class="source-note" style="margin-top:12px">예산이 아직 확정되지 않았으면 0으로 저장해도 돼. 월별 예상 소요액은 계속 계산돼.</div><div class="form-actions"><button type="button" class="ghost modal-cancel">취소</button><button class="primary">저장</button></div></form>`);$('.modal-cancel').onclick=closeModal;$('#budget-form').onsubmit=async e=>{e.preventDefault();try{await api('saveBudget',{...state.auth,...Object.fromEntries(new FormData(e.target))});closeModal();toast('예산을 저장했어.');navigate('admin-budget',{force:true});}catch(err){toast(err.message);}};}

  // ---------------- ADMIN NOTICE ----------------
  function renderAdminNotices(){
    const d=state.adminData;
    const publicNotices=(d.publicNotices||[]).filter(x=>x.ACTIVE!=="N").sort((a,b)=>String(a.DATE).localeCompare(String(b.DATE)));

    $("#page-content").innerHTML=`
      <div class="section-head" style="margin-top:0">
        <div><h3>첫 화면 공지</h3><p>로그인 전 녹색 첫 화면에 날짜별로 최대 3건까지 노출돼.</p></div>
        <button id="new-public-notice" class="primary">첫 화면 공지 등록</button>
      </div>
      <div class="public-notice-grid">
        ${publicNotices.map(n=>`<div class="public-notice-card">
          <div class="top">
            <div><span class="public-notice-date">${esc(fmtDate(n.DATE))}</span><h4>${esc(n.TITLE||"안내")}</h4></div>
            <button class="danger compact del-public-notice" data-id="${esc(n.PUBLIC_NOTICE_ID)}">삭제</button>
          </div>
          <p>${esc(n.CONTENT||"")}</p>
          ${n.LINK?`<a href="${esc(n.LINK)}" target="_blank" rel="noopener">링크 열기 ↗</a>`:""}
        </div>`).join("")||'<div class="card"><div class="empty">첫 화면 공지가 없어.</div></div>'}
      </div>

      <div class="section-head">
        <div><h3>학생 로그인 후 공지</h3><p>학생 홈의 ‘오늘의 안내’ 영역에 표시되는 기존 공지야.</p></div>
        <button id="new-notice" class="primary">학생 공지 등록</button>
      </div>
      ${noticeList(d,true)}
    `;

    $('#new-public-notice').onclick=openPublicNoticeModal;
    $$('.del-public-notice').forEach(b=>b.onclick=()=>confirm('이 첫 화면 공지를 삭제할까?')&&actAndReload('deletePublicNotice',{publicNoticeId:b.dataset.id},'첫 화면 공지를 삭제했어.','admin-notices'));
    $('#new-notice').onclick=openNoticeModal;
    $$('.del-notice').forEach(b=>b.onclick=()=>confirm('공지를 삭제할까?')&&actAndReload('deleteNotice',{noticeId:b.dataset.id},'삭제했어.','admin-notices'));
  }

  function openPublicNoticeModal(){
    showModal('첫 화면 공지 등록',`<form id="public-notice-form"><div class="form-grid">
      <label>날짜<input type="date" name="date" value="${isoDate(new Date())}" required></label>
      <label>제목<input name="title" placeholder="예: 9월 근로 시작 안내" required></label>
      <label class="full">내용<textarea name="content" placeholder="학생들이 로그인 전에 알아야 할 내용을 적어줘." required></textarea></label>
      <label class="full">링크<input type="url" name="link" placeholder="https://... (선택)"></label>
    </div><div class="form-actions"><button type="button" class="ghost modal-cancel">취소</button><button class="primary">등록</button></div></form>`);
    $('.modal-cancel').onclick=closeModal;
    $('#public-notice-form').onsubmit=async e=>{
      e.preventDefault();
      try{
        await api('createPublicNotice',{...state.auth,...Object.fromEntries(new FormData(e.target))});
        closeModal();
        clearPublicHomeCache();
        loadPublicHome(true);
        toast('첫 화면 공지를 등록했어.');
        navigate('admin-notices',{force:true});
      }catch(err){toast(err.message);}
    };
  }

  function openNoticeModal(){showModal('공지 등록',`<form id="notice-form"><div class="form-grid"><label>날짜<input type="date" name="date" value="${isoDate(new Date())}" required></label><label>제목<input name="title" value="오늘의 안내" required></label><label class="full">내용<textarea name="content" required></textarea></label><label class="full">링크<input type="url" name="link" placeholder="https://..."></label></div><div class="form-actions"><button type="button" class="ghost modal-cancel">취소</button><button class="primary">등록</button></div></form>`);$('.modal-cancel').onclick=closeModal;$('#notice-form').onsubmit=async e=>{e.preventDefault();try{await api('createNotice',{...state.auth,...Object.fromEntries(new FormData(e.target))});closeModal();toast('공지를 등록했어.');navigate('admin-notices',{force:true});}catch(err){toast(err.message);}};}

  // ---------------- ADMIN TERMS ----------------
  function renderAdminTerms(){
    const d=state.adminData,activeId=d.activeTermId||d.settings?.ACTIVE_TERM_ID,terms=[...(d.terms||[])].sort((a,b)=>String(b.START_DATE||b.TERM_ID).localeCompare(String(a.START_DATE||a.TERM_ID)));
    $("#page-content").innerHTML=`<div class="section-head" style="margin-top:0"><div><h3>학기 목록</h3><p>과거 기록은 보존되며 조회 시 자동으로 읽기 전용이 됩니다.</p></div><button id="new-term" class="primary">새 학기 생성</button></div>
      <div class="term-list">${terms.map(t=>{const active=t.TERM_ID===activeId,selected=t.TERM_ID===(d.selectedTermId||state.selectedTermId),status=t.STATUS==="INACTIVE"?"비활성":"종료";return `<article class="term-card ${active?"active":""}"><div><div class="term-title"><h3>${esc(t.TERM_NAME)}</h3>${active?badge("현재 운영","green"):badge(status,"gray")}${selected&&!active?badge("조회 중","blue"):""}</div><p>${fmtDate(t.START_DATE)} ~ ${fmtDate(t.END_DATE)}</p><small>내부 ID · ${esc(t.TERM_ID)}</small></div><div class="term-actions"><button class="ghost view-term" data-id="${esc(t.TERM_ID)}">${selected?"조회 새로고침":"이 학기 조회"}</button>${active?"":`<button class="soft activate-term" data-id="${esc(t.TERM_ID)}" data-name="${esc(t.TERM_NAME)}">현재 학기로 활성화</button>`}</div></article>`;}).join("")||'<div class="card empty">등록된 학기가 없습니다. Apps Script의 migrateTerms()를 먼저 실행해 주세요.</div>'}</div>
      <div class="source-note term-safety-note"><strong>데이터 보호 원칙</strong><br>학기 생성은 기존 행을 삭제하거나 덮어쓰지 않습니다. 학생·PIN과 선택한 기본정보만 새 TERM_ID로 복제되고 결근, 대타, 추가근무, 예산 실적 등 운영 기록은 빈 상태로 시작합니다. 학기 삭제 기능은 제공하지 않습니다.</div>`;
    $("#new-term").onclick=openTermModal;
    $$(".view-term").forEach(b=>b.onclick=()=>{state.selectedTermId=b.dataset.id;navigate("admin-dashboard",{force:true});});
    $$(".activate-term").forEach(b=>b.onclick=async()=>{if(!confirm(`현재 운영 학기를 ${b.dataset.name}로 변경하시겠습니까?\n\n기존 학기 데이터는 보존되며 학생 화면은 즉시 새 학기로 전환됩니다.`))return;try{await api("activateTerm",{...state.auth,activateTermId:b.dataset.id});state.selectedTermId=b.dataset.id;clearPublicHomeCache();await loadPublicHome(true);toast("현재 운영 학기를 변경했습니다.");navigate("admin-terms",{force:true});}catch(e){toast(e.message);}});
  }
  function openTermModal(){
    const d=state.adminData,active=activeTerm(d),year=new Date().getFullYear();
    showModal("새 학기 생성",`<form id="term-form"><div class="form-grid">
      <label>연도<input type="number" name="year" min="2020" max="2100" value="${year}" required></label>
      <label>학기<select name="termType"><option value="1">1학기</option><option value="summer">여름학기</option><option value="2">2학기</option><option value="winter">겨울학기</option></select></label>
      <label>학기 시작일<input type="date" name="startDate" required></label><label>학기 종료일<input type="date" name="endDate" required></label>
      <label class="full">복사 기준 학기<select name="copyFromTermId">${(d.terms||[]).map(t=>`<option value="${esc(t.TERM_ID)}" ${t.TERM_ID===active?.TERM_ID?"selected":""}>${esc(t.TERM_NAME)}</option>`).join("")}</select></label>
      <fieldset class="copy-options full"><legend>새 학기로 복사할 기본정보</legend>
        <label><input type="checkbox" name="copyStudents" value="Y" checked> 학생 기본정보와 로그인 PIN</label>
        <label><input type="checkbox" name="copySchedules" value="Y"> 고정 근무표</label>
        <label><input type="checkbox" name="copySettings" value="Y" checked> 운영 기본설정</label>
        <label><input type="checkbox" name="copyHolidays" value="Y" checked> 휴일</label>
      </fieldset></div><div class="source-note" style="margin-top:12px">예산은 0원으로, 결근·대타·추가근무·공지·이벤트 등 실적 데이터는 빈 상태로 생성됩니다. 생성만으로 현재 학기가 바뀌지는 않습니다.</div><div class="form-actions"><button type="button" class="ghost modal-cancel">취소</button><button class="primary">학기 생성</button></div></form>`);
    $(".modal-cancel").onclick=closeModal;
    $("#term-form").onsubmit=async e=>{e.preventDefault();const form=e.target,values=Object.fromEntries(new FormData(form));if(values.startDate>values.endDate){toast("종료일은 시작일 이후여야 합니다.");return;}if(form.elements.copySchedules.checked&&!form.elements.copyStudents.checked){toast("근무표를 복사하려면 학생 기본정보도 함께 복사해야 합니다.");return;}try{await api("createTerm",{...state.auth,...values});closeModal();toast("새 학기를 생성했습니다. 확인 후 활성화해 주세요.");navigate("admin-terms",{force:true});}catch(err){toast(err.message);}};
  }

  // ---------------- ADMIN SETTINGS ----------------
  function renderAdminSettings(){
    const d=state.adminData,s=dataSettings(d),holidays=d.holidays.filter(x=>x.ACTIVE==="Y").sort((a,b)=>a.DATE.localeCompare(b.DATE)),events=(d.events||[]).filter(x=>x.ACTIVE==="Y").sort((a,b)=>a.DATE.localeCompare(b.DATE));
    $("#page-content").innerHTML=`<div class="version-panel">
      <div class="version-main">
        <span class="version-mark">${esc(APP_VERSION)}</span>
        <div><strong>근로장학생 관리 시스템</strong><small>현재 설치 버전을 여기서 바로 확인할 수 있어.</small></div>
      </div>
      <div><small>Frontend ${esc(APP_VERSION)} · Backend ${esc(d.backendVersion||"확인 불가")}</small></div>
    </div><form id="settings-form">
      <div class="settings-grid">
        <div class="settings-block">
          <h3>학기·방학 기간</h3>
          <div class="stack">
            <label>학기 시작<input type="date" name="SEMESTER_START" value="${esc(s.SEMESTER_START)}"></label>
            <label>수업 종강일<input type="date" name="CLASS_END" value="${esc(s.CLASS_END)}"></label>
            <label>보강가능일<input type="date" name="MAKEUP_DATE" value="${esc(s.MAKEUP_DATE)}"></label>
            <label>학기근로 종료<input type="date" name="SEMESTER_END" value="${esc(s.SEMESTER_END)}"></label>
            <label>방학 시작<input type="date" name="BREAK_START" value="${esc(s.BREAK_START)}"></label>
            <label>방학 종료<input type="date" name="BREAK_END" value="${esc(s.BREAK_END)}"></label>
          </div>
        </div>
        <div class="settings-block">
          <h3>정상·단축근무</h3>
          <div class="stack">
            <div class="inline-fields">
              <label>정상 시작<input type="time" name="NORMAL_START_TIME" value="${esc(s.NORMAL_START_TIME)}"></label>
              <label>정상 종료<input type="time" name="NORMAL_END_TIME" value="${esc(s.NORMAL_END_TIME)}"></label>
            </div>
            <label>단축근무 시작일<input type="date" name="SHORT_START" value="${esc(s.SHORT_START)}"></label>
            <label>단축근무 종료일<input type="date" name="SHORT_END" value="${esc(s.SHORT_END)}"></label>
            <div class="inline-fields">
              <label>단축 시작<input type="time" name="SHORT_START_TIME" value="${esc(s.SHORT_START_TIME)}"></label>
              <label>단축 종료<input type="time" name="SHORT_END_TIME" value="${esc(s.SHORT_END_TIME)}"></label>
            </div>
          </div>
        </div>
        <div class="settings-block">
          <h3>근로시간·시급</h3>
          <div class="stack">
            <label>학기중 주 최대시간<input type="number" name="SEMESTER_WEEK_LIMIT" value="${esc(s.SEMESTER_WEEK_LIMIT)}"></label>
            <label>방학중 주 최대시간<input type="number" name="BREAK_WEEK_LIMIT" value="${esc(s.BREAK_WEEK_LIMIT)}"></label>
            <label>2026 시급<input type="number" name="WAGE_2026" value="${esc(s.WAGE_2026)}"></label>
            <label>2027 시급<input type="number" name="WAGE_2027" value="${esc(s.WAGE_2027)}"></label>
          </div>
        </div>
        <div class="settings-block full">
          <h3>로그인 첫 화면 문구</h3>
          <p class="setting-help">녹색 영역의 제목과 설명문을 여기서 바로 바꿀 수 있어. 줄바꿈도 그대로 반영돼.</p>
          <div class="settings-link-grid">
            <label class="full">첫 화면 제목
              <textarea name="LANDING_TITLE" placeholder="한양대학교 ERICA 발전협력팀&#10;근로장학생 관리 시트">${esc(s.LANDING_TITLE||"한양대학교 ERICA 발전협력팀\n근로장학생 관리 시트")}</textarea>
            </label>
            <label class="full">첫 화면 설명문
              <textarea name="LANDING_DESCRIPTION" placeholder="첫 화면에 보여줄 간단한 설명">${esc(s.LANDING_DESCRIPTION||"Google Sheet는 기록 원본으로 남기고, 학생과 직원은 웹에서 필요한 일만 처리하는 근로장학생 관리도구.")}</textarea>
            </label>
          </div>
        </div>
        <div class="settings-block full">
          <h3>학생 화면 문구·업무 바로가기</h3>
          <p class="setting-help">특별한 날 문구는 날짜 자동화 없이 여기서 직접 바꾸는 방식이야. 빈칸으로 두면 해당 메시지/버튼은 숨겨져.</p>
          <div class="settings-link-grid">
            <label class="full">학생 홈 상단 메시지
              <textarea name="STUDENT_HOME_MESSAGE" placeholder="예: 오늘도 잘 부탁해!">${esc(s.STUDENT_HOME_MESSAGE||"")}</textarea>
            </label>
            <label class="full">정규 근무가 없는 날 문구
              <input name="STUDENT_NO_WORK_MESSAGE" value="${esc(s.STUDENT_NO_WORK_MESSAGE||"오늘은 정규 근무가 없어.")}" placeholder="오늘은 정규 근무가 없어.">
            </label>
            <label>인수인계서 버튼명
              <input name="HANDOVER_PDF_LABEL" value="${esc(s.HANDOVER_PDF_LABEL||"근로장학생 업무 인수인계서 보기")}">
            </label>
            <label>인수인계서 PDF 링크
              <input type="text" name="HANDOVER_PDF_URL" value="${esc(s.HANDOVER_PDF_URL||"")}" placeholder="Google Drive 공유 링크 또는 ./파일명.pdf">
            </label>
            <label>업무 바로가기 버튼명
              <input name="DONATION_LINK_LABEL" value="${esc(s.DONATION_LINK_LABEL||"무인기부코너 관리 시트")}">
            </label>
            <label>무인기부코너 시트 링크
              <input type="url" name="DONATION_LINK_URL" value="${esc(s.DONATION_LINK_URL||"")}" placeholder="https://...">
            </label>
          </div>
        </div>
      </div>
      <div class="form-actions"><button class="primary">운영설정 저장</button></div>
    </form>
    <div class="source-note" style="margin:16px 0">학생/로그인 화면 문구와 링크도 Google Sheet ‘설정’ 탭이 원본이라, 홈페이지가 애매할 때 VALUE를 직접 수정하고 ‘데이터 새로고침’을 눌러도 돼.</div>
    <div class="section-head"><div><h3>특정일 업무 이벤트</h3><p>“주요 내빈 방문 · 복장/사무실 정돈 유의”처럼 근로생이 알아야 할 일정을 달력에 표시해.</p></div><button id="add-event" class="primary">이벤트 추가</button></div>
    <div class="table-wrap"><table><thead><tr><th>날짜</th><th>제목</th><th>메시지</th><th>등급</th><th>로그인 전 공개</th><th></th></tr></thead><tbody>${events.map(ev=>`<tr><td>${fmtDate(ev.DATE)}</td><td><strong>${esc(ev.TITLE)}</strong></td><td>${esc(ev.MESSAGE||"")}</td><td><span class="event-level ${esc(ev.LEVEL||"주의")}">${esc(ev.LEVEL||"주의")}</span></td><td>${ev.SHOW_PUBLIC==="Y"?"표시":"로그인 후만"}</td><td><button class="danger compact del-event" data-id="${esc(ev.EVENT_ID)}">삭제</button></td></tr>`).join("")||'<tr><td colspan="6" class="empty">등록된 업무 이벤트가 없어.</td></tr>'}</tbody></table></div>
    <div class="section-head"><div><h3>대한민국 휴일</h3><p>고정근무와 예산 계산에서 자동 제외. 필요하면 관리자 추가·삭제 가능.</p></div><button id="add-holiday" class="primary">휴일 추가</button></div>
    <div class="table-wrap"><table><thead><tr><th>날짜</th><th>휴일</th><th>출처/메모</th><th></th></tr></thead><tbody>${holidays.map(h=>`<tr><td>${fmtDate(h.DATE)}</td><td><strong>${esc(h.NAME)}</strong></td><td>${esc(h.SOURCE||'')}</td><td><button class="danger compact del-holiday" data-id="${esc(h.HOLIDAY_ID)}">삭제</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#settings-form').onsubmit=async e=>{
      e.preventDefault();
      try{
        const values=Object.fromEntries(new FormData(e.target));
        await api('saveSettings',{...state.auth,...values});
        toast('운영설정을 저장했어.');
        applyLandingText(values);
        clearPublicHomeCache();
        loadPublicHome(true);
        navigate('admin-settings',{force:true});
      }catch(err){toast(err.message);}
    };
    $('#add-event').onclick=openEventModal;
    $$('.del-event').forEach(b=>b.onclick=()=>confirm('이 업무 이벤트를 삭제할까?')&&actAndReload('deleteEvent',{eventId:b.dataset.id},'업무 이벤트를 삭제했어.','admin-settings'));
    $('#add-holiday').onclick=openHolidayModal;
    $$('.del-holiday').forEach(b=>b.onclick=()=>confirm('이 휴일을 삭제할까?')&&actAndReload('deleteHoliday',{holidayId:b.dataset.id},'휴일을 삭제했어.','admin-settings'));
  }
  function openEventModal(){
    showModal('특정일 업무 이벤트 추가',`<form id="event-form"><div class="form-grid">
      <label>날짜<input type="date" name="date" required></label>
      <label>등급<select name="level"><option>안내</option><option selected>주의</option><option>중요</option></select></label>
      <label class="full">제목<input name="title" placeholder="예: 주요 내빈 방문 예정" required></label>
      <label class="full">근로생 안내 문구<textarea name="message" placeholder="예: 복장 및 사무실 정돈에 특히 유의해주세요."></textarea></label>
      <label class="full">로그인 전 월 근무표에도 표시<select name="showPublic"><option value="Y">표시</option><option value="N">로그인 후에만 표시</option></select></label>
    </div><div class="form-actions"><button type="button" class="ghost modal-cancel">취소</button><button class="primary">추가</button></div></form>`);
    $('.modal-cancel').onclick=closeModal;
    $('#event-form').onsubmit=async e=>{
      e.preventDefault();
      try{
        await api('upsertEvent',{...state.auth,...Object.fromEntries(new FormData(e.target))});
        closeModal();toast('업무 이벤트를 추가했어.');
        navigate('admin-settings',{force:true});
      }catch(err){toast(err.message);}
    };
  }
  function openHolidayModal(){showModal('휴일 추가',`<form id="holiday-form"><div class="form-grid"><label>날짜<input type="date" name="date" required></label><label>휴일명<input name="name" required></label><label class="full">출처/메모<input name="source" value="관리자 입력"></label></div><div class="form-actions"><button type="button" class="ghost modal-cancel">취소</button><button class="primary">추가</button></div></form>`);$('.modal-cancel').onclick=closeModal;$('#holiday-form').onsubmit=async e=>{e.preventDefault();try{await api('upsertHoliday',{...state.auth,...Object.fromEntries(new FormData(e.target))});closeModal();toast('휴일을 추가했어.');navigate('admin-settings');}catch(err){toast(err.message);}};}

  // ---------------- STUDENT ----------------
  function renderStudentHome(){
    const d=state.studentData,s=d.student,settings=dataSettings(d);
    ensureStudentPeriodAnchor(d);
    const today=isoDate(new Date()),todayEvents=currentStudentScheduleEvents(d,s.STUDENT_KEY,today),open=d.absences.filter(a=>a.STATUS==="대타모집"&&a.STUDENT_KEY!==s.STUDENT_KEY);
    const fixed=todayEvents.filter(x=>x.type==="fixed");
    const todayOps=opsEventsFor(d,today,false);
    const noWork=settings.STUDENT_NO_WORK_MESSAGE||"오늘은 정규 근무가 없어.";
    const special=String(settings.STUDENT_HOME_MESSAGE||"").trim();
    $("#page-content").innerHTML=`
      ${todayOps.map(ev=>`<div class="ops-today-banner ${eventToneClass(ev.LEVEL)}"><strong>${esc(ev.TITLE)}</strong><p>${esc(ev.MESSAGE||"")}</p></div>`).join("")}
      <div class="section-head" style="margin-top:0"><div><h3>오늘의 안내</h3></div></div>
      ${noticeList(d,false)}
      <div class="card hero-card" style="margin-top:18px">
        ${special?`<div class="student-home-message">${esc(special)}</div>`:""}
        <p>${esc(settings.TERM_NAME||CONFIG.TERM_NAME||"")}</p>
        <h2>안녕, ${esc(s.NAME)} 👋</h2>
        <p>${fixed.length?`오늘 내 근무 ${fixed.map(x=>x.label).join(", ")}`:esc(noWork)}</p>
        <div class="hero-actions">
          <button class="soft" data-go="student-schedule">내 달력 보기</button>
          ${open.length?`<button class="soft" data-go="student-substitute">대타 ${open.length}건 보기</button>`:""}
        </div>
      </div>
      ${sharedMemoCard(d,"student")}
      ${studentQuickLinks(d)}
      <div class="section-head"><div><h3>내 근무 달력</h3><p>내 일정만 보여. 출근불가·대타 확정도 달력에서 바로 구분돼.</p></div></div>
      <div class="month-toolbar"><h3>${fmtMonth(ui.studentMonth)}</h3><div class="group"><button class="ghost compact stu-prev">←</button><button class="ghost compact stu-now">이번 달</button><button class="ghost compact stu-next">→</button></div></div>
      ${calendarHTML(d,ui.studentMonth,s.STUDENT_KEY)}
      <div class="section-head"><div><h3>다음 근무</h3><p>출근이 어렵다면 여기서 바로 신청.</p></div></div>
      ${scheduleListCards(d,s.STUDENT_KEY,21)}`;
    bindStudentCalendarNav(renderStudentHome);
    bindAbsenceButtons();
    bindSharedMemos(d,"student");
    $$("[data-go]").forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  }
  function renderStudentCalendar(){const d=state.studentData,s=d.student;ensureStudentPeriodAnchor(d);$("#page-content").innerHTML=`<div class="month-toolbar"><h3>${fmtMonth(ui.studentMonth)}</h3><div class="group"><button class="ghost compact stu-prev">←</button><button class="ghost compact stu-now">이번 달</button><button class="ghost compact stu-next">→</button></div></div>${calendarHTML(d,ui.studentMonth,s.STUDENT_KEY)}<div class="section-head"><div><h3>다가오는 근무</h3></div></div>${scheduleListCards(d,s.STUDENT_KEY,42)}`;bindStudentCalendarNav(renderStudentCalendar);bindAbsenceButtons();}
  function bindStudentCalendarNav(rerender){$('.stu-prev').onclick=()=>{ui.studentMonth=new Date(ui.studentMonth.getFullYear(),ui.studentMonth.getMonth()-1,1);rerender();};$('.stu-next').onclick=()=>{ui.studentMonth=new Date(ui.studentMonth.getFullYear(),ui.studentMonth.getMonth()+1,1);rerender();};$('.stu-now').onclick=()=>{ui.studentMonth=new Date();rerender();};}
  function bindAbsenceButtons(){$$('.absence-btn').forEach(b=>b.onclick=()=>openAbsenceModal(b.dataset.date,b.dataset.start,b.dataset.end));}
  function openAbsenceModal(date,start,end){showModal('출근 불가 신청',`<form id="absence-form"><div class="form-grid"><label>날짜<input name="date" value="${esc(date)}" readonly></label><label>시간<input value="${esc(start)} ~ ${esc(end)}" readonly></label><input type="hidden" name="start" value="${esc(start)}"><input type="hidden" name="end" value="${esc(end)}"><label class="full">사유<select name="reason"><option>개인 일정</option><option>수업·학사 일정</option><option>질병</option><option>행사 참여</option><option>기타</option></select></label><label class="full">메모<textarea name="note" placeholder="필요한 경우만"></textarea></label></div><div class="form-actions"><button type="button" class="ghost modal-cancel">취소</button><button class="danger">출근 불가 신청</button></div></form>`);$('.modal-cancel').onclick=closeModal;$('#absence-form').onsubmit=async e=>{e.preventDefault();try{await api('createAbsence',{...state.auth,...Object.fromEntries(new FormData(e.target))});closeModal();toast('출근 불가 신청을 등록했어.');navigate(state.view,{force:true});}catch(err){toast(err.message);}};}
  function renderStudentSubstitute(){const d=state.studentData,s=d.student,open=d.absences.filter(a=>a.STATUS==="대타모집"&&a.STUDENT_KEY!==s.STUDENT_KEY).sort((a,b)=>a.DATE.localeCompare(b.DATE));$("#page-content").innerHTML=`<div class="section-head" style="margin-top:0"><div><h3>대타 모집</h3><p>관리자가 최종 승인하면 확정돼.</p></div></div><div class="mobile-list">${open.map(a=>{const my=d.substitutes.find(x=>x.ABSENCE_ID===a.ABSENCE_ID&&x.STUDENT_KEY===s.STUDENT_KEY&&x.STATUS==="신청");return `<div class="list-card"><div class="top"><div><h4>🚨 ${fmtDate(a.DATE)}</h4><p>${esc(a.START)}~${esc(a.END)} · ${esc(a.NAME)} 대신</p><p>사유: ${esc(a.REASON)}</p></div>${badge('대타 필요','red')}</div><div class="actions">${my?badge('신청 완료','amber'):`<button class="primary compact apply-sub" data-id="${esc(a.ABSENCE_ID)}">대타 신청</button>`}</div></div>`;}).join('')||'<div class="card empty">현재 대타 모집이 없어.</div>'}</div>`;$$('.apply-sub').forEach(b=>b.onclick=()=>actAndReload('applySubstitute',{absenceId:b.dataset.id},'대타 신청했어.','student-substitute'));}
  function renderStudentExtra(){const d=state.studentData,s=d.student,open=d.extraShifts.filter(x=>x.STATUS==="모집중");$("#page-content").innerHTML=`<div class="section-head" style="margin-top:0"><div><h3>추가근무</h3></div></div><div class="mobile-list">${open.map(sh=>{const joins=d.extraJoins.filter(x=>x.SHIFT_ID===sh.SHIFT_ID&&x.STATUS==="신청"),my=joins.find(x=>x.STUDENT_KEY===s.STUDENT_KEY);return `<div class="list-card"><div class="top"><div><h4>📢 ${esc(sh.TITLE)}</h4><p>${fmtDate(sh.DATE)} · ${esc(sh.START)}~${esc(sh.END)}</p><p>${esc(sh.DESCRIPTION)}</p></div>${badge(`${joins.length}/${sh.CAPACITY}명`,'blue')}</div><div class="actions">${my?badge('참여 신청 완료','green'):`<button class="primary compact extra-join" data-id="${esc(sh.SHIFT_ID)}">참여하기</button>`}</div></div>`;}).join('')||'<div class="card empty">현재 추가근무 모집이 없어.</div>'}</div>`;$$('.extra-join').forEach(b=>b.onclick=()=>actAndReload('applyExtraShift',{shiftId:b.dataset.id},'추가근무 신청했어.','student-extra'));}
  function renderStudentRecords(){const d=state.studentData,s=d.student,myAbs=d.absences.filter(a=>a.STUDENT_KEY===s.STUDENT_KEY&&a.STATUS!=="삭제").sort((a,b)=>b.DATE.localeCompare(a.DATE)),mySubs=d.substitutes.filter(x=>x.STUDENT_KEY===s.STUDENT_KEY&&x.STATUS!=="삭제");$("#page-content").innerHTML=`<div class="section-head" style="margin-top:0"><div><h3>내 출근불가</h3></div></div><div class="mobile-list">${myAbs.map(a=>`<div class="list-card"><div class="top"><div><h4>${fmtDate(a.DATE)} · ${esc(a.START)}~${esc(a.END)}</h4><p>${esc(a.REASON)}</p></div>${absenceBadge(a)}</div>${a.STATUS==="대타모집"?`<div class="actions"><button class="ghost compact cancel-absence" data-id="${esc(a.ABSENCE_ID)}">신청 취소</button></div>`:''}</div>`).join('')||'<div class="card empty">기록이 없어.</div>'}</div><div class="section-head"><div><h3>내 대타 지원</h3></div></div><div class="mobile-list">${mySubs.map(x=>{const a=d.absences.find(a=>a.ABSENCE_ID===x.ABSENCE_ID);return `<div class="list-card"><div class="top"><div><h4>${a?fmtDate(a.DATE):'-'} · ${a?esc(a.START)+'~'+esc(a.END):''}</h4><p>${a?esc(a.NAME)+' 대신':''}</p></div>${badge(x.STATUS,x.STATUS==='승인'?'green':'amber')}</div></div>`;}).join('')||'<div class="card empty">대타 지원 기록이 없어.</div>'}</div>`;$$('.cancel-absence').forEach(b=>b.onclick=()=>confirm('출근 불가 신청을 취소할까?')&&actAndReload('cancelAbsence',{absenceId:b.dataset.id},'취소했어.','student-records'));}

  async function actAndReload(action,params,msg,view){try{await api(action,{...state.auth,...params});toast(msg);navigate(view,{force:true});}catch(e){toast(e.message);}}

  window.WorkApp={navigate};document.addEventListener('DOMContentLoaded',init);
})();
