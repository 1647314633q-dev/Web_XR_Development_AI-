import {shapePath} from './annotation-protocol.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const mul=(m,v)=>[0,1,2,3].map(r=>m[r]*v[0]+m[r+4]*v[1]+m[r+8]*v[2]+m[r+12]*v[3]);
export function inverse4(m){
 if(!Array.isArray(m)||m.length!==16||!m.every(Number.isFinite))throw new Error('參考圖的相機資料無效');
 const rows=Array.from({length:4},(_,r)=>[...Array.from({length:4},(_,c)=>m[c*4+r]),...Array.from({length:4},(_,c)=>+(r===c))]);
 for(let i=0;i<4;i++){let p=i;for(let j=i+1;j<4;j++)if(Math.abs(rows[j][i])>Math.abs(rows[p][i]))p=j;if(Math.abs(rows[p][i])<1e-9)throw new Error('相機投影無效');[rows[i],rows[p]]=[rows[p],rows[i]];const d=rows[i][i];rows[i]=rows[i].map(v=>v/d);for(let j=0;j<4;j++)if(j!==i){const s=rows[j][i];rows[j]=rows[j].map((v,k)=>v-s*rows[i][k]);}}
 return Array.from({length:16},(_,i)=>rows[i%4][4+Math.floor(i/4)]);
}
export function validReferenceCamera(c){return !!c&&typeof c.epoch==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(c.epoch)&&['matrix','projection'].every(k=>Array.isArray(c[k])&&c[k].length===16&&c[k].every(Number.isFinite));}
// Reconstruct rays from the exact reference image, then intersect the selected plane.
// This preserves the drawn footprint in that image; it does not infer an object's depth.
export function projectReferenceAnnotation(a,reference,origin,normal){
 if(!validReferenceCamera(reference.camera))throw new Error('定位資料無效，請重新選工具繪圖');
 const {rect,camera}=reference;if(!rect||![rect.x,rect.y,rect.w,rect.h].every(Number.isFinite)||rect.w<=0||rect.h<=0)throw new Error('參考圖範圍無效');
 const inverse=inverse4(camera.projection),length=Math.hypot(...normal);if(length<1e-6)throw new Error('未取得實物表面');const n=normal.map(v=>v/length),eye=camera.matrix.slice(12,15);
 const intersect=p=>{const u=(p[0]-rect.x)/rect.w,v=(p[1]-rect.y)/rect.h;if(u<-.001||u>1.001||v<-.001||v>1.001)throw new Error('圈選超出相機影像，請避開兩側空白');const q=mul(inverse,[2*u-1,1-2*v,-1,1]);if(Math.abs(q[3])<1e-9)throw new Error('相機投影無效');const world=mul(camera.matrix,[q[0]/q[3],q[1]/q[3],q[2]/q[3],1]),d=world.slice(0,3).map((v,i)=>v-eye[i]),scale=Math.hypot(...d),ray=d.map(v=>v/scale),denom=dot(ray,n);if(Math.abs(denom)<.025)throw new Error('這個表面與圈選視線太平行，請改選物件正面');const distance=dot(origin.map((v,i)=>v-eye[i]),n)/denom;if(distance<.05||distance>10)throw new Error('指令無法對應這個表面，請重新繪圖並對準目標表面');return eye.map((v,i)=>v+ray[i]*distance+n[i]*.003);};
 const points=a.points.map(intersect),path=shapePath(a.kind,a.points).map(intersect);
 if(path.some(p=>p.some(v=>!Number.isFinite(v)||Math.abs(v)>100))||path.some(p=>Math.hypot(...p.map((v,i)=>v-path[0][i]))>5))throw new Error('定位範圍異常，請重新繪圖並選擇正確表面');
 return {points,path,normal:n};
}

export class ReferenceChunks{
 constructor(id){this.id=id;this.parts=new Map();this.size=0;this.total=null;this.ar=false;}
 accept(m){if(m.id!==this.id||!Number.isInteger(m.total)||m.total<1||m.total>24||!Number.isInteger(m.index)||m.index<0||m.index>=m.total||typeof m.data!=='string'||m.data.length>12000||typeof m.ar!=='boolean')return null;if(this.total!==null&&(this.total!==m.total||this.ar!==m.ar))throw new Error('參考圖傳輸不一致');this.total=m.total;this.ar=m.ar;if(this.parts.has(m.index))return null;this.size+=m.data.length;if(this.size>262144)throw new Error('參考圖過大');this.parts.set(m.index,m.data);if(this.parts.size!==m.total)return null;const url=Array.from({length:m.total},(_,i)=>this.parts.get(i)).join('');if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(url))throw new Error('參考圖格式無效');return {id:this.id,url,ar:this.ar,at:Date.now()};}
}
