import {inspectionRegion,normalizedRGB,classScores} from './damage-input.js';
let detector=null,mode=null,zxing=null,ort=null,damageCard=null;
self.onmessage=async({data})=>{
 if(data.type==='init'){
  try{detector?.close?.();mode=data.mode;
   if(mode==='barcode'){zxing=await import('./vendor/zxing.mjs');detector=new zxing.MultiFormatReader();}
   else if(mode==='damage'){
    ort=await import('./vendor/ort/ort.wasm.min.mjs');ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=new URL('./vendor/ort/',self.location.href).href;
    const cardResponse=await fetch(new URL('./vendor/damage/model-card.json',self.location.href));if(!cardResponse.ok)throw new Error('損傷模型報告未能載入');damageCard=await cardResponse.json();
    const response=await fetch(new URL('./vendor/damage/model.onnx',self.location.href));if(!response.ok)throw new Error('損傷模型未能載入');const bytes=await response.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==damageCard.sha256)throw new Error('損傷模型校驗失敗');
    detector=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
   }else{const {FilesetResolver,ObjectDetector,FaceDetector}=await import('./vendor/mediapipe/vision_bundle.mjs');const vision=await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',self.location.href).href,true);const options={baseOptions:{modelAssetPath:new URL(`./vendor/mediapipe/models/${mode==='faces'?'face-detector':'object-detector'}.tflite`,self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',...(mode==='faces'?{minDetectionConfidence:.5}:{scoreThreshold:.5,maxResults:6})};detector=await(mode==='faces'?FaceDetector:ObjectDetector).createFromOptions(vision,options);}
   self.postMessage({type:'ready',mode});
  }catch(e){self.postMessage({type:'error',message:e.message});}
 }else if(data.type==='frame'){
  try{if(!detector)return;const begin=performance.now(),width=data.bitmap.width,height=data.bitmap.height;let detections=[];
   if(mode==='barcode'){const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(data.bitmap,0,0);const pixels=ctx.getImageData(0,0,width,height).data,gray=new Uint8ClampedArray(width*height);for(let i=0;i<gray.length;i++)gray[i]=(pixels[i*4]+2*pixels[i*4+1]+pixels[i*4+2])/4;try{const result=detector.decode(new zxing.BinaryBitmap(new zxing.HybridBinarizer(new zxing.RGBLuminanceSource(gray,width,height))));const points=result.getResultPoints()||[],xs=points.map(p=>p.getX()),ys=points.map(p=>p.getY()),x=xs.length?Math.min(...xs):0,y=ys.length?Math.min(...ys):0;detections=[{label:result.getText(),score:'條碼',box:{originX:x,originY:y,width:xs.length?Math.max(...xs)-x:width,height:ys.length?Math.max(...ys)-y:height}}];}catch{/* No readable barcode in this frame. */}finally{detector.reset();}}
   else if(mode==='damage'){
    const box=inspectionRegion(width,height,data.scope),canvas=new OffscreenCanvas(160,160),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(data.bitmap,box.originX,box.originY,box.width,box.height,0,0,160,160);const input=normalizedRGB(ctx.getImageData(0,0,160,160).data),result=await detector.run({image:new ort.Tensor('float32',input,[1,3,160,160])}),scores=classScores(result.logits.data),best=scores.indexOf(Math.max(...scores)),confident=scores[best]>=damageCard.threshold;
    detections=[{box,label:confident?'疑似'+damageCard.labels[best]:'無法確定 · 請人工覆核',score:scores[best],warning:true}];
   }else detections=detector.detectForVideo(data.bitmap,data.timestamp).detections.map(d=>({box:d.boundingBox,label:mode==='faces'?'人臉':d.categories[0].categoryName,score:d.categories[0].score}));
   self.postMessage({type:'result',detections,width,height,ms:Math.round(performance.now()-begin)});
  }catch(e){self.postMessage({type:'error',message:e.message});}finally{data.bitmap.close();}
 }
};
