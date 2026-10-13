import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectReferenceAnnotation,ReferenceChunks} from '../public/workspace/reference-frame.js';
import {shapePath,validAnnotation} from '../public/workspace/annotation-protocol.js';
import {projectPoint} from '../public/workspace/spatial.js';
const make=kind=>({id:'command-123',owner:'guest-123',target:'host-123',revision:1,kind,text:'這裡拆 → ABC 123',source:'manual',reference:'reference-123',points:[[.43,.43],[.58,.58]]});
const close=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-8));
const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],projection=[1,0,0,0,0,1,0,0,0,0,-1.02,-1,0,0,-.202,0];
test('native XR inverse projection preserves reference arrows and circles including portrait bars',()=>{
 for(const kind of ['arrow','circle','line','label']){
  const a=make(kind),r={x:.25,y:0,w:.5,h:1},ref={camera:{epoch:'epoch-123',matrix,projection},rect:r};
  const result=projectReferenceAnnotation(a,ref,[0,0,-2],[0,0,1]);
  result.path.forEach((p,i)=>{const q=projectPoint([p[0],p[1],p[2]-.003],matrix,projection),expected=shapePath(kind,a.points)[i];close([q.x*r.w+r.x,q.y*r.h+r.y],expected);});
 }
});
test('invalid planes, missing camera data, letterbox clicks and retired marker annotations fail clearly',()=>{
 const a=make('arrow'),ref={camera:{epoch:'epoch-123',matrix,projection},rect:{x:.25,y:0,w:.5,h:1}};
 assert.throws(()=>projectReferenceAnnotation(a,{...ref,camera:null},[0,0,-2],[0,0,1]));
 assert.throws(()=>projectReferenceAnnotation({...a,points:[[0,.2],[.5,.5]]},ref,[0,0,-2],[0,0,1]),/空白/);
 assert.throws(()=>projectReferenceAnnotation(a,ref,[0,0,-2],[0,0,0]));
 assert.equal(validAnnotation({...a,planar:{frame:'old-marker-session'}}),false);
});
test('reference transfer requires a matching request and coherent metadata',()=>{
 const chunks=new ReferenceChunks('photo-123');assert.equal(chunks.accept({id:'other-id',index:0,total:1,ar:true,data:'data:image/jpeg;base64,AAAA'}),null);
 assert.equal(chunks.accept({id:'photo-123',index:1,total:2,ar:true,data:'AAAA'}),null);
 assert.throws(()=>chunks.accept({id:'photo-123',index:0,total:1,ar:true,data:'data:image/jpeg;base64,'}),/不一致/);
 const complete=chunks.accept({id:'photo-123',index:0,total:2,ar:true,data:'data:image/jpeg;base64,'});assert.equal(complete.url,'data:image/jpeg;base64,AAAA');assert.equal(complete.ar,true);
});
