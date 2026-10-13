import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AR} from '../public/workspace/vendor/aruco/detector.js';
import {MarkerTracker} from '../public/workspace/marker-tracker.js';
import {MARKER_ID,homography,transform,validCorners,anchorToMarker,projectMarker} from '../public/workspace/marker-geometry.js';
import {paintMarkerInstructions} from '../public/workspace/marker-render.js';
import {validAnnotation,shapePath} from '../public/workspace/annotation-protocol.js';
import {mayReceiveAnnotation} from '../public/workspace/annotation-permissions.js';
import {fit} from '../public/workspace/shared-view.js';
import {projectReferenceAnnotation} from '../public/workspace/reference-frame.js';
import {projectPoint} from '../public/workspace/spatial.js';
const square=[[0,0],[1,0],[1,1],[0,1]],epoch='test-epoch-123';
const base=[[.22,.2],[.7,.25],[.74,.81],[.18,.72]];
const close=(a,b,tol=1e-8)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<tol,`${a} != ${b}`));
const make=(kind='arrow')=>({id:crypto.randomUUID(),owner:'guest-123',target:'host-123',revision:1,kind,text:'這裡拆 → ABC 123',source:'manual',reference:'reference-123',points:[[.43,.43],[.58,.58]]});
function photo(corners=base,rect={x:0,y:0,w:1,h:1}){return {id:'reference-123',at:Date.now(),rect,marker:{epoch,id:MARKER_ID,corners}};}
function image(corners,{width=480,height=480,mirror=false,id=MARKER_ID}={}){
 const data=new Uint8ClampedArray(width*height*4).fill(255),inv=homography(corners,square),bits=new AR.Dictionary('ARUCO_MIP_36h12').codeList[id];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=transform(inv,[(mirror?width-1-x:x)/width,y/height]);if(p.every(n=>n>=0&&n<1)){const col=Math.floor(p[0]*8),row=Math.floor(p[1]*8),value=col&&col<7&&row&&row<7&&bits[(row-1)*6+col-1]==='1'?255:0;const offset=(y*width+x)*4;data[offset]=data[offset+1]=data[offset+2]=value;}}
 return {width,height,data};
}
test('actual detector canonical corners survive perspective and all four device rotations; mirrored paper is rejected',()=>{
 const tracker=new MarkerTracker();
 for(let turn=0;turn<4;turn++){
  const c=base.map(([x,y])=>turn===0?[x,y]:turn===1?[1-y,x]:turn===2?[1-x,1-y]:[y,1-x]);
  tracker.reset();const frame=image(c);assert.equal(tracker.detect(frame),null);assert.equal(tracker.detect(frame),null);const actual=tracker.detect(frame);assert.ok(actual);actual.forEach((p,i)=>close(p,c[i],.01));
  tracker.reset();assert.equal(tracker.detect(image(c,{mirror:true})),null);
 }
 tracker.reset();assert.equal(tracker.detect(image(base,{id:18})),null);
});
test('2D arrows, circles and freehand retain their exact footprint in portrait/landscape reference letterboxing',()=>{
 for(const [w,h] of [[720,1280],[1280,720],[1024,768],[768,1024]])for(const kind of ['arrow','circle','line','label']){
  const r=fit(w,h,640,360),rect={x:r.x/640,y:r.y/360,w:r.w/640,h:r.h/360};
  const a=make(kind);a.points=a.points.map(([x,y])=>[rect.x+x*rect.w,rect.y+y*rect.h]);
  const planar=anchorToMarker(a,photo(base,rect),epoch),fixed={...a,revision:2,planar};assert(validAnnotation(fixed));
  const projected=projectMarker(fixed,base,epoch);shapePath(kind,a.points).forEach(([x,y],i)=>close(projected.path[i],[(x-rect.x)/rect.w,(y-rect.y)/rect.h]));
  for(let turn=0;turn<4;turn++){const c=base.map(([x,y])=>turn===0?[x,y]:turn===1?[1-y,x]:turn===2?[1-x,1-y]:[y,1-x]),p=projectMarker(fixed,c,epoch);
   projected.path.forEach(([x,y],i)=>close(p.path[i],turn===0?[x,y]:turn===1?[1-y,x]:turn===2?[1-x,1-y]:[y,1-x]));}
 }
});
test('tracking rejects reflected, collapsed or expired reference frames, borders and distant extrapolation',()=>{
 assert.equal(validCorners(base.map(([x,y])=>[1-x,y])),false);assert.equal(validCorners([[0,0],[1,0],[1,0],[0,0]]),false);
 const a=make();assert.throws(()=>anchorToMarker(a,{...photo(),at:Date.now()-120001},epoch),/失效/);assert.throws(()=>anchorToMarker(a,photo(),'other-epoch'),/失效/);
 assert.throws(()=>anchorToMarker({...a,points:[[0,.2],[.5,.5]]},photo(base,{x:.25,y:0,w:.5,h:1}),epoch),/留白/);
 assert.throws(()=>anchorToMarker({...a,points:[[.99,.99],[1,1]]},photo([[.1,.1],[.2,.1],[.2,.2],[.1,.2]]),epoch),/太遠/);
 const fixed={...a,planar:anchorToMarker(a,photo(),epoch)};assert.equal(projectMarker(fixed,base,'new-epoch'),null);
 const tracker=new MarkerTracker();const frame=image(base);for(let i=0;i<3;i++)tracker.detect(frame);assert.equal(tracker.detect({width:480,height:480,data:new Uint8ClampedArray(480*480*4).fill(255)}),null);assert.equal(tracker.detect(frame),null);
});
test('planar confirmation is host-only, cannot change the original 2D instruction and rejects malicious geometry',()=>{
 const a=make(),fixed={...a,revision:2,planar:anchorToMarker(a,photo(),epoch)};
 assert(mayReceiveAnnotation('guest',a.owner,a.target,fixed,a));assert(!mayReceiveAnnotation('host',a.target,a.owner,fixed,a));
 assert(!mayReceiveAnnotation('guest',a.owner,a.target,{...fixed,points:[[.1,.1],[.2,.2]]},a));
 assert(!validAnnotation({...fixed,planar:{...fixed.planar,path:[[NaN,0]]}}));assert(!validAnnotation({...fixed,planar:{...fixed.planar,marker:18}}));
});
test('AR labels use a positive identity transform, never mirrored or upside down when the plane rotates',()=>{
 const calls=[];const ctx={save(){},restore(){},setTransform(...args){calls.push(args);},beginPath(){},rect(){},clip(){},moveTo(){},lineTo(){},stroke(){},measureText(t){return {width:t.length*8};},fillRect(){},fillText(t){assert.equal(t,'這裡拆 → ABC 123');}};
 const a=make(),fixed={...a,planar:anchorToMarker(a,photo(),epoch)};
 paintMarkerInstructions(ctx,[fixed],base.map(([x,y])=>[1-x,1-y]),epoch,640,480);assert.deepEqual(calls,[[1,0,0,1,0,0]]);
});
test('native XR inverse projection preserves reference arrows and circles including portrait bars',()=>{
 const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],projection=[1,0,0,0,0,1,0,0,0,0,-1.02,-1,0,0,-.202,0];
 for(const kind of ['arrow','circle','line','label']){
  const a=make(kind),r={x:.25,y:0,w:.5,h:1},ref={camera:{epoch,matrix,projection},rect:r};
  const result=projectReferenceAnnotation(a,ref,[0,0,-2],[0,0,1]);
  // Remove the 3 mm anti-z-fighting offset before comparing exact ray intersections.
  result.path.forEach((p,i)=>{const q=projectPoint([p[0],p[1],p[2]-.003],matrix,projection),expected=shapePath(kind,a.points)[i];close([q.x*r.w+r.x,q.y*r.h+r.y],expected);});
 }
});
