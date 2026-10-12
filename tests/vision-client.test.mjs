import test from 'node:test';
import assert from 'node:assert/strict';
import {isAppleMobile,createVisionClient,MainVisionClient,isVisionContextError} from '../public/workspace/vision-client.js';
const canvas=()=>({getContext(){return {drawImage(){}};}});
test('iPad Chrome and desktop-identifying iPad use page inference; barcode remains a worker',()=>{
 const ipad={platform:'iPad',userAgent:'CriOS/154 Mobile Safari',maxTouchPoints:5},desktop={platform:'MacIntel',userAgent:'Macintosh Safari',maxTouchPoints:5};
 assert(isAppleMobile(ipad));assert(isAppleMobile(desktop));assert(!isAppleMobile({...desktop,maxTouchPoints:0}));
 const main={},workers=[];class Worker{constructor(...args){workers.push(args);}}
 for(const nav of [ipad,desktop])for(const mode of ['objects','faces'])assert.equal(createVisionClient(mode,{nav,WorkerClass:Worker,mainFactory:()=>main}),main);
 createVisionClient('barcode',{nav:ipad,WorkerClass:Worker});createVisionClient('damage',{nav:ipad,WorkerClass:Worker});
 assert.equal(workers.length,2);assert.equal(workers[0][0],'vision-worker.js');
 assert.equal(createVisionClient('objects',{forceMain:true,nav:{},mainFactory:()=>main}),main);
 assert(isVisionContextError("Can't find available document"));assert(isVisionContextError('OffscreenCanvas is not defined'));assert(!isVisionContextError('model download failed'));
});
test('main inference reports real detector output, dimensions and closes each bitmap',async()=>{
 const results=[];let closed=0,received;
 const client=new MainVisionClient({makeCanvas:canvas,now:()=>0,load:async(mode,graphics)=>({detectForVideo(input,ts){received={input,ts};return {detections:[{boundingBox:{originX:2,originY:3,width:4,height:5},categories:[{categoryName:'box',score:.8}]}]};},close(){}})});
 client.onmessage=e=>results.push(e.data);client.postMessage({type:'init',mode:'objects'});await client.initialization;
 client.postMessage({type:'frame',timestamp:15,bitmap:{width:640,height:480,close(){closed++;}}});
 assert.equal(results[0].type,'ready');assert.equal(results[1].detections[0].label,'box');assert.equal(results[1].width,640);assert.equal(received.ts,15);assert.equal(received.input.width,640);assert.equal(closed,1);client.terminate();
});
test('stopping while a model loads closes it and suppresses stale ready messages',async()=>{
 let finish,closed=0;const results=[];
 const client=new MainVisionClient({makeCanvas:canvas,load:()=>new Promise(r=>finish=r)});client.onmessage=e=>results.push(e.data);
 client.postMessage({type:'init',mode:'faces'});await Promise.resolve();client.terminate();finish({close(){closed++;}});await client.initialization;
 assert.equal(closed,1);assert.deepEqual(results,[]);
 let bitmapClosed=0;client.postMessage({type:'frame',bitmap:{close(){bitmapClosed++;}}});assert.equal(bitmapClosed,1);
});
test('initialization and inference errors release resources and report errors',async()=>{
 const failed=new MainVisionClient({makeCanvas:canvas,load:async()=>{throw new Error('model unavailable');}});let error;
 failed.onmessage=e=>error=e.data;failed.postMessage({type:'init',mode:'objects'});await failed.initialization;assert.equal(error.message,'model unavailable');failed.terminate();
 const client=new MainVisionClient({makeCanvas:canvas,load:async()=>({detectForVideo(){throw new Error('frame failed');},close(){}})});client.onmessage=e=>error=e.data;
 client.postMessage({type:'init',mode:'objects'});await client.initialization;let closed=0;
 client.postMessage({type:'frame',bitmap:{width:4,height:4,close(){closed++;}}});assert.equal(error.message,'frame failed');assert.equal(closed,1);client.terminate();
});
