// Right handed metres: +X right, +Y up, -Z towards the third reference point.
const sub=(a,b)=>a.map((n,i)=>n-b[i]);
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(a)=>{const l=Math.hypot(...a);if(l<1e-6)throw new Error('參考點重疊');return a.map(n=>n/l);};
function point(p){if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw new Error('無效參考點');}
export function calibrate(origin,right,forward){
 [origin,right,forward].forEach(point);
 const a=sub(right,origin),b=sub(forward,origin),lengths=[Math.hypot(...a),Math.hypot(...b)];
 if(lengths.some(l=>l<.15||l>10))throw new Error('參考點間距須為 0.15 至 10 公尺');
 const x=unit(a),angle=Math.abs(dot(x,unit(b)));
 if(angle>.5)throw new Error('右方與前方參考點應接近直角（60° 至 120°）');
 const y=unit(cross(unit(b.map(n=>-n)),x)),z=unit(cross(x,y));
 if(y[1]<.5)throw new Error('請在水平面按原點、右方、前方的順序設定');
 return {origin:[...origin],x,y,z,lengths};
}
export function calibrateOrigin(origin,forward){
 [origin,forward].forEach(point);
 const length=Math.hypot(forward[0],forward[2]);
 if(length<.1)throw new Error('請稍微抬起手機、向桌面前方對準，讓工作區方向可辨識');
 const f=[forward[0]/length,0,forward[2]/length],right=[-f[2],0,f[0]];
 const frame=calibrate(origin,origin.map((n,i)=>n+right[i]*.5),origin.map((n,i)=>n+f[i]*.5));
 return {...frame,method:'single-point'};
}
export function toShared(frame,world){point(world);const d=sub(world,frame.origin);return [dot(d,frame.x),dot(d,frame.y),dot(d,frame.z)];}
export function fromShared(frame,p){point(p);return frame.origin.map((n,i)=>n+frame.x[i]*p[0]+frame.y[i]*p[1]+frame.z[i]*p[2]);}
export function directionToShared(frame,v){return unit([dot(v,frame.x),dot(v,frame.y),dot(v,frame.z)]);}
export function projectPoint(position,viewMatrix,projection){
 const mul=(m,v)=>[0,1,2,3].map(r=>m[r]*v[0]+m[4+r]*v[1]+m[8+r]*v[2]+m[12+r]*v[3]);
 const p=mul(projection,mul(viewMatrix,[...position,1]));
 if(p[3]<=0)return null;const x=p[0]/p[3],y=p[1]/p[3],z=p[2]/p[3];
 return Math.abs(x)<=1&&Math.abs(y)<=1&&z>=-1&&z<=1?{x:(x+1)/2,y:(1-y)/2}:null;
}
