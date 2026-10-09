import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canDraw,mayReceiveAnnotation} from '../public/workspace/annotation-permissions.js';
test('only connected invited guide can draw on the host view',()=>{
 for(const role of ['host','guest'])for(const live of [true,false])for(const view of ['local','remote'])assert.equal(canDraw(role,live,view),role==='guest'&&live&&view==='remote');
});
test('host can only return a spatial confirmation of an existing guest instruction',()=>{
 const a={id:'a',owner:'guest-id',target:'host-id',kind:'arrow',text:'這裡拆',source:'manual',points:[[.1,.2],[.4,.5]],revision:1};
 assert.equal(mayReceiveAnnotation('host','host-id','guest-id',a),true);
 assert.equal(mayReceiveAnnotation('host','host-id','guest-id',{...a,owner:'host-id'}),false);
 const fixed={...a,revision:2,spatial:{frame:'room'}};
 assert.equal(mayReceiveAnnotation('guest','guest-id','host-id',fixed,a),true);
 assert.equal(mayReceiveAnnotation('guest','guest-id','host-id',fixed,null),false);
 for(const changed of [{text:'替換指令'},{points:[[.2,.3],[.4,.5]]},{kind:'line'},{revision:1},{spatial:null}])assert.equal(mayReceiveAnnotation('guest','guest-id','host-id',{...fixed,...changed},a),false);
});
