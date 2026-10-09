// Local regression harness: real WebGL/Wonderland/WebRTC, synthetic camera pixels.
// No device AR or permission support is emulated by the production application.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
const source=`
import {loadRuntime,Component} from './wonderland/node_modules/@wonderlandengine/api/dist/index.js';
import {NativeAnnotations} from './wonderland/annotations.js';
import {XRCameraCapture} from './wonderland/xr-camera.js';
import {SharedView} from './public/workspace/shared-view.js';
const status=document.getElementById('status'),counts=document.getElementById('counts');
try {
 const engine=await loadRuntime('/wonderland/WonderlandRuntime',{canvas:'canvas',xrOfferSession:null,webgl2:true});
 await engine.loadMainScene('/wonderland/VisionLink.bin');
 const plane=engine.scene.findByName('SharedVideoPlane',true)[0].getComponent('mesh');plane.active=false;
 const annotations=new NativeAnnotations(engine,plane.material);
 const share=new SharedView({source:()=>null,items:()=>[],pins:()=>[],onChange(){}});
 clearInterval(share.timer);const track=share.getTrack(null);share.setXR(true,false);
 const sender=new RTCPeerConnection({iceServers:[]}),receiver=new RTCPeerConnection({iceServers:[]});
 const remote=document.getElementById('remote');let decoded=0,afterCommand=0;
 receiver.ontrack=({track})=>{remote.srcObject=new MediaStream([track]);remote.play().catch(()=>{});};
 const decodedFrame=()=>{decoded++;if(commandCount)afterCommand++;remote.requestVideoFrameCallback(decodedFrame);};remote.requestVideoFrameCallback(decodedFrame);
 const candidatesA=[],candidatesB=[];
 sender.onicecandidate=({candidate})=>{if(candidate)(receiver.remoteDescription?receiver.addIceCandidate(candidate):Promise.resolve(candidatesA.push(candidate))).catch(console.error);};
 receiver.onicecandidate=({candidate})=>{if(candidate)(sender.remoteDescription?sender.addIceCandidate(candidate):Promise.resolve(candidatesB.push(candidate))).catch(console.error);};
 sender.addTrack(track,new MediaStream([track]));await sender.setLocalDescription(await sender.createOffer());await receiver.setRemoteDescription(sender.localDescription);for(const c of candidatesA)await receiver.addIceCandidate(c);await receiver.setLocalDescription(await receiver.createAnswer());await sender.setRemoteDescription(receiver.localDescription);for(const c of candidatesB)await sender.addIceCandidate(c);
 const canvas=document.getElementById('canvas'),gl=canvas.getContext('webgl2');
 const oldActive=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0);const oldTexture=gl.getParameter(gl.TEXTURE_BINDING_2D);const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.bindTexture(gl.TEXTURE_2D,oldTexture);gl.activeTexture(oldActive);
 const capture=new XRCameraCapture(new EventTarget(),canvas,{getCameraImage:()=>texture});
 let captured=0,commandCount=0,lastCommand=0,done=false,errors=0;const started=performance.now();
 const pixels=new Uint8Array(320*180*4),labels=['這裡檢查','這裡拆','按這個按鈕'];
 const state=()=>JSON.stringify([gl.getParameter(gl.ACTIVE_TEXTURE),...gl.getParameter(gl.VIEWPORT),gl.getParameter(gl.PACK_ROW_LENGTH),gl.getParameter(gl.PACK_SKIP_PIXELS),gl.getParameter(gl.PACK_SKIP_ROWS)]);
 const screen=()=>[{kind:'arrow',points:[[.18,.25],[.72,.7]],text:labels[(commandCount-1)%3]||'連續共享測試',source:'manual'}];
 class Drive extends Component {static TypeName='sharing-regression';update(){
  if(done)return;const elapsed=performance.now()-started;
  try{
   if(elapsed-lastCommand>2000&&commandCount<12){lastCommand=elapsed;commandCount++;const a={id:'command-'+commandCount,revision:1,kind:'label',text:labels[(commandCount-1)%3],source:'manual',points:[[.5,.5]],spatial:{points:[[((commandCount-1)%3-1)*.5,2-Math.floor((commandCount-1)/3)*.25,0]],normal:[0,0,1]}};annotations.set(a,null);annotations.set({...a},null);}
   const view={camera:{width:320,height:180}};if(capture.ready(view)){
    for(let i=0;i<pixels.length;i+=4){pixels[i]=captured%2?35:185;pixels[i+1]=85;pixels[i+2]=captured%2?185:35;pixels[i+3]=255;}
    const active=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0);const previous=gl.getParameter(gl.TEXTURE_BINDING_2D),unpack=gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING);gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,null);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,320,180,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);gl.bindTexture(gl.TEXTURE_2D,previous);gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,unpack);gl.activeTexture(active);
    const before=state();capture.capture({},view,[],data=>{share.receiveXRImage(data,[],screen());captured++;},{imageData:true});if(state()!==before)throw new Error('WebGL state changed');
   }
   counts.textContent='已共享 '+captured+' 幀 · 遠端已解碼 '+decoded+' 幀 · 已加入 '+commandCount+' 個指令 · 指令後收到 '+afterCommand+' 幀';
   if(elapsed>=30000){done=true;status.textContent=captured>100&&decoded>80&&afterCommand>60&&commandCount===12&&track===share.getTrack(null)&&errors===0?'PASS：普通畫布計時器停用後，持續共享與 12 次新增指令均通過':'FAIL：共享幀數或指令處理未達標';document.body.dataset.result=status.textContent.startsWith('PASS')?'pass':'fail';}
  }catch(error){errors++;done=true;status.textContent='FAIL：'+error.message;document.body.dataset.result='fail';console.error(error);}
 }}
 engine.registerComponent(Drive);engine.scene.addObject().addComponent(Drive);status.textContent='正在執行 30 秒連續共享測試…';
 window.addEventListener('pagehide',()=>{share.destroy();capture.destroy();sender.close();receiver.close();});
}catch(error){status.textContent='FAIL：'+error.message;document.body.dataset.result='fail';console.error(error);}
`;
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'js'},bundle:true,format:'esm',write:false});
const html=`<!doctype html><meta charset="utf-8"><title>AR 共享回歸測試</title><style>body{font:16px system-ui;background:#eff5f1;color:#173e37;padding:22px;margin:0}h1{font-size:23px}#status{font-weight:bold;color:#167454}section{display:grid;grid-template-columns:1fr 1fr;gap:16px}canvas,video{width:100%;height:340px;background:#163c3e;border-radius:12px}p{line-height:1.6}</style><h1>AR 共享與指令 · 瀏覽器回歸測試</h1><p>真實 Wonderland / WebGL / WebRTC；使用合成相機色塊，非 Android 實機 AR。普通共享畫布計時器已停用。</p><p id="status">載入中…</p><p id="counts">等待影像</p><section><div><h2>原生 3D 指令</h2><canvas id="canvas" width="640" height="360"></canvas></div><div><h2>遠端收到的共享串流</h2><video id="remote" autoplay muted playsinline></video></div></section><script type="module" src="/test.js"></script>`;
const root=path.resolve('public/workspace/wonderland');
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost').pathname;if(url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}else if(url==='/test.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(bundle.outputFiles[0].contents);}else if(url.startsWith('/wonderland/')){const file=path.resolve(root,decodeURIComponent(url.slice('/wonderland/'.length)));if(!file.startsWith(root+path.sep))throw new Error('invalid path');const type=file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream';const data=await readFile(file);res.writeHead(200,{'Content-Type':type});res.end(data);}else{res.writeHead(404);res.end();}}catch{res.writeHead(404);res.end();}}).listen(4175,'127.0.0.1',()=>console.log('XR sharing regression http://127.0.0.1:4175/'));
