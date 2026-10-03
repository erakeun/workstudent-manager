// Synthetic-only regression tests. Full production seed is neither executed nor exported.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');
const {monthlyReviewFixture} = require('./monthly-review-fixture');
const model = require('../monthly-hours');
const marker = "window.WorkApp={navigate};document.addEventListener('DOMContentLoaded',init);";
const source = fs.readFileSync('app.js', 'utf8');
assert.equal(source.split(marker).length, 2, 'test hook must match exactly once');
const testSource = source.replace(marker, 'window.WorkApp={state,ui,render,navigate,projectedCostByMonth};');
function boot() {
  const dom = new JSDOM('<div id="page-title"></div><div id="page-eyebrow"></div><div id="page-content"></div><div id="modal-root"></div><div id="toast"></div>', {url:'https://synthetic.invalid/',runScripts:'outside-only'});
  const errors = [], io = [];
  dom.window.addEventListener('error', e => {errors.push(e.error);e.preventDefault();});
  const reject = name => () => {io.push(name);throw new Error('External IO disabled');};
  dom.window.fetch=reject('fetch');dom.window.XMLHttpRequest=reject('xhr');
  dom.window.navigator.sendBeacon=reject('beacon');
  dom.window.document.head.appendChild=reject('jsonp');
  for (const name of ['getItem','setItem','removeItem','clear']) dom.window.Storage.prototype[name]=reject('storage');
  dom.window.WorkMonthly=model;dom.window.eval(testSource);
  const app=dom.window.WorkApp,doc=dom.window.document,d=monthlyReviewFixture();
  app.state.mode='admin';app.state.view='admin-budget';app.state.adminData=d;app.ui.budgetMonth='2026-10';app.render('admin-budget');
  const change=(id,value)=>{const el=doc.getElementById(id);el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));assert.equal(errors.length,0,'UI has no errors');};
  const visible=()=>[...doc.querySelectorAll('[data-monthly-review-row]')].filter(row=>!row.hidden);
  const visibleNames=()=>visible().map(row=>row.querySelector('strong').textContent);
  const checkAgainstModel=filter=>{
    const rows=model.summarize(app.state.adminData,app.ui.budgetMonth);
    const expected=rows.filter(row=>filter==='review'?row.needsReview:filter==='history'?!!row.correction:true);
    assert.deepEqual(visibleNames(),expected.map(row=>row.student.NAME));
    assert.equal(doc.getElementById('monthly-review-counts').textContent,`표시 ${expected.length}명 / 전체 ${rows.length}명 · 확인 필요 ${rows.filter(row=>row.needsReview).length}명 · 보정 이력 있음 ${rows.filter(row=>!!row.correction).length}명`);
    assert.equal(doc.getElementById('monthly-review-empty').hidden,expected.length>0);
  };
  const finish=()=>{assert.deepEqual(errors,[]);assert.deepEqual(io,[]);dom.window.close();};
  return {dom,doc,app,d,change,visible,visibleNames,checkAgainstModel,finish};
}
test('all filter modes exactly match model across 24 deterministic data and order variations',()=>{
  const x=boot();
  for(let i=0;i<24;i++) {
    const d=monthlyReviewFixture();
    if(i%2)d.students.reverse();
    d.students=d.students.slice(i%4,9-(i%3));
    if(i%5===0)d.monthlyCorrections=[];
    if(i%7===0)d.schedules=[];
    if(i%3===0)d.settings.WAGE_2026='';
    if(i%4===0)d.readOnly=true;
    x.app.state.adminData=d;x.app.ui.budgetMonth=i%2?'2026-11':'2026-10';x.app.render('admin-budget');
    const before=JSON.stringify(d),budget=JSON.stringify(x.app.projectedCostByMonth(d));
    for(const filter of ['all','review','history','review','all']) {x.change('monthly-review-filter',filter);x.checkAgainstModel(filter);}
    assert.equal(JSON.stringify(d),before);assert.equal(JSON.stringify(x.app.projectedCostByMonth(d)),budget);
  }
  x.finish();
});
test('updated dataset and selected term recalculate flags, remove old records and retain filter',()=>{
  const x=boot();x.change('monthly-review-filter','history');
  const d=monthlyReviewFixture();d.selectedTermId='TEST-OTHER';d.activeTermId='TEST-OTHER';d.students=d.students.slice(0,2);d.students[0].NAME='합성 새 학기 학생';
  x.app.state.adminData=d;x.app.state.selectedTermId='TEST-OTHER';x.app.render('admin-budget');
  assert.equal(x.app.ui.budgetReviewFilter,'history');x.checkAgainstModel('history');assert.equal(x.visible().length,0);
  d.monthlyCorrections=[{TERM_ID:'TEST-OTHER',STUDENT_KEY:d.students[0].STUDENT_KEY,MONTH:'2026-10',MODE:'BASE',VERSION:1,BASE_MINUTES:900,AFTER_MINUTES:''}];
  x.app.render('admin-budget');x.checkAgainstModel('history');assert.deepEqual(x.visibleNames(),['합성 새 학기 학생']);
  d.monthlyCorrections=[];x.app.render('admin-budget');x.checkAgainstModel('history');assert.equal(x.visible().length,0);
  x.doc.getElementById('monthly-review-reset').click();x.checkAgainstModel('all');x.finish();
});
test('history modal open, close and reopen preserve selected filtered rows and never request data',()=>{
  const x=boot();x.change('monthly-review-filter','history');const before=JSON.stringify(x.d),names=x.visibleNames();
  for(let i=0;i<6;i++) {
    x.doc.querySelector('.monthly-history[data-key="BASE"]').click();
    assert.match(x.doc.querySelector('.modal-head').textContent,/2026-10/);
    assert.match(x.doc.querySelector('.modal').textContent,/근무표 기준 복원/);
    x.doc.querySelector(i%2?'.modal-backdrop':'.modal-close').click();
    assert.equal(x.doc.getElementById('modal-root').childElementCount,0);
    assert.deepEqual(x.visibleNames(),names);assert.equal(x.doc.getElementById('monthly-review-filter').value,'history');
  }
  assert.equal(JSON.stringify(x.d),before);x.finish();
});
test('correction modal cancellations under review filter preserve data, zero amounts and table counts',()=>{
  const x=boot();x.change('monthly-review-filter','review');const before=JSON.stringify(x.d),names=x.visibleNames();
  for(const control of ['.modal-cancel','.modal-close','.modal-backdrop','.modal-cancel']) {
    x.doc.querySelector('.monthly-correct[data-key="STALE"]').click();
    const form=x.doc.getElementById('monthly-correction-form');assert.ok(form);
    form.elements.hours.value='0';form.elements.hours.dispatchEvent(new x.dom.window.Event('input',{bubbles:true}));
    x.doc.querySelector(control).click();assert.equal(x.doc.getElementById('modal-root').childElementCount,0);
    assert.equal(x.doc.getElementById('monthly-review-filter').value,'review');assert.deepEqual(x.visibleNames(),names);x.checkAgainstModel('review');
  }
  assert.equal(JSON.stringify(x.d),before);x.finish();
});
test('cached page navigation restores filter and past-term locks without network or duplicate banners',async()=>{
  const x=boot();x.d.readOnly=true;x.app.render('admin-budget');x.change('monthly-review-filter','history');
  for(let i=0;i<4;i++) {
    await x.app.navigate('admin-budget');x.checkAgainstModel('history');
    assert.equal(x.doc.querySelectorAll('.readonly-banner').length,1);
    assert.equal(x.doc.getElementById('edit-budget').disabled,true);
    assert.equal(x.doc.getElementById('monthly-review-filter').disabled,false);
    assert.equal(x.doc.querySelectorAll('.monthly-correct').length,0);
    x.change('budget-month',i%2?'2026-10':'2026-11');x.checkAgainstModel('history');
    assert.equal(x.doc.querySelectorAll('.readonly-banner').length,1);assert.equal(x.doc.getElementById('edit-budget').disabled,true);
  }
  x.finish();
});
test('hidden row stylesheet wins over ordinary table-row rules, and toolbar has label and live count',()=>{
  const x=boot();const style=x.doc.createElement('style');
  style.textContent='tr { display: table-row; }\n'+fs.readFileSync('styles.css','utf8');
  x.doc.body.appendChild(style);x.change('monthly-review-filter','history');
  for(const row of x.doc.querySelectorAll('[data-monthly-review-row]')) {
    assert.equal(x.dom.window.getComputedStyle(row).display,row.hidden?'none':'table-row');
  }
  const select=x.doc.getElementById('monthly-review-filter');assert.ok(select.labels.length);assert.equal(select.getAttribute('aria-describedby'),'monthly-review-help');
  assert.equal(x.doc.getElementById('monthly-review-counts').getAttribute('role'),'status');
  x.finish();
});
