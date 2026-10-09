import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readTable,suggestMapping,tableItems,mergeCatalog,validateCatalog,catalogCSV,EMPTY_CATALOG} from '../public/workspace/catalog-data.js';
import {inspectionCSV} from '../public/workspace/inspection-report.js';
import {createSessionService} from '../lib/session-service.mjs';
import {openLocalDatabase} from '../lib/local-db.mjs';
const parse=text=>{const table=readTable(text);return tableItems(table,suggestMapping(table.headers));};
test('spreadsheet paste and CSV preserve identifiers, quoted fields and multiline notes',()=>{
 const a=parse('\uFEFF貨號\t名稱\t庫存\t單位\n0012\t馬達\t0\t台\nA102\t貨箱\t\t箱');
 assert.equal(a[0].sku,'0012');assert.equal(a[0].stock,0);assert.equal(a[1].stock,null);
 const b=parse('sku,name,stock,history\r\nA1,"Motor, A",3,"2026-10-09: 換膠帶\n2026-10-08: 核對"');
 assert.equal(b[0].name,'Motor, A');assert.equal(b[0].history.length,2);
 assert.deepEqual(parse(catalogCSV({version:1,demo:false,items:b})),b);
 assert.throws(()=>parse('貨號,名稱,庫存\nA,B,-1'));assert.throws(()=>parse('貨號,名稱\nA,B\nA,C'));
 assert.throws(()=>readTable('貨號,名稱\nA,"未關閉'));assert.throws(()=>parse('貨號,庫存\nA,1'));
});
test('import only updates mapped fields and preserves other records; aliases stay unique',()=>{
 const current={version:1,demo:false,items:parse('貨號,名稱,庫存,存放位置\nA,原名稱,4,倉位A\nB,另一箱,2,倉位B')};
 current.items[0].history=[{date:'2026-10-09',text:'保留舊紀錄'}];
 const result=mergeCatalog(current,parse('貨號,名稱\nA,新名稱\nC,第三箱'),['sku','name']);
 assert.equal(result.added,1);assert.equal(result.updated,1);assert.equal(result.catalog.items.length,3);
 assert.equal(result.catalog.items[0].stock,4);assert.equal(result.catalog.items[0].history[0].text,'保留舊紀錄');
 assert.equal(current.items[0].name,'原名稱');
 assert.throws(()=>validateCatalog({...current,items:[current.items[0],{...current.items[1],aliases:['A']}]}));
});
test('CSV exports neutralize formulas and retain unconfirmed inspection status',()=>{
 const c={version:1,demo:false,items:parse('貨號,名稱\nA,=HYPERLINK()')};assert.ok(catalogCSV(c).includes("'=HYPERLINK()"));
 const report=inspectionCSV({title:'=SUM(1)',checks:[true,false,false],notes:[]});assert.ok(report.includes("'=SUM(1)"));assert.ok(report.includes('未確認'));
});
test('catalog data persists per authenticated owner, rejects guests, stale writes and invalid input',async()=>{
 const db=openLocalDatabase(),handle=createSessionService({db,allowInvitedGuests:true});
 const call=async(user,body,origin='https://app.test')=>{const r=await handle(new Request('https://app.test/api/catalog',{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),user);return {status:r.status,data:await r.json()};};
 try{
  assert.equal((await call(null)).status,401);
  const catalog={version:1,demo:false,items:parse('貨號,名稱,庫存\nA,真實使用測試,5')};
  assert.equal((await call('alice',{catalog,revision:0})).status,200);
  assert.deepEqual((await call('alice')).data.catalog,catalog);
  assert.deepEqual((await call('bob')).data.catalog,EMPTY_CATALOG());
  assert.equal((await call('alice',{catalog,revision:0})).status,409);
  assert.equal((await call('alice',{catalog,revision:1},'https://evil.test')).status,403);
  assert.equal((await call('alice',{catalog:{...catalog,demo:true},revision:1})).status,400);
  assert.equal((await call('alice',{catalog:{...catalog,items:[{...catalog.items[0],stock:-1}]},revision:1})).status,400);
  const results=await Promise.all([call('alice',{catalog,revision:1}),call('alice',{catalog,revision:1})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await call('alice')).data.revision,2);
 }finally{db.sqlite.close();}
});
