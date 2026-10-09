import {EMPTY_CATALOG,validateCatalog} from '../public/workspace/catalog-data.js';
export async function catalogService(request,userId,{db,now=()=>Date.now()}){
 const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(!userId)return json({error:'請登入後管理自己的貨品資料。'},401);
 if(request.method==='GET'){
  const row=await db.prepare('SELECT payload, revision, updated_at FROM catalogs WHERE owner_id=?').bind(userId).first();
  return json({catalog:row?JSON.parse(row.payload):EMPTY_CATALOG(),revision:row?.revision||0,updatedAt:row?.updated_at||null});
 }
 if(request.method!=='POST')return json({error:'不支援這個操作。'},405);
 if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return json({error:'不允許跨網站操作。'},403);
 try{
  const raw=await request.text();if(new TextEncoder().encode(raw).length>140000)return json({error:'貨品資料過大，請減少紀錄或分開整理。'},413);
  const body=JSON.parse(raw);const catalog=validateCatalog(body.catalog);
  if(catalog.demo||!Number.isSafeInteger(body.revision)||body.revision<0)return json({error:'不可把練習資料存為正式資料，或資料版本不正確。'},400);
  const payload=JSON.stringify(catalog),updatedAt=now();let result;
  if(body.revision===0)result=await db.prepare('INSERT INTO catalogs (owner_id,payload,revision,updated_at) VALUES (?,?,1,?) ON CONFLICT(owner_id) DO NOTHING').bind(userId,payload,updatedAt).run();
  else result=await db.prepare('UPDATE catalogs SET payload=?,revision=revision+1,updated_at=? WHERE owner_id=? AND revision=?').bind(payload,updatedAt,userId,body.revision).run();
  if(!result.meta?.changes)return json({error:'另一個頁面已更新資料。請先下載目前資料備份，再按「重新讀取」，重新預覽後儲存。'},409);
  return json({revision:body.revision+1,updatedAt});
 }catch(e){if(e instanceof SyntaxError||e?.message?.match(/資料表|第 \d+ 筆|貨號或其他/))return json({error:e.message},400);throw e;}
}
