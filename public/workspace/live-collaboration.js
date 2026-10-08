import {RemoteAi,canSend,validFrameId,validSpatialPin,validSpatialPose} from './collaboration-protocol.js';
import {SharedView} from './shared-view.js';
export function installLiveCollaboration({state,$,sendMessage,engineMessage,renderResults,drawOverlay,toast,addNote}){
 const remoteAI=new RemoteAi();state.remoteAI=remoteAI;state.aiStreamId=crypto.randomUUID();state.aiSeq=0;state.spatialFrame=crypto.randomUUID();state.spatialPins=[];state.calibrated=false;state.remoteCalibrated=false;
 const share=new SharedView({source:()=>state.imageSource||((state.stream&&$('localVideo').readyState>=2)?$('localVideo'):null),items:()=>state.ai?state.detections:[],pins:()=>state.pins.filter(p=>p.target==='local'),onChange:()=>state.refreshVideo()});state.sharedView=share;
 state.outputTrack=()=>share.xrActive?share.getTrack(null):state.imageSource?share.ensure():state.stream?share.getTrack(state.stream.getVideoTracks()[0]):null;
 state.refreshVideo=async()=>{try{await state.cameraSender?.replaceTrack(state.outputTrack());sendMessage({type:'camera',enabled:!!state.outputTrack()});state.publishAI();}catch(e){toast('共享畫面無法切換：'+e.message);}};
 state.aiSource=()=>share.xrActive?(share.xr&&performance.now()-share.xr.received<600?share.xr.bitmap:null):state.imageSource||$('localVideo');
 state.publishAI=(active=state.ai&&state.ready)=>{
  if(!canSend(state.channel))return;const source=state.aiSource(),width=source?.videoWidth||source?.width||1,height=source?.videoHeight||source?.height||1;
  const items=active?state.detections.slice(0,12).map(d=>{const b=d.box;return {label:String(d.label).slice(0,160),score:typeof d.score==='number'?Math.max(0,Math.min(1,d.score)):'條碼',warning:!!d.warning,...(b?{box:{x:Math.max(0,Math.min(1,b.x)),y:Math.max(0,Math.min(1,b.y)),w:Math.max(0,Math.min(1-b.x,b.w)),h:Math.max(0,Math.min(1-b.y,b.h))}}:{})};}):[];
  sendMessage({type:'ai-results',version:1,streamId:state.aiStreamId,seq:++state.aiSeq,mode:state.mode,active:!!active,width,height,source:share.xrActive?'xr':state.imageSource?'photo':'camera',composited:share.enabled,items});
 };
 function spatialStatus(){const label=(ready,method)=>!ready?'未設定':method==='advanced'?'三點已設定':method==='simple'?'簡易已設定':'已設定';$('spatialStatus').textContent=`空間定位：你${label(state.calibrated,state.calibrationMethod)} · 夥伴${label(state.remoteCalibrated,state.remoteCalibrationMethod)} · ${state.spatialPins.length} 個公尺標記`;const code=state.room?.session?.code;if(code)try{sessionStorage.setItem('visionlink-space-'+code,JSON.stringify({frame:state.spatialFrame,pins:state.spatialPins}));}catch{}}
 state.liveOnOpen=()=>{
  remoteAI.clear();const code=state.room?.session?.code;let restored=false;if(code)try{const saved=JSON.parse(sessionStorage.getItem('visionlink-space-'+code));if(saved&&validFrameId(saved.frame)&&Array.isArray(saved.pins)){state.spatialFrame=saved.frame;state.spatialPins=saved.pins.filter(p=>validSpatialPin(p,saved.frame)).slice(0,100);restored=true;state.liveEngineReady();}}catch{}
  if(code&&state.spaceRoomCode!==code&&!restored){state.spatialFrame=crypto.randomUUID();state.spatialPins=[];state.calibrated=false;state.liveEngineReady();}state.spaceRoomCode=code;
  if(state.role==='host')sendMessage({type:'spatial-frame',frame:state.spatialFrame});spatialStatus();
  sendMessage({type:'spatial-status',frame:state.spatialFrame,calibrated:state.calibrated,method:state.calibrationMethod});
  for(const pin of state.spatialPins)sendMessage({type:'spatial-pin',pin});state.publishAI();
 };
 state.liveOnClose=()=>{remoteAI.clear();state.remoteCalibrated=false;engineMessage({type:'peer-pose',pose:null});spatialStatus();renderResults();};
 state.liveMessage=(m)=>{
  if(m.type==='ai-results'&&remoteAI.accept(m,performance.now())){if(m.active&&m.mode==='barcode')for(const d of m.items)state.acceptScan?.(d.label,'remote');renderResults();}
  if(m.type==='spatial-frame'&&state.role==='guest'&&validFrameId(m.frame)){
   if(state.spatialFrame!==m.frame){state.spatialFrame=m.frame;state.spatialPins=[];state.calibrated=false;engineMessage({type:'spatial-frame',frame:m.frame});}
   sendMessage({type:'spatial-status',frame:state.spatialFrame,calibrated:state.calibrated,method:state.calibrationMethod});spatialStatus();
  }
  if(m.type==='spatial-status'&&m.frame===state.spatialFrame&&typeof m.calibrated==='boolean'){state.remoteCalibrated=m.calibrated;state.remoteCalibrationMethod=['simple','advanced'].includes(m.method)?m.method:null;spatialStatus();}
  if(m.type==='spatial-pin'&&validSpatialPin(m.pin,state.spatialFrame)&&state.spatialPins.length<100&&!state.spatialPins.some(p=>p.id===m.pin.id)){state.spatialPins.push(m.pin);engineMessage({type:'spatial-pin',pin:m.pin});spatialStatus();}
  if(m.type==='spatial-pose'&&validSpatialPose(m,state.spatialFrame))engineMessage({type:'peer-pose',pose:m});
  if(m.type==='spatial-clear'&&m.frame===state.spatialFrame){state.spatialPins=[];engineMessage({type:'spatial-clear'});spatialStatus();}
 };
 state.liveEngineReady=()=>{engineMessage({type:'spatial-frame',frame:state.spatialFrame});for(const pin of state.spatialPins)engineMessage({type:'spatial-pin',pin});};
 state.liveEngineMessage=(data)=>{
  if(data.type==='calibration-status'&&typeof data.calibrated==='boolean'){state.calibrated=data.calibrated;state.calibrationMethod=['simple','advanced'].includes(data.method)?data.method:null;sendMessage({type:'spatial-status',frame:state.spatialFrame,calibrated:data.calibrated,method:state.calibrationMethod});spatialStatus();}
  if(data.type==='spatial-pin'&&validSpatialPin(data.pin,state.spatialFrame)&&state.spatialPins.length<100&&!state.spatialPins.some(p=>p.id===data.pin.id)){state.spatialPins.push(data.pin);sendMessage(data);spatialStatus();addNote(`新增 ${data.pin.number} 號空間標記（公尺座標；兩地精細對齊使用進階三點設定）。`);}
  if(data.type==='spatial-pose'&&validSpatialPose(data,state.spatialFrame)&&canSend(state.channel))sendMessage(data);
  if(data.type==='spatial-clear'){state.spatialPins=[];sendMessage({type:'spatial-clear',frame:state.spatialFrame});spatialStatus();}
  if(data.type==='xr-share-status'){share.setXR(!!data.active,!!data.supported);$('shareStatus').textContent=data.active?data.supported?'AR 鏡頭及空間標記正在共享':'此裝置未提供 AR 鏡頭共享；夥伴影像暫停':'鏡頭、AI 框和畫面標記可同步共享';}
  if(data.type==='xr-camera-frame'&&data.bitmap instanceof ImageBitmap){if(!share.xrActive){data.bitmap.close();return;}share.receiveXR(data.bitmap,Array.isArray(data.points)?data.points.slice(0,100):[]);if(!state.worker&&state.ai)state.startXRai?.();}
 };
 $('shareAnnotated').onchange=()=>{share.setEnabled($('shareAnnotated').checked);$('shareStatus').textContent=share.enabled?'鏡頭、AI 框和画面標記可同步共享':'共享原始鏡頭；夥伴按 AI 結果繪製偵測框';};
 let wasFresh=false;setInterval(()=>{const fresh=!!remoteAI.current(performance.now());if(fresh!==wasFresh){wasFresh=fresh;renderResults();}if(state.view==='remote')drawOverlay();},500);
 spatialStatus();window.addEventListener('pagehide',()=>share.destroy());
 window.visionLinkXR={prepare:()=>{state.stopForXR?.();share.setXR(true,false);}};
}
