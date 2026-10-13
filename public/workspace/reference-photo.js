import {ReferenceChunks,validReferenceCamera} from './reference-frame.js';
import {fit} from './shared-view.js';
export function installReferencePhotos({state,$,sendMessage}){
 const references=new Map();let pending=null,lastRequest=0,lastSent=0;
 state.getReference=id=>{const r=references.get(id);return r&&Date.now()-r.at<120000?r:null;};
 state.cancelReference=()=>{if(!pending)return;const p=pending;pending=null;clearTimeout(p.timer);clearTimeout(p.sendTimer);p.reject(new Error('已取消繪圖'));};
 state.requestReference=()=>new Promise((resolve,reject)=>{if(pending){reject(new Error('正在自動對齊畫面，請稍候'));return;}const id=crypto.randomUUID(),timer=setTimeout(()=>{if(pending?.id===id){pending=null;reject(new Error('畫面對齊逾時，請確認現場仍在共享影像後重新選工具'));}},8000);const sendTimer=setTimeout(()=>{if(pending?.id!==id)return;lastSent=Date.now();sendMessage({type:'reference-request',id});},Math.max(0,250-(Date.now()-lastSent)));pending={id,resolve,reject,timer,sendTimer,chunks:new ReferenceChunks(id)};});
 const oldMessage=state.liveMessage;state.liveMessage=m=>{oldMessage?.(m);
  if(m.type==='reference-request'&&state.role==='host'&&typeof m.id==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(m.id)){
   if(Date.now()-lastRequest<150){sendMessage({type:'reference-error',id:m.id,message:'切換工具太快，請稍候再選一次'});return;}lastRequest=Date.now();
   try{const share=state.sharedView,entry=share.xr,source=share.xrActive?entry?.bitmap:state.imageSource||$('localVideo');if(share.xrActive&&(!entry||performance.now()-entry.received>1500))throw new Error('AR 影像已暫停，請先恢復共享再選工具');const w=source?.videoWidth||source?.width,h=source?.videoHeight||source?.height;if(!w||!h)throw new Error('請現場先開啟鏡頭');const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const c=canvas.getContext('2d'),r=fit(w,h,640,360);c.fillStyle='#153c3e';c.fillRect(0,0,640,360);c.drawImage(source,r.x,r.y,r.w,r.h);const url=canvas.toDataURL('image/jpeg',.75);if(url.length>262144)throw new Error('畫面對齊失敗，請重新選工具');const ar=share.xrActive&&validReferenceCamera(entry.camera),reference={id:m.id,url,ar,at:Date.now(),camera:ar?entry.camera:null,rect:{x:r.x/640,y:r.y/360,w:r.w/640,h:r.h/360}};references.set(m.id,reference);while(references.size>8)references.delete(references.keys().next().value);const total=Math.ceil(url.length/12000);for(let index=0;index<total;index++)sendMessage({type:'reference-chunk',id:m.id,total,index,ar,data:url.slice(index*12000,(index+1)*12000)});
   }catch(e){sendMessage({type:'reference-error',id:m.id,message:String(e.message).slice(0,180)});}
  }
  if(m.type==='reference-error'&&pending?.id===m.id){const p=pending;pending=null;clearTimeout(p.timer);p.reject(new Error(typeof m.message==='string'?m.message.slice(0,180):'畫面對齊失敗，請重新選工具'));}
  if(m.type==='reference-chunk'&&state.role==='guest'&&pending?.id===m.id){try{const photo=pending.chunks.accept(m);if(photo){const p=pending;pending=null;clearTimeout(p.timer);references.set(photo.id,photo);while(references.size>8)references.delete(references.keys().next().value);p.resolve(photo);}}catch(error){const p=pending;pending=null;clearTimeout(p.timer);p.reject(error);}}
 };
 const oldClose=state.liveOnClose;state.liveOnClose=()=>{oldClose?.();references.clear();state.cancelReference();};
}
