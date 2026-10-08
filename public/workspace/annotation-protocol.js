const id=s=>typeof s==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(s);
export const tools=['arrow','circle','line','label'];
export function validAnnotation(a){
 if(!a||!id(a.id)||!id(a.owner)||!id(a.target)||!Number.isSafeInteger(a.revision)||a.revision<1||a.revision>10000||!tools.includes(a.kind)||typeof a.text!=='string'||a.text.length>120||!['manual','ai','catalog'].includes(a.source)||!Array.isArray(a.points)||a.points.length<1||a.points.length>64||!a.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=1)))return false;
 if(a.kind!=='label'&&a.points.length<2)return false;
 if(a.spatial&&(!id(a.spatial.frame)||!Array.isArray(a.spatial.points)||a.spatial.points.length!==a.points.length||!a.spatial.points.every(p=>Array.isArray(p)&&p.length===3&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=100))||!Array.isArray(a.spatial.normal)||a.spatial.normal.length!==3||!a.spatial.normal.every(Number.isFinite)||Math.abs(Math.hypot(...a.spatial.normal)-1)>.02))return false;
 return true;
}
export function acceptAnnotation(list,a){if(!validAnnotation(a))return false;const index=list.findIndex(i=>i.id===a.id);if(index>=0){const old=list[index];if(a.owner!==old.owner||a.target!==old.target||a.revision<=old.revision)return false;list[index]=a;}else{if(list.length>=64)return false;list.push(a);}return true;}
export function shapePath(kind,points){
 if(kind==='label')return points;
 if(kind==='circle'){const a=points[0],b=points.at(-1),cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2,rx=Math.abs(a[0]-b[0])/2,ry=Math.abs(a[1]-b[1])/2;return Array.from({length:33},(_,i)=>[cx+rx*Math.cos(i*Math.PI/16),cy+ry*Math.sin(i*Math.PI/16)]);}
 if(kind==='arrow'){const a=points[0],b=points.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),size=Math.min(.035,len*.3);if(len<1e-6)return [a,b];const ux=dx/len,uy=dy/len;return [a,b,[b[0]-ux*size-uy*size*.55,b[1]-uy*size+ux*size*.55],b,[b[0]-ux*size+uy*size*.55,b[1]-uy*size-ux*size*.55]];}
 return points;
}
// Place a screen instruction on a surface chosen by the onsite worker. No inferred depth.
export function placeOnSurface(a,origin,normal,rightHint){
 const dot=(x,y)=>x.reduce((s,v,i)=>s+v*y[i],0),unit=x=>{const l=Math.hypot(...x);if(l<1e-5)throw new Error('請換一個角度對準表面。');return x.map(v=>v/l);},cross=(x,y)=>[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
 const n=unit(normal),right=unit(rightHint.map((v,i)=>v-dot(rightHint,n)*n[i])),up=unit(cross(n,right));const anchor=a.kind==='arrow'?a.points.at(-1):a.points[0],xs=a.points.map(p=>p[0]),ys=a.points.map(p=>p[1]),extent=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),.1),scale=.25/extent;
 return {normal:n,points:a.points.map(p=>origin.map((v,i)=>v+right[i]*(p[0]-anchor[0])*scale-up[i]*(p[1]-anchor[1])*scale+n[i]*.006))};
}
export function spatialPath(a){
 const p=a.spatial.points,n=a.spatial.normal,sub=(x,y)=>x.map((v,i)=>v-y[i]),add=(x,y)=>x.map((v,i)=>v+y[i]),scale=(x,s)=>x.map(v=>v*s),cross=(x,y)=>[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]],unit=x=>scale(x,1/(Math.hypot(...x)||1));
 if(a.kind==='label'||a.kind==='line')return p;
 const first=p[0],last=p.at(-1),delta=sub(last,first),length=Math.hypot(...delta);
 if(a.kind==='arrow'){const u=unit(delta),side=unit(cross(n,u)),back=add(last,scale(u,-Math.min(.06,length*.3)));return [first,last,add(back,scale(side,.03)),last,add(back,scale(side,-.03))];}
 const center=scale(add(first,last),.5),u=unit(delta),v=unit(cross(n,u));return Array.from({length:33},(_,i)=>add(center,add(scale(u,length*.5*Math.cos(i*Math.PI/16)),scale(v,length*.5*Math.sin(i*Math.PI/16)))));
}
