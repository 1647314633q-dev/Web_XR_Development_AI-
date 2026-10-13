// Desktop browser integration with a synthetic rear camera; not a physical iPad test.
// Set PLAYWRIGHT_MODULE to the installed playwright index.mjs when it is not in node_modules.
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {staticHeaders} from '../standalone/security.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE):'playwright');
const root=path.resolve('public/workspace'),out=path.resolve('artifacts/marker-ar-qa');await mkdir(out,{recursive:true});
const security=staticHeaders(await readFile(path.join(root,'wonderland/index.html'),'utf8'));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{try{let url=new URL(req.url,'http://localhost').pathname;if(url==='/')url='/index.html';const file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep))throw Error();let data=await readFile(file);if(url==='/app.js')data=Buffer.from(data.toString()+'\nwindow.__testState=state;');for(const [k,v] of Object.entries(security))res.setHeader(k,v);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"Not available in static QA"}');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const errors=[];
try{
 const context=await browser.newContext();
 await context.addInitScript(()=>{
  const Peer=window.RTCPeerConnection;window.RTCPeerConnection=class extends Peer{constructor(c){super({...c,iceServers:[]});}};
  navigator.mediaDevices.getUserMedia=async()=>{
   const c=document.createElement('canvas');c.width=480;c.height=640;const ctx=c.getContext('2d');const marker=new Image();marker.src='/marker.svg';await marker.decode();
   window.__qaCamera={rotation:0,visible:true,ticks:0,landscape:false};
   function frame(){const q=window.__qaCamera;q.ticks++;const w=q.landscape?640:480,h=q.landscape?480:640;if(c.width!==w||c.height!==h){c.width=w;c.height=h;}ctx.fillStyle='#e9eee6';ctx.fillRect(0,0,c.width,c.height);ctx.save();ctx.translate(c.width/2,c.height/2);ctx.rotate(q.rotation*Math.PI/2);if(q.visible)ctx.drawImage(marker,-140,-140,280,280);ctx.fillStyle='#15503a';ctx.font='22px sans-serif';ctx.fillText('LEFT A → RIGHT B',-125,-175);ctx.fillStyle=q.ticks%2?'#27445f':'#577f71';ctx.fillRect(15,195,70,45);ctx.restore();requestAnimationFrame(frame);}frame();return c.captureStream(15);
  };
 });
 const host=await context.newPage(),guest=await context.newPage();await host.setViewportSize({width:820,height:1180});await guest.setViewportSize({width:1440,height:1000});
 for(const p of [host,guest]){p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.waitForFunction(()=>!!window.__testState);await p.locator('#aiToggle').uncheck();}
 async function connect(p){await p.locator('#connect').click();await p.locator('#createOffer').evaluate(el=>{let a=el.parentElement;while(a){if(a.tagName==='DETAILS')a.open=true;a=a.parentElement;}});}
 await connect(host);await host.locator('#createOffer').click();await host.waitForFunction(()=>document.getElementById('signalOutput').value.includes('offer'));const offer=await host.locator('#signalOutput').inputValue();
 await connect(guest);await guest.locator('#signalInput').fill(offer);await guest.locator('#applySignal').click();await guest.waitForFunction(()=>document.getElementById('signalOutput').value.includes('answer'));const answer=await guest.locator('#signalOutput').inputValue();
 await host.locator('#signalInput').fill(answer);await host.locator('#applySignal').click();for(const p of [host,guest])await p.waitForFunction(()=>window.__testState.channel?.readyState==='open');
 for(const p of [host,guest])await p.locator('#connectDialog').evaluate(el=>el.close());
 await host.locator('#camera').click();await host.locator('#ar').click();await host.locator('[data-marker]').click();await host.waitForFunction(()=>document.querySelector('[data-status]')?.textContent.includes('定位圖已鎖定'));
 assert(await host.locator('[data-confirm]').isDisabled());await guest.locator('#remoteTab').click();await guest.waitForFunction(()=>document.getElementById('remoteVideo').readyState>=2);
 const initialFrames=await guest.evaluate(()=>document.getElementById('remoteVideo').getVideoPlaybackQuality().totalVideoFrames);
 for(const [index,kind] of ['arrow','circle','label'].entries()){
  if(index)await guest.locator('#freezeAnnotations').click();
  await guest.locator('#freezeAnnotations').click();await guest.waitForFunction(()=>!document.getElementById('frozenFrame').hidden);
  await guest.locator(`[data-annotation="${kind}"]`).click();await guest.locator('#annotationText').fill(['這裡拆','這裡檢查','按這個按鈕'][index]);
  const box=await guest.locator('#overlay').boundingBox();await guest.mouse.move(box.x+box.width*.45,box.y+box.height*.44);await guest.mouse.down();if(kind!=='label')await guest.mouse.move(box.x+box.width*.56,box.y+box.height*.57,{steps:8});await guest.mouse.up();
  await guest.locator('#anchorAnnotation').click();await host.waitForFunction(()=>!document.querySelector('[data-confirm]').disabled);await host.locator('[data-confirm]').click();
  await guest.waitForFunction(n=>window.__testState.annotations.filter(a=>a.planar).length===n,index+1);
 }
 await host.screenshot({path:path.join(out,'ipad-portrait.png')});await guest.screenshot({path:path.join(out,'remote-reference.png')});
 for(let rotation=1;rotation<=3;rotation++){await host.evaluate(r=>window.__qaCamera.rotation=r,rotation);await host.waitForFunction(r=>{try{const p=window.__testState.markerAR.capture().marker.corners[0];return (p[0]>.5)===(r===1||r===2)&&(p[1]>.5)===(r===2||r===3);}catch{return false;}},rotation);}
 await host.evaluate(()=>window.__qaCamera.visible=false);await host.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('未鎖定'));
 await guest.locator('#freezeAnnotations').click();await guest.locator('#freezeAnnotations').click();await guest.waitForFunction(()=>document.getElementById('annotationStatus').textContent.includes('追蹤穩定'));assert(await guest.locator('#frozenFrame').isHidden());
 await host.evaluate(()=>{window.__qaCamera.visible=true;window.__qaCamera.rotation=0;});await host.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('定位圖已鎖定'));
 await host.setViewportSize({width:1180,height:820});await host.evaluate(()=>window.__qaCamera.landscape=true);await host.waitForFunction(()=>{try{return window.__testState.markerAR.capture().source.width===640;}catch{return false;}});await host.screenshot({path:path.join(out,'ipad-landscape.png')});
 await guest.waitForFunction(n=>document.getElementById('remoteVideo').getVideoPlaybackQuality().totalVideoFrames>=n,initialFrames+250,{timeout:45000});
 const frames=await guest.evaluate(()=>document.getElementById('remoteVideo').getVideoPlaybackQuality().totalVideoFrames);assert(frames-initialFrames>15);
 await host.locator('[data-exit]').click();assert(await host.locator('.marker-ar').count()===0);assert(await host.locator('#camera').isEnabled());assert.equal(await host.evaluate(()=>window.__testState.stream.getVideoTracks()[0].readyState),'live');
 assert.deepEqual(errors,[]);const result={result:'PASS',scope:'Desktop Edge, synthetic rear camera; real detector, two RTCPeerConnections, actual workspace UI',commands:3,framesReceived:frames-initialFrames,rotationCases:4,trackingLossAndRecovery:true,errors};await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();server.close();}
