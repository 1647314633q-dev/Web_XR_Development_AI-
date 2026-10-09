import {test} from 'node:test';
import assert from 'node:assert/strict';
import {labelQuad,labelUV} from '../wonderland/label-geometry.js';
import {XRVideoWatchdog} from '../public/workspace/xr-video-watchdog.js';
import {SharedView} from '../public/workspace/shared-view.js';
import {withDeadline} from '../public/workspace/media-recovery.js';
import {NativeAnnotations} from '../wonderland/annotations.js';
import {installLiveCollaboration} from '../public/workspace/live-collaboration.js';

test('canvas labels keep upright UVs on both faces and follow the viewer basis',()=>{
 const pose=[0,1,0,0,-1,0,0,0,0,0,1,0,0,0,0,1],center=[0,0,-1];
 const vertices=labelQuad(center,pose);
 assert.equal(vertices.length,36);assert.equal(labelUV.length,24);
 for(let i=0;i<12;i++){const x=vertices[i*3],y=vertices[i*3+1];assert.equal(labelUV[i*2],y>0?1:0);assert.equal(labelUV[i*2+1],x<-.03?1:0);}
 assert.deepEqual(vertices.slice(0,3),vertices.slice(24,27));
});
test('labels stay compact even when the phone approaches an anchor',()=>{
 const pose=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 const width=d=>Math.max(...labelQuad([0,0,-d],pose).filter((_,i)=>i%3===0));
 assert.ok(width(.1)<.023);assert.equal(width(5),.18);assert.ok(width(.2)>width(.1));
});
test('AR camera watchdog handles missing frames, recovery frames and session cancellation',()=>{
 let id=0;const jobs=new Map(),failures=[];
 const guard=new XRVideoWatchdog(reason=>failures.push(reason),{schedule:fn=>{jobs.set(++id,fn);return id;},cancel:key=>jobs.delete(key)});
 guard.start();const old=jobs.keys().next().value;guard.frame();assert(!jobs.has(old));assert.equal(jobs.size,1);
 jobs.values().next().value();assert.deepEqual(failures,['timeout']);guard.fail('unsupported');assert.equal(failures.length,1);
 guard.start();guard.fail('unsupported');assert.deepEqual(failures,['timeout','unsupported']);
 guard.start();guard.stop();assert.equal(jobs.size,0);guard.frame();assert.equal(jobs.size,0);
});
test('AR switching preserves a labelled frozen image and stable outgoing video track',()=>{
 const previous=globalThis.document,contexts=[];let source={width:640,height:480},closed=0;
 const track={stop(){}};
 globalThis.document={createElement(){const log=[];const ctx={log,fillRect(){},clearRect(){},drawImage(...args){log.push(['image',...args]);},fillText(text){log.push(['text',text]);},save(){},restore(){}};contexts.push(ctx);return {width:0,height:0,getContext:()=>ctx,captureStream:()=>({getVideoTracks:()=>[track],getTracks:()=>[track]})};}};
 let share;
 try{
  share=new SharedView({source:()=>source,items:()=>[],pins:()=>[],onChange(){}});
  assert.equal(share.getTrack(null),track);share.setXR(true,false);source=null;share.draw();
  assert.equal(share.getTrack(null),track);assert(contexts[0].log.some(x=>x[0]==='text'&&/最後畫面（已暫停）/.test(x[1])));
  share.setEnabled(false);assert.equal(share.getTrack(null),track);
  share.receiveXR({width:640,height:480,close(){closed++;}},[],[]);share.draw();assert(share.xrSupported);
  share.setXR(false,false);assert.equal(closed,1);share.draw();assert(share.restoring);
  source={width:640,height:480};share.draw();assert(!share.restoring);
 }finally{share?.destroy();globalThis.document=previous;}
});

test('XR frames keep the outgoing canvas moving with parent timers stopped, including commands',()=>{
 const previous=globalThis.document,previousInterval=globalThis.setInterval;let requests=0,frames=0,painted=0;
 const track={requestFrame(){requests++;},stop(){}};
 globalThis.setInterval=()=>0;
 globalThis.document={createElement(){const ctx={fillRect(){},clearRect(){},drawImage(){},putImageData(){frames++;},fillText(){painted++;},measureText:()=>({width:60}),save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};return {width:0,height:0,getContext:()=>ctx,captureStream:()=>({getVideoTracks:()=>[track],getTracks:()=>[track]})};}};
 let share;
 try{share=new SharedView({source:()=>null,items:()=>[],pins:()=>[],onChange(){}});const stable=share.getTrack(null);share.setXR(true,false);const baseline=requests;
  for(let i=0;i<40;i++)share.receiveXRImage({width:320,height:240},[],i<10?[]:[{kind:'arrow',points:[[.1,.1],[.5,.5]],text:'這裡檢查',source:'manual'}]);
  assert.equal(frames,40);assert.equal(requests-baseline,40);assert.equal(share.getTrack(null),stable);assert(painted>=30);
  share.pauseXR();assert(share.xrPaused);share.receiveXRImage({width:320,height:240},[],[]);assert(!share.xrPaused);assert(share.xrSupported);
 }finally{share?.destroy();globalThis.document=previous;globalThis.setInterval=previousInterval;}
});

