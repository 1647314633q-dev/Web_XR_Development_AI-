import {MarkerTracker} from './marker-tracker.js';
import {MARKER_ID,anchorToMarker} from './marker-geometry.js';
import {paintMarkerInstructions} from './marker-render.js';

// Uses the existing getUserMedia stream, never a competing camera or WebXR session.
export async function openMarkerAR({state,$,cameraToggle,stopAI,startAI,toast}){
 if(state.markerAR)return;
 if(state.role!=='host'){toast('定位圖 AR 由拍攝現場的發起方開啟；你可在夥伴視角發指令。');return;}
 const video=$('localVideo');
 if(state.stream?.getVideoTracks().length&&state.facing!=='environment')await cameraToggle();
 state.facing='environment';if(!state.stream?.getVideoTracks().length)await cameraToggle();
 if(!state.stream?.getVideoTracks().some(t=>t.readyState==='live')||video.readyState<2){toast('請允許使用後置鏡頭，鏡頭開啟後再試。');return;}
 if(state.stream.getVideoTracks()[0].getSettings().facingMode==='user'){toast('請切换到後置鏡頭後再開啟定位圖 AR。');return;}
 stopAI();
 const dialog=document.createElement('dialog');dialog.className='marker-ar';dialog.setAttribute('aria-label','定位圖 AR');
 dialog.innerHTML='<canvas class="marker-view" aria-label="定位圖 AR 現場畫面"></canvas><div class="marker-top"><span class="marker-badge">定位圖 AR</span><button type="button" data-exit>離開 AR</button></div><div class="marker-bottom"><p data-status role="status">請對準 VisionLink 定位圖，保持整張圖可見。</p><div class="marker-actions"><button type="button" data-confirm disabled>等待夥伴指令</button><button type="button" data-tools aria-expanded="false">說明</button></div><div data-help hidden><p>把定位圖固定在目標旁，兩者須在同一平面。整張黑框與白邊保持可見，距離目標不超過兩個圖寬。</p><p>夥伴擷取參考圖 → 畫指令 → 固定到實物 → 你確認綠色預覽。定位圖或設備移動後，離開 AR 並重新取圖。</p><a href="marker-print.html" target="_blank" rel="noopener">開啟／列印定位圖</a></div></div>';
 document.body.append(dialog);dialog.showModal();
 const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d');
 const raw=document.createElement('canvas'),rawCtx=raw.getContext('2d',{willReadFrequently:true});
 const status=dialog.querySelector('[data-status]'),confirm=dialog.querySelector('[data-confirm]'),tracker=new MarkerTracker();
 const epoch=crypto.randomUUID();let corners=null,lastFrame=0,lastVideo=-1,raf=0,pending=null,closed=false;
 const disabledIds=['camera','flipCamera','uploadImage'];const previousDisabled=disabledIds.map(id=>$(id).disabled);disabledIds.forEach(id=>$(id).disabled=true);
 const api={epoch,canvas,raw,active:true,
  capture(){if(!corners||performance.now()-lastFrame>700||document.hidden)throw new Error('請保持定位圖清晰可見，追蹤穩定後再擷取參考圖');return {source:raw,marker:{epoch,id:MARKER_ID,corners:corners.map(p=>[...p])}};},
  request(a,photo){const planar=anchorToMarker(a,photo,epoch);pending={annotation:a,planar,expires:photo.at+120000};update();},
  remove(id){if(pending?.annotation.id===id){pending=null;update();}},
  close,
 };
 state.markerAR=api;
 function update(){
  if(pending&&(Date.now()>pending.expires||!state.annotations.some(a=>a.id===pending.annotation.id&&a.revision===pending.annotation.revision))){pending=null;state.pendingAnchor=null;}
  const tracked=!!corners&&!document.hidden&&performance.now()-lastFrame<=700;
  confirm.disabled=!pending||!tracked||state.role!=='host';
  const text=pending?.annotation.text||'這個指令';confirm.textContent=pending?'確認固定：'+(text.length>24?text.slice(0,24)+'…':text):'等待夥伴指令';
  status.textContent=!tracked?'定位圖未鎖定；請對準整張黑框，追蹤恢復前暫停顯示標記。':pending?'綠色是待確認指令；確認落在正確目標表面，再按下方按鈕。':'定位圖已鎖定。夥伴可擷取參考圖並畫指令。';
 }
 function paint(){
  ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(raw,0,0);
  if(corners&&performance.now()-lastFrame<=700&&!document.hidden){
   const latest=state.annotations.filter(a=>a.target===state.visualOwnerId&&a.planar?.frame===epoch).slice(-1);
   paintMarkerInstructions(ctx,latest,corners,epoch,canvas.width,canvas.height);
   if(pending)paintMarkerInstructions(ctx,[{...pending.annotation,planar:pending.planar}],corners,epoch,canvas.width,canvas.height,true);
  }else{ctx.fillStyle='#153e37e8';ctx.fillRect(0,0,canvas.width,40);ctx.font='16px sans-serif';ctx.fillStyle='#fff';ctx.fillText('定位圖追蹤暫停 · 請重新對準',12,26);}
 }
 function tick(now){
  if(closed)return;raf=requestAnimationFrame(tick);
  if(document.hidden||video.readyState<2||video.currentTime===lastVideo){if(now-lastFrame>700){corners=null;tracker.reset();update();if(raw.width)paint();}return;}
  if(now-lastFrame<85)return;
  const scale=Math.min(1,640/video.videoWidth,640/video.videoHeight),w=Math.round(video.videoWidth*scale),h=Math.round(video.videoHeight*scale);
  if(!w||!h)return;
  if(raw.width!==w||raw.height!==h){raw.width=canvas.width=w;raw.height=canvas.height=h;corners=null;tracker.reset();}
  rawCtx.drawImage(video,0,0,w,h);lastVideo=video.currentTime;lastFrame=now;
  try{corners=tracker.detect(rawCtx.getImageData(0,0,w,h));}catch{corners=null;tracker.reset();}
  update();paint();state.sharedView.draw();
 }
 confirm.onclick=()=>{if(confirm.disabled||!pending)return;try{api.capture();const {annotation,planar}=pending;const accepted=state.commitMarkerAnnotation?.({...annotation,revision:annotation.revision+1,planar});if(!accepted)throw new Error('指令已失效，請讓夥伴重新傳送');pending=null;update();paint();navigator.vibrate?.(40);}catch(error){toast(error.message);}};
 dialog.querySelector('[data-exit]').onclick=close;
 const tools=dialog.querySelector('[data-tools]'),help=dialog.querySelector('[data-help]');tools.onclick=()=>{help.hidden=!help.hidden;tools.setAttribute('aria-expanded',String(!help.hidden));};
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 function visibility(){corners=null;tracker.reset();update();if(raw.width)paint();state.sharedView.draw();}
 document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',close,{once:true});
 function close(){if(closed)return;closed=true;api.active=false;cancelAnimationFrame(raf);pending=null;state.pendingAnchor=null;state.markerAR=null;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',close);disabledIds.forEach((id,i)=>$(id).disabled=previousDisabled[i]);dialog.close();dialog.remove();state.refreshVideo();state.reportVideo?.('camera');if(state.ai)startAI();}
 raf=requestAnimationFrame(tick);await state.refreshVideo();state.reportVideo?.('ar');
}
