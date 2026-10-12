// Apple mobile browsers can lack the DOM/canvas path MediaPipe expects in a worker.
// Keep inference local, using an HTML canvas in the page for these devices.
export const isVisionMode=mode=>mode==='objects'||mode==='faces';
export function isAppleMobile(nav=globalThis.navigator){
 return /iPad|iPhone|iPod/i.test(`${nav?.platform||''} ${nav?.userAgent||''}`)||(/Mac/i.test(nav?.platform||'')&&nav?.maxTouchPoints>1);
}
export function isVisionContextError(message){return /document|offscreen|canvas|webgl/i.test(String(message));}
let initializationQueue=Promise.resolve();
async function loadDetector(mode,canvas){
 const {FilesetResolver,ObjectDetector,FaceDetector}=await import('./vendor/mediapipe/vision_bundle.mjs');
 // The page uses the classic WASM loader, which MediaPipe inserts as a script.
 const vision=await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',import.meta.url).href);
 return (mode==='faces'?FaceDetector:ObjectDetector).createFromOptions(vision,{
  canvas,baseOptions:{modelAssetPath:new URL(`./vendor/mediapipe/models/${mode==='faces'?'face-detector':'object-detector'}.tflite`,import.meta.url).href,delegate:'CPU'},
  runningMode:'VIDEO',...(mode==='faces'?{minDetectionConfidence:.5}:{scoreThreshold:.5,maxResults:6})
 });
}
export class MainVisionClient{
 constructor({load=loadDetector,makeCanvas=()=>document.createElement('canvas'),now=()=>performance.now()}={}){
  this.mainThread=true;this.load=load;this.makeCanvas=makeCanvas;this.now=now;this.closed=false;this.detector=null;this.onmessage=null;this.onerror=null;
 }
 emit(data){if(!this.closed)this.onmessage?.({data});}
 postMessage(data){
  if(this.closed){data.bitmap?.close();return;}
  if(data.type==='init'){
   this.mode=data.mode;
   const initialize=async()=>{
    if(this.closed)return;
    try{
     this.graphics=this.makeCanvas();this.graphics.width=this.graphics.height=1;
     this.input=this.makeCanvas();this.context=this.input.getContext('2d',{willReadFrequently:true});
     if(!this.context)throw new Error('此裝置無法建立影像分析畫布。');
     const detector=await this.load(this.mode,this.graphics);
     if(this.closed){detector.close();return;}
     this.detector=detector;this.emit({type:'ready',mode:this.mode});
    }catch(e){this.emit({type:'error',message:e.message});}
   };
   initializationQueue=initializationQueue.then(initialize,initialize);this.initialization=initializationQueue;
  }else if(data.type==='frame'){
   try{
    if(!this.detector)return;
    const begin=this.now(),width=data.bitmap.width,height=data.bitmap.height;
    this.input.width=width;this.input.height=height;this.context.drawImage(data.bitmap,0,0);
    const detections=this.detector.detectForVideo(this.input,data.timestamp).detections.map(d=>({box:d.boundingBox,label:this.mode==='faces'?'人臉':d.categories[0]?.categoryName||'物件',score:d.categories[0]?.score||0}));
    this.emit({type:'result',detections,width,height,ms:Math.round(this.now()-begin)});
   }catch(e){this.emit({type:'error',message:e.message});}finally{data.bitmap.close();}
  }
 }
 terminate(){this.closed=true;this.detector?.close();this.detector=null;if(this.input)this.input.width=this.input.height=0;if(this.graphics)this.graphics.width=this.graphics.height=0;}
}
export function createVisionClient(mode,{forceMain=false,nav=globalThis.navigator,WorkerClass=globalThis.Worker,mainFactory=()=>new MainVisionClient()}={}){
 if(isVisionMode(mode)&&(forceMain||isAppleMobile(nav)))return mainFactory();
 return new WorkerClass('vision-worker.js',{type:'module'});
}