test('watchdog distinguishes startup grace and allows late frames to recover after timeout',()=>{
 const jobs=new Map(),failures=[];let id=0;
 const guard=new XRVideoWatchdog(reason=>failures.push(reason),{schedule:(fn,delay)=>{jobs.set(++id,{fn,delay});return id;},cancel:key=>jobs.delete(key)});
 guard.start();assert.equal([...jobs.values()][0].delay,20000);guard.frame();assert.equal([...jobs.values()][0].delay,10000);
 [...jobs.values()][0].fn();assert.equal(guard.failed,true);assert.deepEqual(failures,['timeout']);guard.frame();assert.equal(guard.failed,false);assert.equal(jobs.size,1);guard.stop();assert.equal(jobs.size,0);
});

test('camera recovery deadline releases late streams and does not block another attempt',async()=>{
 let expire,resolveLate,stopped=0;const pending=new Promise(resolve=>resolveLate=resolve);
 const recovery=withDeadline(pending,{schedule:fn=>{expire=fn;return 1;},cancel(){},onLate:stream=>stream.getTracks().forEach(t=>t.stop())});
 expire();await assert.rejects(recovery,/逾時/);resolveLate({getTracks:()=>[{stop(){stopped++;}}]});await Promise.resolve();assert.equal(stopped,1);
 assert.equal(await withDeadline(Promise.resolve('restored')),'restored');
});

test('an echoed AR command is idempotent and a failed replacement leaves the old visual intact',()=>{
 const native=new NativeAnnotations({},{});let builds=0;
 native.rebuild=item=>{builds++;item.visuals=[];};
 const a={id:'command-123',revision:1,kind:'label',spatial:{points:[[0,0,0]],normal:[0,1,0]}};
 native.set(a,null);native.set({...a},null);assert.equal(builds,1);const previous=native.items.get(a.id);
 native.rebuild=()=>{throw new Error('texture allocation failed');};
 assert.throws(()=>native.set({...a,revision:2},null),/texture/);assert.equal(native.items.get(a.id),previous);
 assert.throws(()=>native.set({...a,id:'command-456'},null),/texture/);assert.equal(native.items.size,1);
});

test('live AR sharing retries on timeout without ending XR and clears the warning on the next frame',()=>{
 const original={document:globalThis.document,window:globalThis.window,setInterval:globalThis.setInterval,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
 let id=0,restores=0;const jobs=new Map(),messages=[],engineMessages=[],elements=new Map();
 const element=name=>{if(!elements.has(name))elements.set(name,{textContent:'',hidden:true,readyState:0});return elements.get(name);};
 globalThis.window={addEventListener(){}};globalThis.setInterval=()=>0;globalThis.setTimeout=(fn,ms)=>{jobs.set(++id,{fn,ms});return id;};globalThis.clearTimeout=id=>jobs.delete(id);
 globalThis.document={createElement(){const ctx={fillRect(){},clearRect(){},drawImage(){},putImageData(){},fillText(){},save(){},restore(){}};return {width:0,height:0,getContext:()=>ctx};}};
 const state={role:'host',channel:{readyState:'open',bufferedAmount:0},pins:[],ai:false,stopForXR(){},restoreAfterXR(){restores++;return true;}};
 try{installLiveCollaboration({state,$:element,sendMessage:m=>messages.push(m),engineMessage:m=>engineMessages.push(m),renderResults(){},drawOverlay(){},toast(){},addNote(){}});
  window.visionLinkXR.prepare();state.liveEngineMessage({type:'xr-share-status',active:true,pending:true});
  [...jobs.values()][0].fn();assert(!engineMessages.some(m=>m.type==='leave-ar'));assert(engineMessages.some(m=>m.type==='retry-ar-share'));assert.equal(restores,0);assert(state.sharedView.xrActive);assert.equal(messages.at(-1).mode,'ar-paused');
  window.visionLinkXR.frame({width:320,height:180},[],[]);assert.equal(messages.at(-1).mode,'ar');assert.equal(element('shareStatus').textContent,'AR 鏡頭及空間標記正在共享');
  state.liveMessage({type:'video-state',mode:'ar-paused'});assert.equal(element('remoteShareNotice').hidden,false);state.liveMessage({type:'video-state',mode:'ar'});assert.equal(element('remoteShareNotice').hidden,true);
 }finally{state.sharedView?.destroy();Object.assign(globalThis,original);}
});
