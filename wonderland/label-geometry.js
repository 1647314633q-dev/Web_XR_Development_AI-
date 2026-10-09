// Canvas textures are flipped once by Wonderland's HTML-canvas uploader.
// Bottom-left uses UV (0,0); both faces keep the same corner-to-UV mapping.
const triangles=[0,1,2,2,1,3,2,1,0,3,1,2];
export const labelUV=triangles.flatMap(i=>[[0,0],[0,1],[1,0],[1,1]][i]);
export function labelQuad(center,matrix){
 const right=matrix?[matrix[0],matrix[1],matrix[2]]:[1,0,0];
 const up=matrix?[matrix[4],matrix[5],matrix[6]]:[0,1,0];
 const distance=matrix?Math.hypot(center[0]-matrix[12],center[1]-matrix[13],center[2]-matrix[14]):1;
 const width=Math.min(.18,Math.max(.015,distance*.22)),height=width/4;
 const corners=[[0,.01],[0,.01+height],[width,.01],[width,.01+height]].map(([x,y])=>center.map((v,i)=>v+right[i]*x+up[i]*y));
 return triangles.flatMap(i=>corners[i]);
}
