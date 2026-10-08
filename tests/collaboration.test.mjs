import test from 'node:test';
import assert from 'node:assert/strict';
import {RemoteAi,validAiPacket,validSpatialPin,validSpatialPose,canSend} from '../public/workspace/collaboration-protocol.js';
import {calibrate,calibrateOrigin,toShared,fromShared,directionToShared,projectPoint} from '../public/workspace/spatial.js';
import {ReferenceCalibration,referenceProgress} from '../wonderland/reference-calibration.js';
import {inspectionRegion,normalizedRGB,classScores} from '../public/workspace/damage-input.js';
import {fit} from '../public/workspace/shared-view.js';
const packet=(seq=1,streamId='stream-a')=>({type:'ai-results',version:1,streamId,seq,mode:'barcode',active:true,width:640,height:480,source:'camera',composited:false,items:[{label:'VL-2048',score:'條碼',warning:false,box:{x:.1,y:.2,w:.3,h:.4}}]});
test('remote AI expires on receiver time and rejects replayed or retired streams',()=>{
 const r=new RemoteAi();assert(r.accept(packet(),100));assert.equal(r.current(2600).items[0].label,'VL-2048');assert.equal(r.current(2601),null);assert.equal(r.current(99),null);
 assert(!r.accept(packet(),200));assert(r.accept({...packet(2),active:false,items:[]},300));assert.equal(r.current(301),null);
 assert(r.accept(packet(1,'stream-b'),400));assert(!r.accept(packet(3),450));r.clear();assert.equal(r.current(500),null);assert(r.accept(packet(),600));
});
test('peer coordinates, confidence and payload sizes are bounded',()=>{
 assert(validAiPacket(packet()));for(const bad of [{width:0},{seq:NaN},{mode:'identity'},{items:Array(13).fill(packet().items[0])},{items:[{...packet().items[0],score:1.1}]},{items:[{...packet().items[0],box:{x:.9,y:0,w:.4,h:.2}}]}])assert(!validAiPacket({...packet(),...bad}));
 assert(canSend({readyState:'open',bufferedAmount:65535}));assert(!canSend({readyState:'open',bufferedAmount:65536}));assert(!canSend({readyState:'closed',bufferedAmount:0}));
 const pin={frame:'frame-1234',id:'marker-1234',number:1,position:[0,1,-2]};assert(validSpatialPin(pin,pin.frame));assert(!validSpatialPin(pin,'other-frame'));assert(!validSpatialPin({...pin,position:[NaN,0,0]},pin.frame));
 assert(validSpatialPose({type:'spatial-pose',frame:pin.frame,position:[0,1,0],forward:[0,0,-1]},pin.frame));assert(!validSpatialPose({type:'spatial-pose',frame:pin.frame,position:[0,0,0],forward:[2,0,0]},pin.frame));
});
const near=(a,b)=>a.forEach((n,i)=>assert(Math.abs(n-b[i])<1e-6,`${a} != ${b}`));
test('single-point workspace establishes metre coordinates and rejects unknown heading',()=>{
 const selection=new ReferenceCalibration();assert.equal(referenceProgress(selection,{active:true,hasHit:false}).disabled,true);
 assert(!selection.accept([0,0,0],{forward:[0,-1,0]}).accepted);assert.equal(selection.points.length,0);
 const result=selection.accept([5,2,-3],{forward:[-1,-.5,0]});assert(result.complete);assert.equal(selection.points.length,1);
 const frame=selection.frame;near(toShared(frame,[5,2,-3]),[0,0,0]);near(fromShared(frame,[1,0,0]),[5,2,-4]);near(fromShared(frame,[0,0,-1]),[4,2,-3]);
 assert.equal(referenceProgress(selection,{active:true,hasHit:true}).button,'工作區已設定 ✓');assert(referenceProgress(selection,{active:true,hasHit:true}).disabled);
 assert(!selection.accept([1,0,0],{forward:[0,0,-1]}).accepted);assert.equal(selection.points.length,1);selection.reset();assert.equal(selection.frame,null);
 assert.throws(()=>calibrateOrigin([0,0,0],[NaN,0,-1]));
});
test('advanced reference retries preserve accepted points and report successful completion',()=>{
 const selection=new ReferenceCalibration();selection.reset('advanced');assert(selection.accept([0,0,0]).accepted);
 assert(!selection.accept([.01,0,0]).accepted);assert.equal(selection.points.length,1);assert(selection.accept([.5,0,0]).accepted);
 const invalid=selection.accept([1,0,0]);assert(!invalid.accepted);assert.match(invalid.error,/直角/);assert.equal(selection.points.length,2);assert.equal(selection.frame,null);
 const waiting=referenceProgress(selection,{active:true,hasHit:true});assert.equal(waiting.button,'確認前方 Z');assert.match(waiting.labels[0],/已設定/);assert.match(waiting.labels[2],/待確認/);
 assert(selection.accept([0,0,-.5]).complete);assert.equal(selection.points.length,3);assert.match(referenceProgress(selection,{active:true,hasHit:true}).summary,/已完成/);
});
test('shared metre coordinates align translated and rotated independent XR origins',()=>{
 const a=calibrate([0,0,0],[1,0,0],[0,0,-1]);const b=calibrate([5,2,-3],[5,2,-4],[4,2,-3]);
 const pin=[.35,.1,-.6];near(toShared(a,fromShared(a,pin)),pin);near(toShared(b,fromShared(b,pin)),pin);near(fromShared(b,[1,0,0]),[5,2,-4]);
 near(directionToShared(b,[-1,0,0]),[0,0,-1]);assert(Math.abs(Math.hypot(...fromShared(a,pin))-.70178344238)<.00001);
 assert.throws(()=>calibrate([0,0,0],[.01,0,0],[0,0,-1]));assert.throws(()=>calibrate([0,0,0],[1,0,0],[2,0,0]));assert.throws(()=>calibrate([0,0,0],[-1,0,0],[0,0,-1]));
});
test('projection rejects behind-camera markers and letterboxing preserves coordinates',()=>{
 const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],projection=[1,0,0,0,0,1,0,0,0,0,-1,-1,0,0,-.2,0];
 near(Object.values(projectPoint([0,0,-1],identity,projection)),[.5,.5]);assert.equal(projectPoint([0,0,1],identity,projection),null);assert.equal(projectPoint([10,0,-1],identity,projection),null);
 assert.deepEqual(fit(640,480,960,540),{x:120,y:0,w:720,h:540});
});
test('damage input uses square inspection scope and ImageNet RGB NCHW normalization',()=>{
 assert.deepEqual(inspectionRegion(960,540,.6),{originX:318,originY:108,width:324,height:324});
 const rgba=new Uint8Array(160*160*4);rgba.set([255,0,128,255]);const input=normalizedRGB(rgba);assert(Math.abs(input[0]-(1-.485)/.229)<1e-6);assert(Math.abs(input[25600]-(-.456/.224))<1e-6);assert(Math.abs(input[51200]-(128/255-.406)/.225)<1e-6);
 const scores=classScores([1000,1000,1000,1000]);assert.deepEqual(scores,[.25,.25,.25,.25]);assert.throws(()=>classScores([NaN,0,0,0]));
});
