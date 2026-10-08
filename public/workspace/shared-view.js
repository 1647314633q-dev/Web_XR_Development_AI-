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
  this.source=source;this.items=items;this.pins=pins;this.onChange=onChange;this.enabled=true;this.xr=null;this.xrActive=false;this.xrSupported=false;
  this.canvas=document.createElement('canvas');this.canvas.width=960;this.canvas.height=540;this.ctx=this.canvas.getContext('2d');this.stream=null;this.track=null;
  this.timer=setInterval(()=>this.draw(),66);
 }
 ensure(){if(!this.track&&this.canvas.captureStream){this.draw();this.stream=this.canvas.captureStream(15);this.track=this.stream.getVideoTracks()[0];}return this.track;}
 getTrack(raw){if(this.xrActive)return this.xrSupported&&this.enabled?this.ensure():null;return this.enabled?this.ensure()||raw:raw;}
 setEnabled(enabled){this.enabled=enabled;this.onChange();}
 setXR(active,supported){this.xrActive=active;this.xrSupported=supported;if(!active||!supported){this.xr?.bitmap.close();this.xr=null;}this.onChange();}
 receiveXR(bitmap,points,annotations=[]){this.xr?.bitmap.close();this.xr={bitmap,points,annotations,received:performance.now()};this.xrSupported=true;}
 draw(){
  const c=this.ctx,w=960,h=540;c.fillStyle='#153c3e';c.fillRect(0,0,w,h);
  const xr=this.xrActive,entry=xr?this.xr:null,source=xr&&entry&&performance.now()-entry.received<600?entry.bitmap:xr?null:this.source();
  if(!source){if(xr){c.fillStyle='#fff';c.font='18px sans-serif';c.fillText('AR 影像暫停 · 等待鏡頭畫面',24,48);}return;}
  const width=source.videoWidth||source.width,height=source.videoHeight||source.height;if(!width||!height)return;const rect=fit(width,height,w,h);c.drawImage(source,rect.x,rect.y,rect.w,rect.h);
  if(this.enabled)paintItems(c,this.items(),rect,w,h);
  if(this.enabled&&xr)paintAnnotations(c,entry.annotations,rect);
  const points=this.enabled?(xr?entry.points:this.pins()):[];
  for(const p of points){const x=xr?rect.x+p.x*rect.w:p.x*w,y=xr?rect.y+p.y*rect.h:p.y*h;c.beginPath();c.arc(x,y,14,0,Math.PI*2);c.fillStyle='#ffecaa';c.fill();c.fillStyle='#554020';c.font='bold 14px sans-serif';c.textAlign='center';c.fillText(String(p.number),x,y+5);c.textAlign='start';}
 }
 destroy(){clearInterval(this.timer);this.xr?.bitmap.close();this.stream?.getTracks().forEach(t=>t.stop());}
}
import {paintAnnotations} from './annotation-draw.js';
