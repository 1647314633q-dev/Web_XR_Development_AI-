// Peer messages contain bounded image coordinates; sender clocks are never trusted.
const modes=new Set(['barcode','faces','objects','damage']);
const finite=(n)=>typeof n==='number'&&Number.isFinite(n);
export function validAiPacket(p){
 return p?.type==='ai-results'&&p.version===1&&typeof p.streamId==='string'&&p.streamId.length<=80&&Number.isSafeInteger(p.seq)&&p.seq>=0&&modes.has(p.mode)&&typeof p.active==='boolean'&&['camera','photo','xr'].includes(p.source)&&typeof p.composited==='boolean'&&Number.isInteger(p.width)&&p.width>0&&p.width<=8192&&Number.isInteger(p.height)&&p.height>0&&p.height<=8192&&Array.isArray(p.items)&&p.items.length<=12&&p.items.every(d=>typeof d.label==='string'&&d.label.length<=160&&(finite(d.score)&&d.score>=0&&d.score<=1||d.score==='條碼')&&typeof d.warning==='boolean'&&(!d.box||['x','y','w','h'].every(k=>finite(d.box[k])&&d.box[k]>=0&&d.box[k]<=1)&&d.box.x+d.box.w<=1.001&&d.box.y+d.box.h<=1.001));
}
export class RemoteAi {
 constructor(){this.clear();}
 clear(){this.packet=null;this.received=0;this.retired=new Set();}
 accept(packet,now){
  if(!validAiPacket(packet)||this.retired.has(packet.streamId))return false;
  if(this.packet?.streamId===packet.streamId&&packet.seq<=this.packet.seq)return false;
  if(this.packet&&this.packet.streamId!==packet.streamId){this.retired.add(this.packet.streamId);if(this.retired.size>32)this.retired.delete(this.retired.values().next().value);}
  this.packet=structuredClone(packet);this.received=now;return true;
 }
 current(now){return this.packet?.active&&now-this.received>=0&&now-this.received<=2500?this.packet:null;}
}
export function validFrameId(id){return typeof id==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(id);}
export function validSpatialPin(p,frame){return p&&p.frame===frame&&validFrameId(p.frame)&&typeof p.id==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(p.id)&&Array.isArray(p.position)&&p.position.length===3&&p.position.every(n=>finite(n)&&Math.abs(n)<=100)&&Number.isInteger(p.number)&&p.number>0&&p.number<=100;}
export function validSpatialPose(p,frame){return p?.type==='spatial-pose'&&p.frame===frame&&Array.isArray(p.position)&&p.position.length===3&&p.position.every(n=>finite(n)&&Math.abs(n)<=100)&&Array.isArray(p.forward)&&p.forward.length===3&&p.forward.every(n=>finite(n)&&Math.abs(n)<=1.001)&&Math.abs(Math.hypot(...p.forward)-1)<.02;}
export function canSend(channel){return channel?.readyState==='open'&&channel.bufferedAmount<65536;}
