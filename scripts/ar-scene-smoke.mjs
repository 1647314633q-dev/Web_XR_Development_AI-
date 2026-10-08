// Local development only: real engine visibility / alpha checks, no XR emulation.
import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
const root=path.resolve('public/workspace/wonderland');
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AR 場景切換驗證</title>
<style>body{font-family:system-ui;color:#123532;margin:20px}canvas{width:100%;height:430px;display:block;background:repeating-conic-gradient(#fff 0% 25%,#d0e1d3 0% 50%) 0 0/40px 40px}button{padding:12px;margin:8px}</style>
<h1>AR 場景遮擋修正 · 引擎驗證</h1><p>這是桌面上的真實 Wonderland 渲染驗證；尚未連接手機鏡頭或啟動原生 AR。棋盤背景表示透明區域。</p>
<button id="hide" disabled>檢查 AR 場景隱藏</button><button id="restore" disabled>檢查返回 3D 預覽</button><p id="result" role="status">正在載入引擎…</p><p id="context"></p><canvas id="canvas"></canvas>
<script type="module">
import {loadRuntime} from '/engine/vendor/index.js';import {ARSceneVisibility} from '/ar-scene.js';
try{
const engine=await loadRuntime('/engine/WonderlandRuntime',{canvas:'canvas',webgl2:true,xrOfferSession:null});await engine.loadMainScene('/engine/VisionLink.bin');
const root=engine.scene.findByName('InspectionRoot')[0],video=root.findByName('SharedVideoPlane',true)[0].getComponent('mesh');video.active=false;
const components=[],stack=[root];while(stack.length){const o=stack.pop();stack.push(...o.children);components.push(...o.getComponents());}
const initial=components.map(c=>c.active);
const visibility=new ARSceneVisibility(engine.scene,root);engine.scene.clearColor=[0,0,0,0];const output=document.getElementById('result');
function pixelCheck(callback){engine.scene.onPostRender.once(()=>queueMicrotask(()=>{const sample=document.createElement('canvas');sample.width=sample.height=1;const ctx=sample.getContext('2d');ctx.drawImage(engine.canvas,1,1,1,1,0,0,1,1);callback(Array.from(ctx.getImageData(0,0,1,1).data));}));}
document.getElementById('hide').onclick=()=>{visibility.enter();pixelCheck(pixel=>{const active=components.filter(c=>c.active).length;output.textContent=(active===0&&pixel[3]===0?'PASS':'FAIL')+'：示範子物件啟用組件 '+active+'/'+components.length+'；畫素 RGBA '+pixel.join(',')+'（alpha 應為 0）。';});};
document.getElementById('restore').onclick=()=>{visibility.leave();pixelCheck(()=>{const same=components.every((c,i)=>c.active===initial[i]);output.textContent=(same&&!video.active?'PASS':'FAIL')+'：原有組件狀態完整還原；原本關閉的鏡頭平面仍關閉。';});};
document.querySelectorAll('button').forEach(b=>b.disabled=false);output.textContent='引擎已載入；目前顯示 3D 預覽。';
}catch(e){document.getElementById('result').textContent='FAIL：'+e.message;}
</script></html>`;
const mime={'.js':'text/javascript','.wasm':'application/wasm','.bin':'application/octet-stream'};
http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'});res.end(html);return;}
 const file=pathname==='/ar-scene.js'?path.resolve('wonderland/ar-scene.js'):path.resolve(root,'.'+pathname.replace(/^\/engine/,''));
 if(pathname!=='/ar-scene.js'&&(!pathname.startsWith('/engine/')||!file.startsWith(root+path.sep))){res.writeHead(404);res.end();return;}
 try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end();}
}).listen(4176,'127.0.0.1',()=>console.log('AR scene visibility test http://127.0.0.1:4176/'));
