import {validAnnotation} from '../public/workspace/annotation-protocol.js';
const HOUR=3600000;
export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail=(status,message)=>{throw new HttpError(status,message);};
const cleanCode=value=>{if(typeof value!=='string'||!/^[A-Z2-9]{8}$/.test(value))fail(400,'房間碼格式不正確。');return value;};
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function bodyOf(request){const text=await request.text();if(text.length>150000)fail(413,'資料過大。');let body;try{body=JSON.parse(text);}catch{fail(400,'資料格式不正確。');}if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'資料格式不正確。');return body;}
export function createSessionService({db,env={},now=()=>Date.now(),fetcher=fetch,allowInvitedGuests=false,beforeGuestConfig=async()=>{}}){
 const first=(sql,...args)=>db.prepare(sql).bind(...args).first();
 const run=(sql,...args)=>db.prepare(sql).bind(...args).run();
 const all=async(sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
 async function authorize(request,code,guestOnly=false){
  const authorization=request.headers.get('Authorization')||'';
  if(!/^Bearer [a-f0-9]{48}$/.test(authorization))fail(401,'請重新開啟有效的邀請或建立房間。');
  const hash=await digest(authorization.slice(7));
  const room=await first('SELECT * FROM rooms WHERE code = ?',cleanCode(code));
  if(!room||room.expires_at<=now()||room.closed)fail(410,'房間已結束或過期，請建立新房間。');
  const role=hash===room.host_hash?'host':hash===room.guest_hash?'guest':null;
  if(!role)fail(403,'你沒有這個房間的存取權限。');
  if(guestOnly&&role!=='guest')fail(403,'發起方須登入後使用房間。');
  return {room,role};
 }
 async function sessions(request,userId){
  if(request.method==='GET'){
   const url=new URL(request.url);const {room,role}=await authorize(request,url.searchParams.get('code'),!userId);
   const cursor=Number(url.searchParams.get('after')||0);if(!Number.isSafeInteger(cursor)||cursor<0)fail(400,'讀取位置不正確。');
   await run(`UPDATE rooms SET ${role==='host'?'host_seen':'guest_seen'} = ? WHERE code = ?`,now(),room.code);
   const messages=await all('SELECT id, sender, payload FROM signals WHERE room_code = ? AND id > ? AND sender != ? ORDER BY id LIMIT 100',room.code,cursor,role);
   return json({messages:messages.map(row=>({id:row.id,...JSON.parse(row.payload)})),peerOnline:(role==='host'?room.guest_seen:room.host_seen)>now()-18000,expiresAt:room.expires_at});
  }
  if(request.method!=='POST')fail(405,'不支援這個操作。');
  const body=await bodyOf(request);
  if(body.action==='create'){
   if(!userId)fail(401,'請登入後建立房間。');
   const count=await first('SELECT COUNT(*) AS n FROM rooms WHERE owner_id = ? AND created_at > ?',userId,now()-60000);if(count.n>=10)fail(429,'建立房間太頻密，請稍後重試。');
   await run('DELETE FROM signals WHERE created_at < ?',now()-HOUR);await run('DELETE FROM rooms WHERE expires_at < ?',now());
   const invite=token(),member=token();let code;
   for(let i=0;i<5;i++){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';code=Array.from(crypto.getRandomValues(new Uint8Array(8)),x=>alphabet[x%alphabet.length]).join('');try{await run('INSERT INTO rooms (code, owner_id, invite_hash, host_hash, created_at, expires_at, host_seen) VALUES (?, ?, ?, ?, ?, ?, ?)',code,userId,await digest(invite),await digest(member),now(),now()+HOUR,now());break;}catch(e){if(i===4)throw e;}}
   return json({code,invite,member,role:'host',expiresAt:now()+HOUR},201);
  }
  if(body.action==='join'){
   const code=cleanCode(body.code);if(typeof body.invite!=='string'||!/^[a-f0-9]{48}$/.test(body.invite))fail(403,'邀請連結不完整。');
   const room=await first('SELECT * FROM rooms WHERE code = ?',code);if(!room||room.closed||room.expires_at<=now())fail(410,'房間已結束或過期。');if(await digest(body.invite)!==room.invite_hash)fail(403,'邀請連結不正確。');
   const member=token(),hash=await digest(member);const joined=await run('UPDATE rooms SET guest_hash = ?, guest_seen = ? WHERE code = ? AND (guest_hash IS NULL OR guest_seen < ?) AND closed = 0 AND expires_at > ?',hash,now(),code,now()-60000,now());if(!joined.meta?.changes)fail(409,'房間已有一位夥伴或已結束，請由發起方建立新房間。');
   const baseline=await first('SELECT COALESCE(MAX(id),0) AS cursor FROM signals WHERE room_code = ?',code);
   await run('INSERT INTO signals (room_code, sender, payload, created_at) VALUES (?, ?, ?, ?)',code,'guest',JSON.stringify({type:'peer-ready'}),now());return json({code,member,role:'guest',cursor:baseline.cursor,expiresAt:room.expires_at});
  }
  const {room,role}=await authorize(request,body.code,!userId);
  if(body.action==='send'){
   const message=body.message;if(!message||!['description','candidate','peer-ready','restart','bye','media-state'].includes(message.type))fail(400,'連線訊息不正確。');const payload=JSON.stringify(message);if(payload.length>110000)fail(413,'連線訊息過大。');
   const count=await first('SELECT COUNT(*) AS n FROM signals WHERE room_code = ? AND sender = ? AND created_at > ?',room.code,role,now()-60000);if(count.n>200)fail(429,'連線訊息太頻密，請稍後再試。');
   await run('INSERT INTO signals (room_code, sender, payload, created_at) VALUES (?, ?, ?, ?)',room.code,role,payload,now());return json({ok:true});
  }
  if(body.action==='leave'){
   if(role==='host')await run('UPDATE rooms SET closed = 1 WHERE code = ?',room.code);
   else {await run('UPDATE rooms SET guest_hash = NULL, guest_seen = 0 WHERE code = ?',room.code);await run('INSERT INTO signals (room_code, sender, payload, created_at) VALUES (?, ?, ?, ?)',room.code,'guest',JSON.stringify({type:'bye'}),now());}return json({ok:true});
  }
  fail(400,'操作不正確。');
 }
 async function records(request,userId){
  if(request.method==='GET'){
   const id=new URL(request.url).searchParams.get('id');if(id){if(!/^[a-f0-9-]{36}$/.test(id))fail(400,'紀錄編號不正確。');const item=await first('SELECT id, payload, updated_at FROM records WHERE id = ? AND owner_id = ?',id,userId);if(!item)fail(404,'找不到這份巡檢紀錄。');return json({id:item.id,record:JSON.parse(item.payload),updatedAt:item.updated_at});}
   return json({records:await all('SELECT id, title, updated_at, checks_done FROM records WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 30',userId)});
  }
  if(request.method!=='POST')fail(405,'不支援這個操作。');const body=await bodyOf(request);const id=body.id;if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))fail(400,'紀錄編號不正確。');
  const record=body.record;if(!record||!Array.isArray(record.checks)||record.checks.length!==3||record.checks.some(x=>typeof x!=='boolean')||!Array.isArray(record.notes)||record.notes.length>500||!Array.isArray(record.pins)||record.pins.length>100||!Array.isArray(record.worldPins)||record.worldPins.length>100)fail(400,'巡檢紀錄格式不正確。');
  if(record.annotations!==undefined&&(!Array.isArray(record.annotations)||record.annotations.length>64||!record.annotations.every(validAnnotation)))fail(400,'協作指令格式不正確。');
  const payload=JSON.stringify(record);if(payload.length>120000)fail(413,'巡檢紀錄過大，請先匯出備份。');const old=await first('SELECT owner_id FROM records WHERE id = ?',id);if(old&&old.owner_id!==userId)fail(403,'這份紀錄不屬於你。');
  const title=typeof record.title==='string'?record.title.slice(0,80):'入庫貨品驗收';const saved=await run('INSERT INTO records (id, owner_id, title, payload, checks_done, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, payload=excluded.payload, checks_done=excluded.checks_done, updated_at=excluded.updated_at WHERE records.owner_id=excluded.owner_id',id,userId,title,payload,record.checks.filter(Boolean).length,now());if(!saved.meta?.changes)fail(403,'這份紀錄不屬於你。');return json({id,savedAt:now()});
 }
 async function config(expiresAt=now()+HOUR){
  const ttl=Math.min(3600,Math.floor((expiresAt-now())/1000));if(ttl<1)fail(410,'房間已過期，請重新取得邀請。');expiresAt=now()+ttl*1000;
  const iceServers=[{urls:'stun:stun.cloudflare.com:3478'}];let relayConfigured=false;
  if(env.CLOUDFLARE_TURN_KEY_ID&&env.CLOUDFLARE_TURN_API_TOKEN){
   if(!/^[a-zA-Z0-9_-]{1,128}$/.test(env.CLOUDFLARE_TURN_KEY_ID))fail(503,'TURN Key ID 設定不正確。');
   const response=await fetcher(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`,{method:'POST',headers:{Authorization:`Bearer ${env.CLOUDFLARE_TURN_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({ttl}),signal:AbortSignal.timeout(8000)});
   if(!response.ok)fail(503,'Cloudflare TURN 暫時未能產生憑證，請檢查伺服器設定。');const result=await response.json();const servers=(Array.isArray(result.iceServers)?result.iceServers:[result.iceServers]).filter(s=>s&&typeof s==='object'&&(typeof s.urls==='string'||Array.isArray(s.urls)));
   if(!servers.some(s=>(Array.isArray(s.urls)?s.urls:[s.urls]).some(u=>/^turns?:/.test(u))))fail(503,'Cloudflare TURN 未回傳可用的中繼設定。');
   return json({iceServers:servers,relayConfigured:true,provider:'cloudflare',expiresAt,sessionTtlSeconds:ttl});
  }
  if(env.TURN_URLS&&env.TURN_SHARED_SECRET){const urls=env.TURN_URLS.split(',').map(x=>x.trim()).filter(x=>/^turns?:/.test(x));if(urls.length){const username=`${Math.floor(expiresAt/1000)}:visionlink`;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.TURN_SHARED_SECRET),{name:'HMAC',hash:'SHA-1'},false,['sign']);const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(username)));iceServers.push({urls,username,credential:btoa(String.fromCharCode(...signature))});relayConfigured=true;}}
  return json({iceServers,relayConfigured,provider:relayConfigured?'coturn':'none',expiresAt,sessionTtlSeconds:ttl});
 }
 return async function handle(request,userId){try{
  const url=new URL(request.url),origin=request.headers.get('Origin');if(!userId&&(!allowInvitedGuests||!['/api/session','/api/config'].includes(url.pathname)))fail(401,'請登入後再使用協作服務。');if(request.method!=='GET'&&origin&&origin!==url.origin)fail(403,'不允許跨網站操作。');
  if(url.pathname==='/api/session')return await sessions(request,userId);if(url.pathname==='/api/records')return await records(request,userId);if(url.pathname==='/api/config'&&request.method==='GET'){if(userId)return await config();const {room}=await authorize(request,url.searchParams.get('code'),true);await beforeGuestConfig(room);return await config(room.expires_at);}fail(404,'找不到服務。');
 }catch(e){if(e instanceof HttpError)return json({error:e.message},e.status);console.error('Session service operation failed');return json({error:'服務暫時無法使用，請稍後重試。'},503);}};
}
