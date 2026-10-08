import {shapePath} from './annotation-protocol.js';
export function paintAnnotations(ctx,items,rect){
 ctx.save();ctx.lineWidth=3;ctx.lineJoin='round';ctx.lineCap='round';ctx.font='600 15px sans-serif';
 for(const a of items){const color=a.source==='ai'?'#ef685f':'#ffe18b';ctx.strokeStyle=color;ctx.fillStyle=color;const path=shapePath(a.kind,a.points);if(a.kind!=='label'){ctx.beginPath();for(let i=0;i<path.length;i++){const x=rect.x+path[i][0]*rect.w,y=rect.y+path[i][1]*rect.h;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
  const anchor=a.kind==='arrow'?a.points.at(-1):a.points[0],x=rect.x+anchor[0]*rect.w,y=rect.y+anchor[1]*rect.h;const text=a.text||({arrow:'檢查這裡',circle:'檢查範圍',line:'沿線檢查',label:'檢查點'})[a.kind],width=Math.min(rect.w,ctx.measureText(text).width+18),tx=Math.max(rect.x,Math.min(x,rect.x+rect.w-width)),ty=Math.max(rect.y+25,y-8);ctx.fillStyle=a.source==='ai'?'#8b2925ed':'#163f3bed';ctx.fillRect(tx,ty-23,width,25);ctx.fillStyle=color;ctx.fillText(text,tx+9,ty-5);}
 ctx.restore();
}
