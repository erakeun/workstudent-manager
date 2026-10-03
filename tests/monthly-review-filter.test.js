const assert=require('node:assert/strict'),fs=require('node:fs'),{test}=require('node:test');
const {JSDOM}=require('jsdom'),{monthlyReviewFixture}=require('./monthly-review-fixture');
const model=require('../monthly-hours');
const source=fs.readFileSync('app.js','utf8').replace("window.WorkApp={navigate};document.addEventListener('DOMContentLoaded',init);",'window.WorkApp={state,ui,render,renderAdminBudget,applyAdminReadOnly,renderStudentRecords,monthlyStudentHours,projectedCostByMonth};');
function boot(){
  const dom=new JSDOM('<div id="page-content"></div><div id="modal-root"></div><div id="toast"></div>',{url:'https://synthetic.invalid/',runScripts:'outside-only'});
  const errors=[],io=[];
  dom.window.addEventListener('error',e=>{errors.push(e.error);e.preventDefault();});
  dom.window.fetch=()=>{io.push('fetch');throw new Error('Network is disabled in this test');};
  dom.window.XMLHttpRequest=function(){io.push('xhr');throw new Error('Network is disabled in this test');};
  dom.window.document.head.appendChild=()=>{io.push('jsonp');throw new Error('Script injection is disabled in this test');};
  for(const method of ['getItem','setItem','removeItem','clear'])dom.window.Storage.prototype[method]=()=>{io.push('storage');throw new Error('Storage is disabled in this test');};
  dom.window.WorkMonthly=model;dom.window.eval(source);
  const app=dom.window.WorkApp,doc=dom.window.document,d=monthlyReviewFixture();
  app.state.mode='admin';app.state.view='admin-budget';app.state.adminData=d;app.ui.budgetMonth='2026-10';app.render('admin-budget');
  const change=(id,value)=>{const control=doc.getElementById(id);control.value=value;control.dispatchEvent(new dom.window.Event('change',{bubbles:true}));assert.equal(errors.length,0,errors.map(e=>e.stack).join('\n'));};
  const rows=()=>[...doc.querySelectorAll('[data-monthly-review-row]')],visible=()=>rows().filter(x=>!x.hidden),keys=()=>visible().map(x=>x.querySelector('.monthly-correct,.monthly-history')?.dataset.key||x.querySelector('strong').textContent);
  const counts=()=>doc.getElementById('monthly-review-counts').textContent;
  const rest=()=>[...doc.querySelector('#page-content').children].filter(e=>e.tagName!=='SECTION').map(e=>e.outerHTML).join('');
  const finish=()=>{assert.deepEqual(io,[],'filtering and rendering must not use network or browser storage');assert.equal(errors.length,0);dom.window.close();};
  return {dom,app,doc,d,change,rows,visible,keys,counts,rest,finish};
}
test('actual select/change/reset filters exact model flags; counts overlap without changing totals or data',()=>{
  const x=boot(),before=JSON.stringify(x.d),rest=x.rest(),summary=JSON.stringify(model.summarize(x.d,'2026-10')),budget=JSON.stringify(x.app.projectedCostByMonth(x.d));
  assert.equal(x.visible().length,9);assert.equal(x.counts(),'표시 9명 / 전체 9명 · 확인 필요 3명 · 보정 이력 있음 6명');
  assert.equal(x.doc.querySelector('#monthly-review-reset').type,'button');
  assert.match(x.doc.querySelector('#monthly-review-help').textContent,/아래 총예산·예상 소요는 선택 학기 전체 기준/);
  assert.equal(x.doc.querySelector('#monthly-review-counts').getAttribute('aria-live'),'polite');
  x.doc.querySelector('#monthly-review-filter').focus();x.change('monthly-review-filter','review');
  assert.deepEqual(x.keys(),['SOURCE_ERROR','STALE','BAD_AMOUNT']);assert.equal(x.counts(),'표시 3명 / 전체 9명 · 확인 필요 3명 · 보정 이력 있음 6명');
  assert.equal(x.doc.activeElement.id,'monthly-review-filter');assert.equal(x.rest(),rest,'filter must not recreate or change budget cards');
  x.change('monthly-review-filter','history');assert.deepEqual(x.keys(),['STALE','ZERO','BASE','DIRECT_ZERO','DIRECT','BAD_AMOUNT']);
  assert.equal(x.counts(),'표시 6명 / 전체 9명 · 확인 필요 3명 · 보정 이력 있음 6명');
  const textFor=key=>x.visible().find(row=>row.querySelector('.monthly-correct').dataset.key===key).textContent;
  assert.match(textFor('ZERO'),/0시간 0분/);assert.match(textFor('BASE'),/근무표 기준/);assert.match(textFor('DIRECT_ZERO'),/0원.*금액 직접입력 우선/);assert.match(textFor('DIRECT'),/24,680원/);
  for(let i=0;i<3;i++){x.doc.querySelector('#monthly-review-reset').click();assert.equal(x.visible().length,9);x.change('monthly-review-filter','history');}
  x.doc.querySelector('#monthly-review-reset').click();assert.equal(x.app.ui.budgetReviewFilter,'all');assert.equal(x.doc.querySelector('#monthly-review-filter').value,'all');
  assert.equal(x.rest(),rest);assert.equal(JSON.stringify(x.d),before);assert.equal(JSON.stringify(model.summarize(x.d,'2026-10')),summary);assert.equal(JSON.stringify(x.app.projectedCostByMonth(x.d)),budget);x.finish();
});
test('empty result, invalid/cleared month, changing month and reset preserve predictable filter state',()=>{
  const x=boot();x.change('monthly-review-filter','history');x.change('budget-month','2026-11');
  assert.equal(x.app.ui.budgetReviewFilter,'history');assert.equal(x.doc.querySelector('#monthly-review-filter').value,'history');assert.equal(x.visible().length,0);assert.equal(x.counts(),'표시 0명 / 전체 9명 · 확인 필요 1명 · 보정 이력 있음 0명');
  assert.equal(x.doc.querySelector('#monthly-review-empty').hidden,false);assert.match(x.doc.querySelector('#monthly-review-empty').textContent,/선택한 필터/);
  x.change('budget-month','');assert.equal(x.app.ui.budgetMonth,'2026-11');assert.equal(x.doc.querySelector('#budget-month').value,'2026-11');
  x.change('budget-month','2026-13');assert.equal(x.app.ui.budgetMonth,'2026-11');
  x.doc.querySelector('#monthly-review-reset').click();assert.equal(x.visible().length,9);assert.equal(x.doc.querySelector('#monthly-review-empty').hidden,true);
  x.change('budget-month','2026-10');assert.equal(x.visible().length,9);assert.equal(x.app.ui.budgetReviewFilter,'all');
  x.d.students=[];x.app.render('admin-budget');assert.equal(x.visible().length,0);assert.equal(x.counts(),'표시 0명 / 전체 0명 · 확인 필요 0명 · 보정 이력 있음 0명');assert.match(x.doc.querySelector('#monthly-review-empty').textContent,/선택 학기에 등록된 학생이 없어/);x.change('monthly-review-filter','review');x.doc.querySelector('#monthly-review-reset').click();assert.equal(x.visible().length,0);x.finish();
});
test('past term stays read-only through filter, reset, month change, and repeated rendering',()=>{
  const x=boot();x.change('monthly-review-filter','history');x.d.selectedTermId='TEST-OLD';x.d.readOnly=true;x.d.monthlyCorrections=x.d.monthlyCorrections.map(r=>({...r,TERM_ID:r.TERM_ID==='TEST-A'?'TEST-OLD':r.TERM_ID}));x.app.state.selectedTermId='TEST-OLD';x.app.render('admin-budget');
  function check(){assert.equal(x.doc.querySelectorAll('.monthly-correct').length,0);assert.equal(x.doc.querySelector('#edit-budget').disabled,true);assert.equal(x.doc.querySelector('#monthly-review-filter').disabled,false);assert.equal(x.doc.querySelector('#budget-month').disabled,false);assert.equal(x.doc.querySelectorAll('.readonly-banner').length,1);}
  check();assert.equal(x.app.ui.budgetReviewFilter,'history');assert.equal(x.visible().length,6);x.change('monthly-review-filter','review');check();x.doc.querySelector('#monthly-review-reset').click();check();
  x.change('budget-month','2026-11');check();x.change('budget-month','2026-10');check();x.change('monthly-review-filter','history');check();x.app.render('admin-budget');check();
  const snapshot=JSON.stringify(x.d);assert.throws(()=>model.correctionEvent(x.d,{},{}),/읽기 전용/);assert.equal(JSON.stringify(x.d),snapshot);x.finish();
});
test('missing wage alone retains existing needsReview meaning; feature and student scope stay unchanged',()=>{
  const x=boot();delete x.d.settings.WAGE_2026;x.d.features.monthlySettlement=false;x.app.render('admin-budget');x.change('monthly-review-filter','review');
  assert.equal(x.visible().length,3);assert.equal(x.doc.querySelectorAll('.monthly-correct').length,0);assert.equal(model.summarize(x.d,'2026-10')[0].needsReview,false);assert.equal(model.summarize(x.d,'2026-10')[0].settlementAmount,null);
  x.d.students=x.d.students.slice(0,1);x.app.render('admin-budget');assert.equal(x.rows().length,1,'filter cannot pull students outside supplied authorized dataset');assert.equal(x.visible().length,0);
  x.app.state.mode='student';x.app.state.studentData={student:{STUDENT_KEY:'NORMAL'},absences:[],substitutes:[]};x.app.render('student-records');assert.equal(x.doc.querySelector('#monthly-review-filter'),null);assert.equal(x.doc.querySelectorAll('[data-monthly-review-row]').length,0);x.finish();
});
test('malformed amount, latest BASE, 0/blank, escaping, and invalid filter fallback keep existing semantics',()=>{
  const x=boot();x.d.students[0].NAME='<img src=x onerror=alert(1)>';x.app.render('admin-budget');assert.equal(x.doc.querySelector('#monthly-hours-rows img'),null);
  x.d.monthlyCorrections.push({...x.d.monthlyCorrections.find(r=>r.STUDENT_KEY==='STALE'),VERSION:2,MODE:'BASE',AFTER_MINUTES:''});x.app.render('admin-budget');x.change('monthly-review-filter','history');assert.equal(x.visible().length,6);assert.equal(model.summarize(x.d,'2026-10').find(r=>r.student.STUDENT_KEY==='STALE').needsReview,false);
  const results=model.summarize(x.d,'2026-10');assert.equal(results.find(r=>r.student.STUDENT_KEY==='ZERO').appliedMinutes,0);assert.equal(results.find(r=>r.student.STUDENT_KEY==='DIRECT_ZERO').settlementAmount,0);assert.equal(results.find(r=>r.student.STUDENT_KEY==='BAD_AMOUNT').settlementAmount,null);
  x.change('monthly-review-filter','invalid');assert.equal(x.app.ui.budgetReviewFilter,'all');assert.equal(x.visible().length,9);x.app.ui.budgetReviewFilter='invalid';x.app.render('admin-budget');assert.equal(x.app.ui.budgetReviewFilter,'all');x.finish();
});
