import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {unlinkSync} from 'node:fs';
import {openLocalDatabase} from '../lib/local-db.mjs';
import {createSessionService} from '../lib/session-service.mjs';
function fixture(env={},options={}){const db=openLocalDatabase();let time=1700000000000;const handle=createSessionService({db,env,now:()=>time,...options});return {db,advance:n=>time+=n,request:async(path,body,member,user='alice',origin)=>{const res=await handle(new Request('https://example.test'+path,{method:body===undefined?'GET':'POST',headers:{...(member?{Authorization:'Bearer '+member}:{}),...(origin?{Origin:origin}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})}),user);return {status:res.status,data:await res.json()};}};}
test('room admission, isolation, trickle delivery, rejoin cursor and expiry',async()=>{const f=fixture();try{
 const host=(await f.request('/api/session',{action:'create'})).data;
 assert.equal((await f.request('/api/session',{action:'join',code:host.code,invite:'a'.repeat(48)})).status,403);
 const guest=(await f.request('/api/session',{action:'join',code:host.code,invite:host.invite})).data;
 assert.equal((await f.request('/api/session',{action:'join',code:host.code,invite:host.invite})).status,409);
 assert.equal((await f.request('/api/session?code='+host.code,undefined,'b'.repeat(48))).status,403);
 await f.request('/api/session',{action:'send',code:host.code,message:{type:'candidate',candidate:{candidate:'test'}}},host.member);
 const incoming=await f.request('/api/session?code='+host.code,undefined,guest.member);assert.equal(incoming.data.messages[0].type,'candidate');
 const mine=await f.request('/api/session?code='+host.code,undefined,host.member);assert.equal(mine.data.messages.length,1);assert.equal(mine.data.messages[0].type,'peer-ready');
 await f.request('/api/session',{action:'leave',code:host.code},guest.member);
 const guest2=(await f.request('/api/session',{action:'join',code:host.code,invite:host.invite})).data;
 assert.equal((await f.request(`/api/session?code=${host.code}&after=${guest2.cursor}`,undefined,guest2.member)).data.messages.length,0);
 f.advance(3600001);assert.equal((await f.request('/api/session?code='+host.code,undefined,host.member)).status,410);
}finally{f.db.sqlite.close();}});
test('records persist, are scoped by owner, and reject malformed or anonymous writes',async()=>{const f=fixture();try{const id=crypto.randomUUID(),record={title:'VL-2048',checks:[true,false,false],notes:[],pins:[],worldPins:[]};assert.equal((await f.request('/api/records',{id,record})).status,200);assert.deepEqual((await f.request('/api/records?id='+id)).data.record,record);assert.equal((await f.request('/api/records?id='+id,undefined,null,'bob')).status,404);assert.equal((await f.request('/api/records',{id,record},null,'bob')).status,403);assert.equal((await f.request('/api/records',{id,record},null,null)).status,401);assert.equal((await f.request('/api/records',null)).status,400);assert.equal((await f.request('/api/records',{id,record},null,'alice','https://evil.test')).status,403);assert.equal((await f.request('/api/records')).data.records[0].checks_done,1);}finally{f.db.sqlite.close();}});
test('TURN returns temporary HMAC credentials without the shared secret',async()=>{const f=fixture({TURN_URLS:'turn:relay.test:3478',TURN_SHARED_SECRET:'test-only-secret'});try{const r=(await f.request('/api/config')).data;assert.equal(r.relayConfigured,true);const turn=r.iceServers[1];assert.equal(turn.credential,createHmac('sha1','test-only-secret').update(turn.username).digest('base64'));assert.ok(!JSON.stringify(r).includes('test-only-secret'));}finally{f.db.sqlite.close();}});
test('SQLite records survive process database close and reopen',async()=>{const file=`.local-data/test-${crypto.randomUUID()}.sqlite`,id=crypto.randomUUID();let db=openLocalDatabase(file);const record={checks:[true,true,false],notes:[{text:'已核對',author:'你',time:'2026-10-07T00:00:00Z'}],pins:[],worldPins:[]};let handle=createSessionService({db});assert.equal((await handle(new Request('https://example.test/api/records',{method:'POST',body:JSON.stringify({id,record})}),'alice')).status,200);db.sqlite.close();db=openLocalDatabase(file);try{handle=createSessionService({db});const response=await handle(new Request('https://example.test/api/records?id='+id),'alice');assert.deepEqual((await response.json()).record,record);}finally{db.sqlite.close();unlinkSync(file);}});

