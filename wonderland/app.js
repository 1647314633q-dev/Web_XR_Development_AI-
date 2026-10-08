import {loadRuntime,Component} from '@wonderlandengine/api';
import {toShared,fromShared,directionToShared,projectPoint} from '../public/workspace/spatial.js';
import {validSpatialPin,validSpatialPose} from '../public/workspace/collaboration-protocol.js';
import {XRCameraCapture} from './xr-camera.js';
import {ARSceneVisibility} from './ar-scene.js';
import {ReferenceCalibration,referenceProgress,referenceNames} from './reference-calibration.js';
import {validAnnotation,placeOnSurface} from '../public/workspace/annotation-protocol.js';
import {NativeAnnotations} from './annotations.js';
/* wle:auto-constants:start */
const Constants = {
    ProjectName: 'VisionLink',
    RuntimeBaseName: 'WonderlandRuntime',
    WebXRRequiredFeatures: ['local',],
    WebXROptionalFeatures: ['local','hand-tracking','hit-test',],
};
const RuntimeOptions = {
    webgl2: true,
    webgpu: false,
    physx: false,
    loader: false,
    xrFramebufferScaleFactor: 1,
    loadUncompressedImagesAsBitmap: false,
    xrOfferSession: {
        mode: 'auto',
        features: Constants.WebXRRequiredFeatures,
        optionalFeatures: Constants.WebXROptionalFeatures,
    },
    canvas: 'canvas',
};
/* wle:auto-constants:end */
const status=document.getElementById('status');
try{
 const engine=await loadRuntime(Constants.RuntimeBaseName,{...RuntimeOptions,canvas:'canvas',xrOfferSession:null});
 await engine.loadMainScene(`${Constants.ProjectName}.bin`);
 const world=engine.scene.findByName('InspectionRoot')[0];
 const preview=new ARSceneVisibility(engine.scene,world);
 engine.scene.clearColor=[0,0,0,0];
 const viewMode=document.getElementById('view-mode'),capability=document.getElementById('capability'),arButton=document.getElementById('ar-button');
 arButton.disabled=false;
 capability.textContent=engine.arSupported?'此裝置支援 AR；按「進入 AR」並允許瀏覽器啟動，即可查看真實環境。':'此裝置／瀏覽器不支援原生 AR，目前為 3D 預覽。請改用相容的 Android 手機 Chrome。';
 const player=engine.scene.findByName('Player')[0];
 const template=engine.scene.findByName('AttentionMarker',true)[0];
 const videoPlane=engine.scene.findByName('SharedVideoPlane',true)[0];
 const videoMesh=videoPlane.getComponent('mesh');
 const instructions=new NativeAnnotations(engine,videoMesh.material);
 videoMesh.active=false;
 let videoTexture=null,videoElement=null;
 function updateVideo(){if(videoTexture&&videoElement?.readyState>=2)videoTexture.update();requestAnimationFrame(updateVideo);}
 requestAnimationFrame(updateVideo);
 document.getElementById('video-view').onclick=()=>{
  if(videoMesh.active){videoMesh.active=false;videoTexture?.destroy();videoTexture=null;videoElement=null;status.textContent='已返回倉庫示範場景。';return;}
  try{
   const remote=parent.document.getElementById('remoteVideo');const local=parent.document.getElementById('localVideo');
   videoElement=remote?.readyState>=2?remote:local?.readyState>=2?local:null;
   if(!videoElement){status.textContent='請先在協作頁開啟鏡頭，或連接夥伴的視角。';return;}
   videoTexture=engine.textures.create(videoElement);videoMesh.material.setFlatTexture(videoTexture);videoMesh.active=true;world.setRotationLocal([0,0,0,1]);yaw=0;
   status.textContent='即時影像已貼到 3D 平面；這是 2D 影像，並非 3D 重建。';
  }catch(e){status.textContent='無法載入影像平面：'+e.message;}
 };
 const markers=new Map();
 let yaw=0,lastX=null,miniature=false,hitSource=null,hitPose=null,reticle=null;
 let frameId=crypto.randomUUID(),calibration=null,reference=null,viewerPose=null,capture=null,poseLast=0,peerLast=0,peerMarker=null,captureReported=false;
 const referenceSelection=new ReferenceCalibration(),referenceMarkers=[];
 const confirmPoint=document.getElementById('confirm-point'),trackingStatus=document.getElementById('tracking-status');
 let referenceUIKey='';
 function updateReferenceUI(){
  const active=document.body.classList.contains('xr-active');
  const key=[referenceSelection.mode,referenceSelection.points.length,active,!!hitPose,!!calibration].join('|');if(key===referenceUIKey)return;referenceUIKey=key;
  const ui=referenceProgress(referenceSelection,{active,hasHit:!!hitPose});
  document.querySelectorAll('[data-reference]').forEach((el,i)=>{if(el.textContent!==ui.labels[i])el.textContent=ui.labels[i];el.classList.toggle('accepted',i<referenceSelection.points.length);});
  const summary=document.getElementById('reference-summary');if(summary.textContent!==ui.summary)summary.textContent=ui.summary;
  document.getElementById('reference-progress').hidden=referenceSelection.mode==='simple';
  if(confirmPoint.textContent!==ui.button)confirmPoint.textContent=ui.button;
  confirmPoint.disabled=ui.disabled;document.getElementById('add-pin').disabled=!active||!calibration||!hitPose;
  document.getElementById('calibrate').textContent='重設工作區';
  if(trackingStatus.textContent!==ui.tracking)trackingStatus.textContent=ui.tracking;
 }
 const spatialPins=new Map(),physicalMarkers=new Map();
 const post=(data)=>parent.postMessage(data,location.origin);
 const arTool=document.getElementById('ar-tool'),arText=document.getElementById('ar-text'),arMark=document.getElementById('ar-mark'),arFinish=document.getElementById('ar-finish'),arPending=document.getElementById('ar-pending');
 const engineOwner=crypto.randomUUID();let pendingInstruction=null,stroke=[],strokeNormal=null,demoInstructions=false;
 function updateInstructionUI(){arMark.disabled=!engine.xr||!calibration||!hitPose;arMark.textContent=arTool.value==='label'?'放置文字標籤':arTool.value==='line'?`記錄線上的點 (${stroke.length})`:stroke.length?'確認終點':'確認起點';arFinish.hidden=arTool.value!=='line';arFinish.disabled=stroke.length<2;arPending.hidden=!pendingInstruction;arPending.disabled=!engine.xr||!calibration||!hitPose;if(pendingInstruction)arPending.textContent='固定這個指令：'+(pendingInstruction.text||'檢查這裡');}
 function currentSurface(){if(!calibration||!hitPose||!viewerPose)throw new Error('先設定工作區，再對準實物表面上的黃色定位球。');const p=hitPose.transform.position,m=hitPose.transform.matrix,v=viewerPose.transform.matrix;return {origin:toShared(calibration,[p.x,p.y,p.z]),normal:directionToShared(calibration,[m[4],m[5],m[6]]),right:directionToShared(calibration,[v[0],v[1],v[2]])};}
 function saveInstruction(a,local=false){if(!validAnnotation(a)||a.spatial?.frame!==frameId)return;instructions.set(a,calibration);post({type:local?'annotation-local':'annotation',annotation:a});navigator.vibrate?.(40);announce('✓ 已固定「'+(a.text||'檢查這裡')+'」。移動手機換角度查看；設備移動後須重新放置。');}
 function placePending(){try{if(!pendingInstruction)return;const surface=currentSurface(),a={...pendingInstruction,revision:pendingInstruction.revision+1,spatial:{frame:frameId,...placeOnSurface(pendingInstruction,surface.origin,surface.normal,surface.right)}};saveInstruction(a);pendingInstruction=null;updateInstructionUI();}catch(e){announce(e.message);}}
 function finishLocal(){if(!stroke.length)return;const kind=arTool.value,points=stroke.map((_,i)=>[stroke.length>1?i/(stroke.length-1):.5,.5]),a={id:crypto.randomUUID(),owner:engineOwner,target:engineOwner,revision:1,kind,text:arText.value.slice(0,120),source:'manual',points,spatial:{frame:frameId,points:stroke,normal:strokeNormal}};saveInstruction(a,true);stroke=[];strokeNormal=null;updateInstructionUI();}
 function placeLocal(){try{const s=currentSurface();if(stroke.length>=64)throw new Error('畫線最多 64 個點，請按「完成畫線」。');stroke.push(s.origin);strokeNormal ||= s.normal;if(arTool.value==='label'||arTool.value!=='line'&&stroke.length===2)finishLocal();else announce(arTool.value==='line'?`✓ 已記錄 ${stroke.length} 點；沿實物繼續記錄，再按「完成畫線」。`:'✓ 起點已記錄；對準終點再確認。');updateInstructionUI();}catch(e){announce(e.message);}}
 arMark.onclick=placeLocal;arFinish.onclick=finishLocal;arPending.onclick=placePending;arTool.onchange=()=>{stroke=[];strokeNormal=null;updateInstructionUI();};
 document.getElementById('annotation-demo').onclick=()=>{instructions.clear();demoInstructions=true;const fixtures=[{kind:'label',text:'Motor A · A102（示範）',p:[[.0,1.65,.0]],n:[0,0,1]},{kind:'arrow',text:'這裡檢查（示範）',p:[[-.65,2.1,.02],[-.2,1.5,.02]],n:[0,0,1]},{kind:'circle',text:'疑似損傷 · 需覆核（示範）',p:[[.35,1.4,.05],[.75,1.65,.05]],n:[0,0,1],source:'ai'}];for(const f of fixtures){const a={id:crypto.randomUUID(),owner:engineOwner,target:engineOwner,revision:1,kind:f.kind,text:f.text,source:f.source||'manual',points:f.p.map(()=>[.5,.5]),spatial:{frame:frameId,points:f.p,normal:f.n}};instructions.set(a,null);}announce('已顯示 3D 指令示範：箭頭、圈選及文字。進入 AR 後對準實物重新放置。');};
 function announce(text){status.textContent=text;if(engine.xr&&!engine.xr.session.domOverlayState&&'speechSynthesis' in window){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='zh-HK';speechSynthesis.speak(u);}}
 function invalidate(text='空間追蹤已重設；請重新設定工作區。'){calibration=null;stroke=[];strokeNormal=null;instructions.update(null,null,!!engine.xr);referenceSelection.reset();for(const obj of referenceMarkers)obj.destroy();referenceMarkers.length=0;for(const obj of physicalMarkers.values())obj.active=!engine.xr;peerMarker&&(peerMarker.active=false);post({type:'calibration-status',calibrated:false,method:referenceSelection.mode});updateReferenceUI();updateInstructionUI();announce(text);}
 function renderSpatial(pin){let obj=physicalMarkers.get(pin.id);if(!obj){obj=template.clone(null);obj.name='MetreInspectionPin';obj.setScalingLocal([.035,.035,.035]);physicalMarkers.set(pin.id,obj);}obj.setPositionWorld(calibration?fromShared(calibration,pin.position):pin.position);obj.active=!engine.xr||!!calibration;}
 function calibrationStep(prefix=''){const index=referenceSelection.points.length,hints=['桌面上的起點','原點右方約 50 公分','原點前方約 50 公分，與右方約成直角'];announce(`${prefix}設定 ${index+1}/3：對準${referenceNames[index]}（${hints[index]}），看到黃色球後按「確認${referenceNames[index]}」。`);}
 function confirmReference(){
  if(!engine.xr){announce('請先進入 AR。');return;}
  if(calibration){announce('工作區已設定，對準檢查位置後按「＋新增空間標記」。');return;}
  if(!hitPose){announce('未接收到平面位置；請緩慢移動手機，看到黃色球後再確認。');return;}
  const p=hitPose.transform.position,point=[p.x,p.y,p.z],m=viewerPose?.transform.matrix;
  const forward=m?[-m[8],-m[9],-m[10]]:null,result=referenceSelection.accept(point,{forward});
  if(!result.accepted){updateReferenceUI();announce(`${result.error}。${referenceSelection.mode==='simple'?'請換位置再按「設定工作區」。':'已設定的點會保留，請換位置再確認。'}`);return;}
  const obj=template.clone(null);obj.name='Reference-'+result.index;obj.setPositionWorld(point);obj.setScalingLocal([.012,.012,.012]);obj.active=true;referenceMarkers.push(obj);navigator.vibrate?.(40);
  calibration=referenceSelection.frame;updateReferenceUI();
  if(!result.complete){calibrationStep(`✓ ${referenceNames[result.index]}已記錄。`);return;}
  for(const pin of spatialPins.values())renderSpatial(pin);post({type:'calibration-status',calibrated:true,method:referenceSelection.mode});
  if(referenceSelection.mode==='simple'){announce('✓ 工作區已設定！對準要檢查的位置，按「＋新增空間標記」。移動手機查看，標記應留在原位。簡易定位依你目前面向建立方向，兩地精細對齊請使用進階三點設定。');return;}
  const distances=calibration.lengths.map(n=>Math.round(n*100));
  announce(`✓ 三個參考點已完成！右方 ${distances[0]} 公分、前方 ${distances[1]} 公分。對準要檢查的位置，再按「＋空間標記」；參考點本身不會產生驗收標記。`);
 }
 function addPhysicalPin(){if(!calibration||!hitPose){announce('先對準桌面設定工作區，再新增標記。');return;}if(spatialPins.size>=100){announce('最多 100 個空間標記，請先清除。');return;}const p=hitPose.transform.position,pin={id:crypto.randomUUID(),frame:frameId,position:toShared(calibration,[p.x,p.y,p.z]),number:spatialPins.size+1};if(!validSpatialPin(pin,frameId))return;spatialPins.set(pin.id,pin);renderSpatial(pin);post({type:'spatial-pin',pin});announce(`✓ 已新增 ${pin.number} 號空間標記。移動手機換角度看，標記應留在同一位置。`);}
 class SurfacePlacement extends Component {
  static TypeName='visionlink-surface-placement';
  update(){
   const xr=engine.xr;if(!xr?.frame||!xr.currentReferenceSpace){instructions.update(null,null,false);return;}
   if(reference!==xr.currentReferenceSpace){reference?.removeEventListener('reset',onReferenceReset);reference=xr.currentReferenceSpace;reference.addEventListener('reset',onReferenceReset);if(referenceSelection.points.length)invalidate();}
   const pose=xr.frame.getViewerPose(reference);viewerPose=pose;if(!pose){hitPose=null;if(reticle)reticle.active=false;updateReferenceUI();return;}
   if(hitSource){const hit=xr.frame.getHitTestResults(hitSource)[0];hitPose=hit?.getPose(reference)||null;if(reticle){reticle.active=!!hitPose;if(hitPose){const p=hitPose.transform.position;reticle.setPositionWorld([p.x,p.y,p.z]);}}}
   updateReferenceUI();
   updateInstructionUI();instructions.update(calibration,pose,true);
   if(peerMarker&&performance.now()-peerLast>2000)peerMarker.active=false;
   const view=pose.views[0];if(calibration&&performance.now()-poseLast>150){poseLast=performance.now();const t=pose.transform,position=toShared(calibration,[t.position.x,t.position.y,t.position.z]),m=t.matrix,forward=directionToShared(calibration,[-m[8],-m[9],-m[10]]);post({type:'spatial-pose',frame:frameId,position,forward});}
   if(capture&&view){try{const points=calibration?[...spatialPins.values()].map(pin=>{const screen=projectPoint(fromShared(calibration,pin.position),view.transform.inverse.matrix,view.projectionMatrix);return screen?{...screen,number:pin.number}:null;}).filter(Boolean):[];
     const projectedInstructions=instructions.projected(calibration,view);
     const available=capture.capture(xr.frame,view,points,(bitmap,points)=>{if(!captureReported){captureReported=true;post({type:'xr-share-status',active:true,supported:true});}parent.postMessage({type:'xr-camera-frame',bitmap,points,annotations:projectedInstructions},location.origin,[bitmap]);});
     if(!available&&!view.camera&&!captureReported){captureReported=true;post({type:'xr-share-status',active:true,supported:false});capability.textContent='AR 空間標記可使用；此裝置未提供 AR 鏡頭共享，夥伴影像暫停。';}
    }catch(e){capture.destroy();capture=null;post({type:'xr-share-status',active:true,supported:false});announce('AR 鏡頭共享無法啟動：'+e.message);}}
  }
 }
 function onReferenceReset(){invalidate();}
 engine.registerComponent(SurfacePlacement);engine.scene.addObject().addComponent(SurfacePlacement);
 const canvas=document.getElementById('canvas');
 canvas.addEventListener('pointerdown',e=>{lastX=e.clientX;canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(lastX===null||engine.xr)return;yaw+=(e.clientX-lastX)*.006;lastX=e.clientX;world.setRotationLocal([0,Math.sin(yaw/2),0,Math.cos(yaw/2)]);});
 canvas.addEventListener('pointerup',()=>lastX=null);canvas.addEventListener('pointercancel',()=>lastX=null);
 function marker(position,id){if(markers.has(id))return;const obj=template.clone(world);obj.name='SharedInspectionPin';obj.setPositionLocal(position);obj.setScalingLocal([.055,.055,.055]);obj.active=!engine.xr;markers.set(id,obj);}
 window.addEventListener('message',({origin,source,data})=>{if(origin!==location.origin||source!==parent)return;if(data?.type==='pin'&&data.pin&&Number.isFinite(data.pin.x)&&Number.isFinite(data.pin.y)){marker([(data.pin.x-.5)*2.6,1.9-data.pin.y*1.8,-.82],data.pin.id);}if(data?.type==='world-pin'&&Array.isArray(data.position)&&data.position.length===3&&data.position.every(Number.isFinite)){marker(data.position,'remote-'+JSON.stringify(data.position));}if(data?.type==='clear'){for(const obj of markers.values())obj.destroy();markers.clear();}});
 window.addEventListener('message',({origin,source,data})=>{if(origin!==location.origin||source!==parent)return;
  if(data?.type==='annotation-pending'&&validAnnotation(data.annotation)&&!data.annotation.spatial){pendingInstruction=data.annotation;updateInstructionUI();announce('收到指令「'+(pendingInstruction.text||'檢查這裡')+'」。對準實物上的正確位置，再按「固定這個指令」。形狀約 25 公分，需人工核對。');}
  if(data?.type==='annotation'&&validAnnotation(data.annotation)&&data.annotation.spatial?.frame===frameId){if(demoInstructions){instructions.clear();demoInstructions=false;}instructions.set(data.annotation,calibration);}
  if(data?.type==='annotation-remove'&&typeof data.id==='string'){instructions.remove(data.id);if(pendingInstruction?.id===data.id){pendingInstruction=null;updateInstructionUI();}}
  if(data?.type==='annotation-tool'&&['arrow','circle','line','label'].includes(data.kind)&&typeof data.text==='string'){arTool.value=data.kind;arText.value=data.text.slice(0,120);stroke=[];strokeNormal=null;updateInstructionUI();}
  if(data?.type==='leave-ar')engine.xr?.session.end();
  if(data?.type==='spatial-frame'&&typeof data.frame==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(data.frame)&&frameId!==data.frame){frameId=data.frame;instructions.clear();pendingInstruction=null;for(const obj of physicalMarkers.values())obj.destroy();physicalMarkers.clear();spatialPins.clear();invalidate('房間已更新；進入 AR 後設定工作區。');}
  if(data?.type==='spatial-pin'&&validSpatialPin(data.pin,frameId)&&spatialPins.size<100&&!spatialPins.has(data.pin.id)){spatialPins.set(data.pin.id,data.pin);renderSpatial(data.pin);}
  if(data?.type==='spatial-clear'){for(const obj of physicalMarkers.values())obj.destroy();physicalMarkers.clear();spatialPins.clear();}
  if(data?.type==='peer-pose'&&validSpatialPose(data.pose,frameId)&&calibration){if(!peerMarker){peerMarker=template.clone(null);peerMarker.name='PeerViewpoint';peerMarker.setScalingLocal([.05,.05,.05]);}peerMarker.setPositionWorld(fromShared(calibration,data.pose.position));peerMarker.active=true;peerLast=performance.now();}else if(data?.type==='peer-pose'&&!data.pose&&peerMarker)peerMarker.active=false;
 });
 document.getElementById('add-pin').onclick=()=>{if(engine.xr){addPhysicalPin();return;}status.textContent='公尺標記需要進入 AR 並設定三個參考點。桌面可查看已同步的標記。';};
 confirmPoint.onclick=confirmReference;
 function startReferenceMode(mode){if(!engine.xr){announce('請先在相容的手機進入 AR。');return;}referenceSelection.mode=mode;invalidate(mode==='simple'?'對準桌面，看到黃色球後按「設定工作區」。':'進階三點對齊：已重設工作區。');if(mode==='advanced')calibrationStep();}
 document.getElementById('calibrate').onclick=()=>startReferenceMode(referenceSelection.mode);
 document.getElementById('advanced-calibration').onclick=()=>startReferenceMode('advanced');
 document.getElementById('simple-calibration').onclick=()=>startReferenceMode('simple');
 document.getElementById('clear-space').onclick=()=>{for(const obj of physicalMarkers.values())obj.destroy();physicalMarkers.clear();spatialPins.clear();for(const id of instructions.items.keys())post({type:'annotation-remove',id});instructions.clear();pendingInstruction=null;stroke=[];strokeNormal=null;updateInstructionUI();post({type:'spatial-clear'});status.textContent='已清除兩端空間標記及協作指令。';};
 document.getElementById('reset').onclick=()=>{yaw=0;world.setRotationLocal([0,0,0,1]);status.textContent='視角已重設。';};
 arButton.onclick=async()=>{
  if(!engine.arSupported){viewMode.textContent='3D 預覽 · AR 不支援';status.textContent='AR 未啟動。這些貨箱是示範模型；普通鏡頭協作仍可使用。';return;}
  let session=null;arButton.disabled=true;status.textContent='正在請求 AR；請完成瀏覽器的啟動提示。';
  try{parent.visionLinkXR?.prepare();session=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['local','hit-test'],optionalFeatures:['local-floor','camera-access','dom-overlay'],domOverlay:{root:document.getElementById('xr-ui')}});await canvas.getContext('webgl2').makeXRCompatible();await engine.webxr.startSession(session,'immersive-ar');}
  catch(e){try{await session?.end();}catch{}viewMode.textContent='3D 預覽 · AR 未啟動';status.textContent='AR 無法啟動：'+e.message+'。需要視訊協作時，請返回工作空間重新開啟鏡頭。';post({type:'xr-share-status',active:false,supported:false});}
  finally{arButton.disabled=false;}
 };
 document.getElementById('xr-ui').addEventListener('beforexrselect',e=>{if(e.target.closest('button,input,select,label,summary,#reference-panel,#advanced-options,#capability,#tracking-status,#status'))e.preventDefault();});
 document.getElementById('exit-ar').onclick=()=>engine.xr?.session.end();
 engine.onXRSessionStart.add(async(session,mode)=>{
  if(mode!=='immersive-ar')return;miniature=true;hitPose=null;viewerPose=null;captureReported=false;referenceSelection.mode='simple';preview.enter();player.setPositionLocal([0,0,0]);document.body.classList.add('xr-active');viewMode.textContent='AR 已啟動 · 真實環境';capability.textContent='對準桌面 → 設定工作區 → 新增空間標記。移動手機，查看標記是否留在原位。';reticle=template.clone(null);reticle.setScalingLocal([.018,.018,.018]);reticle.active=false;invalidate('請對準有紋理、光線充足的桌面，等待黃色球後設定工作區。');post({type:'xr-share-status',active:true,supported:false});
  try{if(typeof XRWebGLBinding!=='undefined'&&XRWebGLBinding.prototype.getCameraImage)capture=new XRCameraCapture(session,canvas);}catch{/* Optional camera-access was not granted. */}
  if(demoInstructions){instructions.clear();demoInstructions=false;}updateInstructionUI();
  const select=()=>{if(!calibration)confirmReference();else if(pendingInstruction)placePending();else placeLocal();};
  session.addEventListener('select',select);try{const viewer=await session.requestReferenceSpace('viewer');const source=await session.requestHitTestSource({space:viewer});if(engine.xr?.session!==session){source.cancel();return;}hitSource=source;announce('看到黃色球後，按「設定工作區」即可開始。');}catch(e){announce('平面偵測無法啟動：'+e.message);}
  session.addEventListener('end',()=>session.removeEventListener('select',select),{once:true});
 });
 engine.onXRSessionEnd.add(()=>{hitSource?.cancel();hitSource=null;hitPose=null;viewerPose=null;reticle?.destroy();reticle=null;capture?.destroy();capture=null;reference?.removeEventListener('reset',onReferenceReset);reference=null;document.body.classList.remove('xr-active');invalidate('已離開 AR；下次進入時重新設定工作區。');post({type:'xr-share-status',active:false,supported:false});document.body.classList.remove('xr-active');if(!miniature)return;preview.leave();for(const obj of markers.values())obj.active=true;viewMode.textContent='3D 預覽 · AR 已結束';capability.textContent='目前顯示示範貨箱。按「進入 AR」可切回真實環境。';player.setPositionLocal([0,1.9,5.5]);miniature=false;for(const pin of spatialPins.values())renderSpatial(pin);});
 status.textContent='Wonderland Engine 1.6.1 已載入；目前是可拖曳旋轉的 3D 預覽，AR 尚未啟動。';
 updateReferenceUI();
 updateInstructionUI();
 parent.postMessage({type:'engine-ready'},location.origin);
}catch(e){status.textContent='Wonderland Engine 載入失敗：'+e.message;console.error(e);}
