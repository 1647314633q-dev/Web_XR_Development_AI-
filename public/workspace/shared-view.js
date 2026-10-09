export function fit(width,height,targetWidth,targetHeight){const s=Math.min(targetWidth/width,targetHeight/height);return {x:(targetWidth-width*s)/2,y:(targetHeight-height*s)/2,w:width*s,h:height*s};}
export function paintItems(ctx,items,rect,width=960,height=540){
 ctx.font='14px sans-serif';
 for(const item of items){if(!item.box)continue;const b=item.box,x=rect.x+b.x*rect.w,y=rect.y+b.y*rect.h,w=b.w*rect.w,h=b.h*rect.h;
  ctx.strokeStyle=item.warning?'#ff837b':'#bff5cd';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);
  const text=item.label+(typeof item.score==='number'?` ${Math.round(item.score*100)}%`:'');const tw=Math.min(width,ctx.measureText(text).width+16),tx=Math.min(x,width-tw),ty=Math.max(22,y);
  ctx.fillStyle=item.warning?'#8b2925ee':'#225444ee';ctx.fillRect(tx,ty-22,tw,22);ctx.fillStyle='#fff';ctx.fillText(text,tx+8,ty-6);
 }
}
export class SharedView {
 constructor({source,items,pins,onChange}){
  this.source=source;this.items=items;this.pins=pins;this.onChange=onChange;this.enabled=true;this.xr=null;this.xrActive=false;this.xrSupported=false;this.xrPaused=false;
  this.canvas=document.createElement('canvas');this.canvas.width=960;this.canvas.height=540;this.ctx=this.canvas.getContext('2d');this.stream=null;this.track=null;
  this.lastFrame=document.createElement('canvas');this.lastFrame.width=960;this.lastFrame.height=540;this.hasLastFrame=false;this.restoring=false;
  this.xrCanvas=document.createElement('canvas');
  // Immersive XR drives its own frames. Do not depend on the parent page's timer.
  this.timer=setInterval(()=>{if(!this.xrActive)this.draw();},66);
 }
 ensure(){if(!this.track&&this.canvas.captureStream){this.stream=this.canvas.captureStream(15);this.track=this.stream.getVideoTracks()[0];this.draw();}return this.track;}
 getTrack(raw){if(this.xrActive||this.restoring)return this.ensure();return this.enabled?this.ensure()||raw:raw;}
 setEnabled(enabled){this.enabled=enabled;this.onChange();}
 setXR(active,supported){if(active&&!this.xrActive)this.draw();this.restoring=!active&&this.xrActive;this.xrActive=active;this.xrSupported=supported;this.xrPaused=false;if(!active||!supported){this.xr?.bitmap.close?.();this.xr=null;}this.onChange();this.draw();}
 receiveXRImage(data,points,annotations=[]){const c=this.xrCanvas;if(c.width!==data.width||c.height!==data.height){c.width=data.width;c.height=data.height;}c.getContext('2d').putImageData(data,0,0);this.receiveXR(c,points,annotations);}
 receiveXR(bitmap,points,annotations=[]){if(this.xr?.bitmap!==bitmap)this.xr?.bitmap.close?.();this.xr={bitmap,points,annotations,received:performance.now()};const first=!this.xrSupported;this.xrSupported=true;this.xrPaused=false;this.draw();if(first)this.onChange();}
 pauseXR(){this.xrPaused=true;this.xr?.bitmap.close?.();this.xr=null;this.draw();}
 draw(){try{this.paint();}finally{this.track?.requestFrame?.();}}
 paint(){
  const c=this.ctx,w=960,h=540;c.fillStyle='#153c3e';c.fillRect(0,0,w,h);
  const xr=this.xrActive,entry=xr?this.xr:null,source=xr&&entry&&performance.now()-entry.received<600?entry.bitmap:xr?null:this.source();
  if(!source){if(this.hasLastFrame)c.drawImage(this.lastFrame,0,0);if(xr||this.restoring){c.fillStyle='#123532eb';c.fillRect(12,12,w-24,54);c.fillStyle='#fff';c.font='18px sans-serif';c.fillText(this.hasLastFrame?'最後畫面（已暫停） · '+(xr?(this.xrPaused?'AR 影像中斷，等待恢復':'正在切換 AR 鏡頭'):'正在恢復現場鏡頭'):'正在切換鏡頭，請稍候',24,46);}return;}
  const width=source.videoWidth||source.width,height=source.videoHeight||source.height;if(!width||!height)return;const rect=fit(width,height,w,h);c.drawImage(source,rect.x,rect.y,rect.w,rect.h);const last=this.lastFrame.getContext('2d');last.clearRect(0,0,w,h);last.drawImage(this.canvas,0,0);this.hasLastFrame=true;if(!xr)this.restoring=false;
  if(this.enabled)paintItems(c,this.items(),rect,w,h);
  if(this.enabled&&xr)paintAnnotations(c,entry.annotations,rect);
  const points=this.enabled?(xr?entry.points:this.pins()):[];
  for(const p of points){const x=xr?rect.x+p.x*rect.w:p.x*w,y=xr?rect.y+p.y*rect.h:p.y*h;c.beginPath();c.arc(x,y,14,0,Math.PI*2);c.fillStyle='#ffecaa';c.fill();c.fillStyle='#554020';c.font='bold 14px sans-serif';c.textAlign='center';c.fillText(String(p.number),x,y+5);c.textAlign='start';}
 }
 destroy(){clearInterval(this.timer);this.xr?.bitmap.close?.();this.stream?.getTracks().forEach(t=>t.stop());}
}
import {paintAnnotations} from './annotation-draw.js';
