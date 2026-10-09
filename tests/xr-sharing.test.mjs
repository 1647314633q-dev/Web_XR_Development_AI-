import {test} from 'node:test';
import assert from 'node:assert/strict';
import {labelQuad,labelUV} from '../wonderland/label-geometry.js';
import {XRVideoWatchdog} from '../public/workspace/xr-video-watchdog.js';
import {SharedView} from '../public/workspace/shared-view.js';

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
