import {projectMarker} from './marker-geometry.js';
export function paintMarkerInstructions(ctx,annotations,corners,epoch,width,height,preview=false){
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
 ctx.lineWidth=Math.max(2,width/240);ctx.lineJoin='round';ctx.lineCap='round';
 for(const a of annotations){const projected=projectMarker(a,corners,epoch);if(!projected)continue;
  const color=preview?'#97efcf':a.source==='ai'?'#ff837b':'#ffe18b';ctx.strokeStyle=color;
  if(a.kind!=='label'){ctx.beginPath();projected.path.forEach(([x,y],i)=>i?ctx.lineTo(x*width,y*height):ctx.moveTo(x*width,y*height));ctx.stroke();}
  // Only the anchor is projected. Glyphs always face the viewer, with a positive, identity transform.
  const size=Math.max(15,width/36);ctx.font=`600 ${size}px sans-serif`;ctx.textAlign='left';ctx.textBaseline='middle';
  const text=a.text||'檢查這裡',maxWidth=Math.max(80,width-24);let display=text;
  while(ctx.measureText(display).width>maxWidth-20&&display.length>1)display=display.slice(0,-1);
  if(display!==text)display=display.slice(0,-1)+'…';
  const w=Math.min(maxWidth,ctx.measureText(display).width+20),h=size+16;
  const x=Math.max(6,Math.min(width-w-6,projected.anchor[0]*width)),y=Math.max(6,Math.min(height-h-6,projected.anchor[1]*height-h-8));
  ctx.fillStyle='#153e37ee';ctx.fillRect(x,y,w,h);ctx.fillStyle=color;ctx.fillText(display,x+10,y+h/2);
 }ctx.restore();
}
