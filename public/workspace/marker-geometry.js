import {shapePath,validAnnotation} from './annotation-protocol.js';
export const MARKER_ID=17;
const square=[[0,0],[1,0],[1,1],[0,1]]; // Canonical printed TL, TR, BR, BL, not screen-sorted corners.
const finitePoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
export function validCorners(c){
 if(!Array.isArray(c)||c.length!==4||!c.every(finitePoint))return false;
 for(let i=0;i<4;i++){const a=c[i],b=c[(i+1)%4],d=c[(i+2)%4];if((b[0]-a[0])*(d[1]-b[1])-(b[1]-a[1])*(d[0]-b[0])<.0004)return false;}
 return true; // Reject mirrored, self-intersecting, edge-on and tiny quads.
}
function solve(rows){
 for(let i=0;i<8;i++){let p=i;for(let j=i+1;j<8;j++)if(Math.abs(rows[j][i])>Math.abs(rows[p][i]))p=j;
  if(Math.abs(rows[p][i])<1e-10)throw new Error('定位圖角度太斜或太小，請靠近並正對定位圖');
  [rows[i],rows[p]]=[rows[p],rows[i]];const v=rows[i][i];rows[i]=rows[i].map(x=>x/v);
  for(let j=0;j<8;j++)if(j!==i){const s=rows[j][i];rows[j]=rows[j].map((x,k)=>x-s*rows[i][k]);}
 }return [...rows.map(r=>r[8]),1];
}
export function homography(from,to){
 const rows=[];from.forEach(([x,y],i)=>{const [u,v]=to[i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);});return solve(rows);
}
export function transform(h,[x,y]){const d=h[6]*x+h[7]*y+h[8];if(!Number.isFinite(d)||d<=1e-6)throw new Error('指令超出可定位的平面，請靠近定位圖重新取圖');return [(h[0]*x+h[1]*y+h[2])/d,(h[3]*x+h[4]*y+h[5])/d];}
export function markerTransform(corners){if(!validCorners(corners))throw new Error('定位圖方向或追蹤資料無效');return homography(square,corners);}
export function anchorToMarker(a,photo,epoch){
 if(!validAnnotation(a)||a.reference!==photo?.id||Date.now()-photo.at>120000||photo.marker?.epoch!==epoch||photo.marker?.id!==MARKER_ID||!validCorners(photo.marker.corners))throw new Error('參考圖已失效，請重新擷取定位圖 AR 畫面');
 const r=photo.rect;if(!r||![r.x,r.y,r.w,r.h].every(Number.isFinite)||r.w<=0||r.h<=0)throw new Error('參考圖範圍無效');
 const inverse=homography(photo.marker.corners,square);
 const convert=p=>{const u=(p[0]-r.x)/r.w,v=(p[1]-r.y)/r.h;if(u<0||u>1||v<0||v>1)throw new Error('請在相機畫面內畫指令，避開左右或上下留白');const q=transform(inverse,[u,v]);if(q.some(x=>x < -2 || x > 3))throw new Error('指令離定位圖太遠；請把定位圖放近目標後重新取圖');return q;};
 return {frame:epoch,marker:MARKER_ID,points:a.points.map(convert),path:shapePath(a.kind,a.points).map(convert)};
}
export function projectMarker(a,corners,epoch){
 if(a.planar?.frame!==epoch||a.planar.marker!==MARKER_ID)return null;
 const h=markerTransform(corners);try{return {path:a.planar.path.map(p=>transform(h,p)),anchor:transform(h,a.kind==='arrow'?a.planar.points.at(-1):a.planar.points[0])};}catch{return null;}
}
