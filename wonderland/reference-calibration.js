import {calibrate,calibrateOrigin} from '../public/workspace/spatial.js';
export const referenceNames=['原點 O','右方 X','前方 Z'];
export class ReferenceCalibration {
 constructor(){this.mode='simple';this.reset();}
 reset(mode=this.mode){this.mode=mode;this.points=[];this.frame=null;}
 accept(point,{forward}={}){
  if(this.frame)return {accepted:false,error:'參考點已完成；新增標記請按「＋空間標記」。'};
  if(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite))return {accepted:false,error:'無效的平面位置，請重新對準。'};
  const index=this.points.length;
  if(this.mode==='simple'){
   try{this.frame=calibrateOrigin(point,forward);}catch(e){return {accepted:false,error:e.message};}
   this.points.push([...point]);return {accepted:true,index:0,complete:true};
  }
  if(index===1){const distance=Math.hypot(...point.map((n,i)=>n-this.points[0][i]));if(distance<.15||distance>10)return {accepted:false,error:'右方 X 與原點須相距至少 15 公分；建議 50 公分。'};}
  if(index===2){try{this.frame=calibrate(this.points[0],this.points[1],point);}catch(e){return {accepted:false,error:e.message};}}
  this.points.push([...point]);return {accepted:true,index,complete:!!this.frame};
 }
}
export function referenceProgress(selection,{active,hasHit}){
 const count=selection.points.length,complete=!!selection.frame;
 const simple=selection.mode==='simple';
 return {
  labels:referenceNames.map((name,i)=>`${i<count?'✓':'○'} ${name}${i<count?' 已設定':active&&i===count?' 待確認':''}`),
  summary:complete?simple?'✓ 工作區已設定，可以新增空間標記':'✓ 三點對齊已完成，可以新增空間標記':active?simple?'步驟 1：對準桌面，看到黃色球後設定工作區':`三點對齊：已確認 ${count}/3`:'進入 AR 後，對準桌面設定工作區',
  button:complete?simple?'工作區已設定 ✓':'三點對齊已完成 ✓':simple?'設定工作區':`確認${referenceNames[count]}`,
  disabled:!active||!hasHit||complete,
  tracking:active?hasHit?'已偵測到平面：黃色球代表目前位置':'尚未偵測到平面；請對準桌面並緩慢移動手機':'AR 尚未啟動'
 };
}
