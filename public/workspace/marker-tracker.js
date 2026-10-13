import {AR} from './vendor/aruco/detector.js';
import {MARKER_ID,validCorners} from './marker-geometry.js';
export class MarkerTracker {
 constructor(){this.detector=new AR.Detector({dictionaryName:'ARUCO_MIP_36h12',maxHammingDistance:2});this.reset();}
 reset(){this.previous=null;this.streak=0;}
 detect(image){
  const matches=this.detector.detect(image).filter(m=>m.id===MARKER_ID&&m.hammingDistance<=1);
  if(matches.length!==1){this.reset();return null;}
  const corners=matches[0].corners.map(p=>[p.x/image.width,p.y/image.height]);
  if(!validCorners(corners)||corners.some((p,i)=>Math.hypot(p[0]-corners[(i+1)%4][0],p[1]-corners[(i+1)%4][1])<.04)){this.reset();return null;}
  const stable=this.previous&&corners.every((p,i)=>Math.hypot(p[0]-this.previous[i][0],p[1]-this.previous[i][1])<.06);
  this.streak=stable?this.streak+1:1;this.previous=corners;
  return this.streak>=3?corners:null;
 }
}
