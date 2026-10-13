// Desktop browser integration with a synthetic rear camera; not a physical Android AR test.
// Set PLAYWRIGHT_MODULE to the installed playwright index.mjs when it is not in node_modules.
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {staticHeaders} from '../standalone/security.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE):'playwright');
const root=path.resolve('public/workspace'),out=path.resolve('artifacts/automatic-guidance-qa');await mkdir(out,{recursive:true});
const security=staticHeaders(await readFile(path.join(root,'wonderland/index.html'),'utf8'));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{try{let url=new URL(req.url,'http://localhost').pathname;if(url==='/')url='/index.html';const file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep))throw Error();let data=await readFile(file);if(url==='/app.js')data=Buffer.from(data.toString()+'\nwindow.__testState=state;');for(const [k,v] of Object.entries(security))res.setHeader(k,v);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"Not available in static QA"}');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const errors=[];let qaPages=[];
try{
 const context=await browser.newContext();
 await context.addInitScript(()=>{
  const Peer=window.RTCPeerConnection;window.RTCPeerConnection=class extends Peer{constructor(c){super({...c,iceServers:[]});}};
  navigator.mediaDevices.getUserMedia=async()=>{
   const c=document.createElement('canvas');window.__qaSource=c;c.width=480;c.height=640;const ctx=c.getContext('2d');
   window.__qaCamera={rotation:0,visible:true,ticks:0,landscape:false};
   function frame(){const q=window.__qaCamera;q.ticks++;const w=q.landscape?640:480,h=q.landscape?480:640;if(c.width!==w||c.height!==h){c.width=w;c.height=h;}ctx.fillStyle='#e9eee6';ctx.fillRect(0,0,c.width,c.height);ctx.save();ctx.translate(c.width/2,c.height/2);ctx.rotate(q.rotation*Math.PI/2);ctx.fillStyle='#c1a57d';ctx.fillRect(-140,-140,280,280);ctx.fillStyle='#15503a';ctx.font='22px sans-serif';ctx.fillText('LEFT A → RIGHT B',-125,-175);ctx.fillStyle=q.ticks%2?'#27445f':'#577f71';ctx.fillRect(15,195,70,45);ctx.restore();requestAnimationFrame(frame);}frame();return c.captureStream(15);
  };
 });
 const host=await context.newPage(),guest=await context.newPage();qaPages=[host,guest];await host.setViewportSize({width:820,height:1180});await guest.setViewportSize({width:1440,height:1000});
 for(const p of [host,guest]){p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.waitForFunction(()=>!!window.__testState);await p.locator('#aiToggle').uncheck();}
 async function connect(p){await p.locator('#connect').click();await p.locator('#createOffer').evaluate(el=>{let a=el.parentElement;while(a){if(a.tagName==='DETAILS')a.open=true;a=a.parentElement;}});}
 await connect(host);await host.locator('#createOffer').click();await host.waitForFunction(()=>document.getElementById('signalOutput').value.includes('offer'));const offer=await host.locator('#signalOutput').inputValue();
 await connect(guest);await guest.locator('#signalInput').fill(offer);await guest.locator('#applySignal').click();await guest.waitForFunction(()=>document.getElementById('signalOutput').value.includes('answer'));const answer=await guest.locator('#signalOutput').inputValue();
 await host.locator('#signalInput').fill(answer);await host.locator('#applySignal').click();for(const p of [host,guest])await p.waitForFunction(()=>window.__testState.channel?.readyState==='open');
 for(const p of [host,guest])await p.locator('#connectDialog').evaluate(el=>el.close());
 for(const p of [host,guest])assert.equal(await p.locator('#freezeAnnotations').count(),0);
 await host.locator('#camera').click();await guest.locator('#remoteTab').click();await guest.waitForFunction(()=>document.getElementById('remoteVideo').readyState>=2);
 await guest.setViewportSize({width:390,height:844});
 async function draw(kind){await guest.locator('#overlay').scrollIntoViewIfNeeded();const r=await guest.locator('#overlay').boundingBox();await guest.mouse.move(r.x+r.width*.45,r.y+r.height*.42);await guest.mouse.down();if(kind!=='label')await guest.mouse.move(r.x+r.width*.56,r.y+r.height*.6,{steps:5});await guest.mouse.up();}
 await guest.locator('[data-command="這裡檢查"]').click();await draw('arrow');assert(await guest.locator('#frozenFrame').isHidden());assert(await guest.evaluate(()=>!window.__testState.annotations.at(-1).reference));
 await host.evaluate(()=>{window.__engineReady=false;window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===document.querySelector('#engineDialog iframe')?.contentWindow&&e.data?.type==='engine-ready')window.__engineReady=true;});});
 await host.locator('#ar').click();assert.equal(await host.locator('#arChoice').count(),0);assert(await host.locator('#engineDialog').isVisible());
 // Readiness is an event: room initialization immediately replaces the initial loaded status.
 await host.waitForFunction(()=>window.__engineReady,null,{timeout:20000});
 assert.equal(await host.locator('a[href*="marker-print"]').count(),0);
 // Feed synthetic XR camera frames through the real sharing path; no physical tracking claim.
 await host.evaluate(()=>{const s=window.__testState;s.sharedView.setXR(true,false);const camera={epoch:'test-epoch-123',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],projection:[1,0,0,0,0,1,0,0,0,0,-1.02,-1,0,0,-.202,0]};window.__qaXRtimer=setInterval(()=>{const c=window.__qaSource;window.visionLinkXR.frame(c.getContext('2d').getImageData(0,0,c.width,c.height),[],[],camera);},66);});
 await guest.waitForFunction(()=>window.__testState.remoteVideoMode==='ar');
 const ids=[];
 for(const kind of ['arrow','circle','line','label']){
  await guest.locator(`[data-annotation="${kind}"]`).click();await guest.waitForFunction(()=>!document.getElementById('frozenFrame').hidden);
  assert(await guest.locator('#drawingNotice').isVisible());assert(await guest.locator('#anchorAnnotation').isHidden());
  if(kind==='circle')await guest.screenshot({path:path.join(out,'mobile-automatic-drawing.png')});
  await draw(kind);await guest.waitForFunction(()=>document.getElementById('frozenFrame').hidden);
  const a=await guest.evaluate(()=>window.__testState.annotations.at(-1));assert(a.reference);assert.equal(a.kind,kind);ids.push(a.reference);
  await host.waitForFunction(id=>window.__testState.pendingAnchor===id,a.id);
  const match=await host.evaluate(id=>{const s=window.__testState,a=s.annotations.find(a=>a.id===id),r=s.getReference(a.reference);return {points:a.points,ar:r.ar,epoch:r.camera.epoch};},a.id);
  assert.deepEqual(match.points,a.points);assert.equal(match.ar,true);assert.equal(match.epoch,'test-epoch-123');
 }
 assert.equal(new Set(ids).size,4);
 // Fast tool changes cancel the old request and retain the latest tool only.
 await guest.evaluate(()=>{document.querySelector('[data-annotation="arrow"]').click();document.querySelector('[data-annotation="circle"]').click();});
 await guest.waitForFunction(()=>!document.getElementById('frozenFrame').hidden);assert.equal(await guest.evaluate(()=>window.__testState.annotationTool),'circle');
 await guest.locator('#cancelDrawing').click();assert(await guest.locator('#frozenFrame').isHidden());
 await guest.locator('#pin').click();assert.equal(await guest.evaluate(()=>window.__testState.pinEnabled),false);await guest.locator('#pin').click();assert.equal(await guest.evaluate(()=>window.__testState.pinEnabled),true);
 // A delayed image must not reopen the drawing view after the user changes tabs.
 await guest.evaluate(()=>{const s=window.__testState,request=s.requestReference;s.requestReference=()=>request().then(photo=>new Promise(resolve=>{window.__releaseReference=()=>resolve(photo);}));});
 await guest.locator('[data-annotation="arrow"]').click();await guest.waitForFunction(()=>!!window.__releaseReference);await guest.locator('#localTab').click();await guest.evaluate(()=>window.__releaseReference());
 assert(await guest.locator('#frozenFrame').isHidden());assert.equal(await guest.evaluate(()=>window.__testState.annotationTool),null);
 await guest.locator('#remoteTab').click();await guest.screenshot({path:path.join(out,'mobile-returned-live.png')});
 const before=await host.evaluate(()=>window.__qaCamera.ticks);await guest.waitForFunction(()=>document.getElementById('remoteVideo').getVideoPlaybackQuality().totalVideoFrames>30);assert((await host.evaluate(()=>window.__qaCamera.ticks))>=before);
 await host.evaluate(()=>clearInterval(window.__qaXRtimer));await host.locator('#engineDialog .icon-button').click();
 assert.deepEqual(errors,[]);const result={result:'PASS',scope:'Desktop Edge, real WebRTC, synthetic rear camera/XR metadata, mobile 390px viewport; physical Android tracking not tested',manualCaptureButtons:0,automaticARCommands:4,uniqueFrameReferences:4,cancelAndLateFrameGuard:true,nativeARDirectEntry:true,errors};await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){const diagnostics=await Promise.all(qaPages.map(p=>p.evaluate(()=>({role:window.__testState?.role,mode:window.__testState?.remoteVideoMode,xr:window.__testState?.sharedView?.xrActive,tool:window.__testState?.annotationTool,status:document.getElementById('annotationStatus')?.textContent}))));console.log(JSON.stringify({errors,diagnostics}));throw error;}finally{await browser.close();server.close();}
