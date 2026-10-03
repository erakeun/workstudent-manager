// All records and example PINs in these tests are fictional and local to jsdom.
const assert=require('node:assert/strict'),fs=require('node:fs'),{test}=require('node:test');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync('app.js','utf8');
const marker="window.WorkApp={navigate};document.addEventListener('DOMContentLoaded',init);";
const handler=source.split('\n').find(line=>line.includes("$$('[data-demo=\"admin\"]')"));
assert.ok(handler,'actual demo-fill binding exists');
function boot(demo=true){
 const dom=new JSDOM('<input id="admin-pin"><button data-demo="admin"></button>',{url:'https://synthetic.invalid/',runScripts:'outside-only'});
 const io=[],errors=[];dom.window.WORK_CONFIG={DEMO_MODE:demo};
 dom.window.addEventListener('error',e=>{errors.push(e.error);e.preventDefault();});
 const reject=name=>()=>{io.push(name);throw new Error('Network disabled');};
 dom.window.fetch=reject('fetch');dom.window.XMLHttpRequest=reject('xhr');dom.window.document.head.appendChild=reject('jsonp');
 dom.window.eval(source.replace(marker,()=>`window.WorkApp={seedMock,readMock,bindDemoAdmin(){${handler}}};`));
 const app=dom.window.WorkApp,storage=dom.window.localStorage;
 const finish=()=>{assert.deepEqual(io,[]);assert.deepEqual(errors,[]);dom.window.close();};
 return {dom,app,storage,finish};
}
test('fresh demo seed has explicit fictional identities, blank contacts and demo-only example PINs',()=>{
 const x=boot();x.app.seedMock();assert.equal(x.storage.length,1);
 const db=JSON.parse(x.storage.getItem(x.storage.key(0)));assert.equal(db.students.length,7);
 db.students.forEach((student,i)=>{
  assert.equal(student.NAME,`가상학생 ${String(i+1).padStart(2,'0')}`);
  assert.equal(student.PHONE,'');assert.equal(student.STUDENT_ID,'');
  assert.equal(student.LOGIN_PIN,`DEMO-STU-${String(i+1).padStart(2,'0')}`);
  assert.ok(student.LOGIN_PIN.length<=12);assert.equal(student.DEPARTMENT,'가상학과');
 });
 assert.equal(db.settings.ADMIN_PIN,'DEMO-ADMIN');
 for(const row of [...db.schedules,...db.absences]) assert.equal(row.NAME,db.students.find(s=>s.STUDENT_KEY===row.STUDENT_KEY).NAME);
 x.finish();
});
test('existing stored demo data is not reset and demo-fill uses its saved value',()=>{
 const x=boot();x.app.seedMock();const key=x.storage.key(0),db=JSON.parse(x.storage.getItem(key));
 db.settings.ADMIN_PIN='DEMO-SAVED';db.students[0].NAME='가상 기존 저장 학생';db.sentinel='preserve-existing';
 const before=JSON.stringify(db);x.storage.setItem(key,before);x.app.seedMock();assert.equal(x.storage.getItem(key),before);
 x.app.bindDemoAdmin();x.dom.window.document.querySelector('[data-demo="admin"]').click();
 assert.equal(x.dom.window.document.getElementById('admin-pin').value,'DEMO-SAVED');assert.equal(x.storage.getItem(key),before);x.finish();
});
test('demo admin fill is inert in live mode and does not touch storage or submitted input',()=>{
 const x=boot(false);x.dom.window.document.getElementById('admin-pin').value='synthetic-user-input';
 for(const name of ['getItem','setItem','removeItem','clear'])x.dom.window.Storage.prototype[name]=()=>{throw new Error('Live path must not access demo storage');};
 x.app.bindDemoAdmin();x.dom.window.document.querySelector('[data-demo="admin"]').click();
 assert.equal(x.dom.window.document.getElementById('admin-pin').value,'synthetic-user-input');x.finish();
});