test('invited anonymous guests are limited to their room and cannot use host or record privileges',async()=>{const f=fixture({}, {allowInvitedGuests:true});try{
 const host=(await f.request('/api/session',{action:'create'})).data,other=(await f.request('/api/session',{action:'create'})).data;
 assert.equal((await f.request('/api/session',{action:'create'},null,null)).status,401);
 assert.equal((await f.request('/api/config',undefined,null,null)).status,401);
 assert.equal((await f.request('/api/config?code='+host.code,undefined,host.invite,null)).status,403);
 assert.equal((await f.request('/api/session',{action:'join',code:host.code,invite:'f'.repeat(48)},null,null)).status,403);
 const guest=await f.request('/api/session',{action:'join',code:host.code,invite:host.invite},null,null);assert.equal(guest.status,200);
 assert.equal((await f.request('/api/session',{action:'join',code:host.code,invite:host.invite},null,null)).status,409);
 assert.equal((await f.request('/api/session?code='+host.code,undefined,host.member,null)).status,403);
 assert.equal((await f.request('/api/session?code='+other.code,undefined,guest.data.member,null)).status,403);
 assert.equal((await f.request('/api/records',undefined,guest.data.member,null)).status,401);
 assert.equal((await f.request('/api/records',{id:crypto.randomUUID(),record:{checks:[false,false,false],notes:[],pins:[],worldPins:[]}},guest.data.member,null)).status,401);
 await f.request('/api/session',{action:'send',code:host.code,message:{type:'candidate',candidate:{candidate:'host'}}},host.member);
 assert.equal((await f.request('/api/session?code='+host.code,undefined,guest.data.member,null)).data.messages[0].type,'candidate');
 assert.equal((await f.request('/api/session',{action:'send',code:host.code,message:{type:'peer-ready'}},guest.data.member,null)).status,200);
 assert.equal((await f.request('/api/config?code='+other.code,undefined,guest.data.member,null)).status,403);
 await f.request('/api/session',{action:'leave',code:host.code},host.member);
 assert.equal((await f.request('/api/session?code='+host.code,undefined,guest.data.member,null)).status,410);
 assert.equal((await f.request('/api/config?code='+host.code,undefined,guest.data.member,null)).status,410);
 assert.equal((await f.request('/api/session',{action:'join',code:host.code,invite:host.invite},null,null)).status,410);
}finally{f.db.sqlite.close();}});

test('guest credentials expire with the room and the default service still requires login',async()=>{
 const old=fixture();try{const room=(await old.request('/api/session',{action:'create'})).data;assert.equal((await old.request('/api/session',{action:'join',code:room.code,invite:room.invite},null,null)).status,401);}finally{old.db.sqlite.close();}
 let issued;const f=fixture({CLOUDFLARE_TURN_KEY_ID:'test-key',CLOUDFLARE_TURN_API_TOKEN:'private-test-token'},{allowInvitedGuests:true,fetcher:async(url,options)=>{issued=JSON.parse(options.body);return Response.json({iceServers:[{urls:'turn:relay.test:3478',username:'short-lived',credential:'temporary'}]});}});try{
 const room=(await f.request('/api/session',{action:'create'})).data;
 const guest=(await f.request('/api/session',{action:'join',code:room.code,invite:room.invite},null,null)).data;f.advance(3000000);
 const config=await f.request('/api/config?code='+room.code,undefined,guest.member,null);assert.equal(config.status,200);assert.equal(issued.ttl,600);assert.equal(config.data.expiresAt,room.expiresAt);
 assert.doesNotMatch(JSON.stringify(config.data),/private-test-token/);
 f.advance(600000);assert.equal((await f.request('/api/session?code='+room.code,undefined,guest.member,null)).status,410);assert.equal((await f.request('/api/config?code='+room.code,undefined,guest.member,null)).status,410);
}finally{f.db.sqlite.close();}});
