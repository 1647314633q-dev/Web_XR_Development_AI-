"""Local, reproducible patch classification; never a pass/fail acceptance detector.
Source: ivannuke/defective-box-detection-real-vs-synthetic, CC BY-SA 4.0.
Only real images and the publisher's train/valid/test split are used.
Python 3.12, torch 2.8.0 CPU, torchvision 0.23.0, ONNX 1.17, ORT 1.20.1.
"""
import argparse,copy,hashlib,json,random,time
from pathlib import Path
from collections import Counter
import numpy as np
from PIL import Image,ImageOps
import torch
from torch import nn
from torchvision import models,transforms

SEED=20261007
random.seed(SEED);np.random.seed(SEED);torch.manual_seed(SEED);torch.set_num_threads(4)
p=argparse.ArgumentParser();p.add_argument('--data',required=True);p.add_argument('--output',default='public/workspace/vendor/damage');args=p.parse_args()
root=Path(args.data);out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
labels=['膠帶翹起／多餘','破洞／撕裂','壓凹／變形','包膜撕裂']
def dhash(image):
 a=np.array(image.convert('L').resize((9,8)));bits=a[:,1:]>a[:,:-1]
 return int.from_bytes(np.packbits(bits).tobytes(),'big')
rows={};hashes={};removed=[];retained=[]
# Holdout has precedence. Exact decoded-pixel and near-image duplicates cannot enter training.
for split in ['test','valid','train']:
 rows[split]=[];same_ids={}
 for file in sorted((root/'images'/split).glob('*')):
  if file.suffix.lower() not in ['.jpg','.png','.jpeg']:continue
  with Image.open(file) as raw:image=ImageOps.exif_transpose(raw).convert('RGB')
  digest=hashlib.sha256(image.tobytes()).hexdigest();dh=dhash(image)
  dup=next((r for r in retained if r['sha']==digest or (r['dhash']^dh).bit_count()<=3),None)
  if dup:
   removed.append({'file':str(file.relative_to(root)),'duplicate_of':dup['file']});continue
  retained.append({'file':str(file.relative_to(root)),'sha':digest,'dhash':dh,'split':split})
  label_file=root/'labels'/split/(file.stem+'.txt')
  for i,line in enumerate(label_file.read_text().splitlines()):
   cls,cx,cy,w,h=map(float,line.split());cls=int(cls)
   if cls not in range(4) or w<=0 or h<=0:raise ValueError('Invalid label')
   # Match the browser's square inspection scope; include 10% context on each side.
   iw,ih=image.size;size=min(max(w*iw,h*ih)*1.2,iw,ih);left=max(0,min(iw-size,cx*iw-size/2));top=max(0,min(ih-size,cy*ih-size/2));rect=(left,top,left+size,top+size)
   crop=image.crop(tuple(map(round,rect)))
   if min(crop.size)<8:continue
   rows[split].append({'image':crop,'label':cls,'id':f'{file.stem}:{i}','source':str(file.relative_to(root))})
print('Real patch counts', {s:dict(Counter(r['label'] for r in rs)) for s,rs in rows.items()},'removed images',len(removed),flush=True)
if any(not rows[s] or set(r['label'] for r in rows[s])!=set(range(4)) for s in rows):raise ValueError('Every split needs all four classes')
base=models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
class Network(nn.Module):
 def __init__(self):
  super().__init__();self.features=base.features;self.pool=nn.AdaptiveAvgPool2d(1);self.head=nn.Sequential(nn.Linear(576,128),nn.ReLU(),nn.Dropout(.25),nn.Linear(128,4))
 def forward(self,x):return self.head(self.pool(self.features(x)).flatten(1))
net=Network().eval();net.features.requires_grad_(False)
norm=transforms.Compose([transforms.Resize((160,160)),transforms.ToTensor(),transforms.Normalize([.485,.456,.406],[.229,.224,.225])])
augment=transforms.Compose([transforms.RandomHorizontalFlip(),transforms.RandomRotation(8),transforms.ColorJitter(brightness=.15,contrast=.15,saturation=.1),norm])
def features(rs,views):
 fs=[];ys=[]
 with torch.no_grad():
  for view in range(views):
   for start in range(0,len(rs),32):
    batch=rs[start:start+32];x=torch.stack([(norm if view==0 else augment)(r['image']) for r in batch]);fs.append(net.pool(net.features(x)).flatten(1));ys.extend(r['label'] for r in batch)
 return torch.cat(fs),torch.tensor(ys)
xf,yf=features(rows['train'],3);xv,yv=features(rows['valid'],1);xt,yt=features(rows['test'],1)
def metric(y,pred):
 cm=np.zeros((4,4),dtype=int)
 for a,b in zip(y,pred):cm[int(a),int(b)]+=1
 precision=np.diag(cm)/np.maximum(cm.sum(0),1);recall=np.diag(cm)/np.maximum(cm.sum(1),1);f1=2*precision*recall/np.maximum(precision+recall,1e-10)
 return {'accuracy':float(np.trace(cm)/cm.sum()),'macro_f1':float(f1.mean()),'confusion_matrix':cm.tolist(),'per_class':[{'label':labels[i],'n':int(cm[i].sum()),'precision':float(precision[i]),'recall':float(recall[i]),'f1':float(f1[i])} for i in range(4)]}
count=torch.bincount(yf,minlength=4);loss=nn.CrossEntropyLoss(weight=1/count.float().sqrt());optim=torch.optim.AdamW(net.head.parameters(),lr=.002,weight_decay=.01)
best=-1;best_state=None;best_epoch=0
for epoch in range(160):
 net.head.train();order=torch.randperm(len(xf))
 for idx in order.split(64):
  optim.zero_grad();err=loss(net.head(xf[idx]),yf[idx]);err.backward();optim.step()
 net.head.eval()
 with torch.no_grad():scores=net.head(xv);m=metric(yv.numpy(),scores.argmax(1).numpy())
 if m['macro_f1']>best:best=m['macro_f1'];best_state=copy.deepcopy(net.head.state_dict());best_epoch=epoch+1
 if (epoch+1)%20==0:print('Epoch',epoch+1,'val F1',round(m['macro_f1'],4),'best',round(best,4),flush=True)
net.head.load_state_dict(best_state);net.eval()
# Predeclared second candidate: adapt the last three backbone blocks. Select on
# validation macro F1 only; neither test patches nor external images select weights.
best_full=copy.deepcopy(net.state_dict());prefix=net.features[:-3];tail=net.features[-3:];tail.requires_grad_(True)
def maps(rs,views):
 fs=[];ys=[]
 with torch.no_grad():
  for view in range(views):
   for start in range(0,len(rs),32):
    batch=rs[start:start+32];x=torch.stack([(norm if view==0 else augment)(r['image']) for r in batch]);fs.append(prefix(x));ys.extend(r['label'] for r in batch)
 return torch.cat(fs),torch.tensor(ys)
mx,my=maps(rows['train'],3);mv,mvy=maps(rows['valid'],1);adapted=False
adapt=torch.optim.AdamW([*tail.parameters(),*net.head.parameters()],lr=.00015,weight_decay=.01)
for epoch in range(12):
 net.features.eval();net.head.train();order=torch.randperm(len(mx))
 for idx in order.split(64):
  adapt.zero_grad();logits=net.head(net.pool(tail(mx[idx])).flatten(1));err=loss(logits,my[idx]);err.backward();adapt.step()
 net.eval()
 with torch.no_grad():candidate=net.head(net.pool(tail(mv)).flatten(1));m=metric(mvy.numpy(),candidate.argmax(1).numpy())
 if m['macro_f1']>best:best=m['macro_f1'];best_full=copy.deepcopy(net.state_dict());best_epoch='adaptation-'+str(epoch+1);adapted=True
 print('Adaptation epoch',epoch+1,'val F1',round(m['macro_f1'],4),'selected',round(best,4),flush=True)
net.load_state_dict(best_full);net.eval()
xv,yv=features(rows['valid'],1);xt,yt=features(rows['test'],1)
with torch.no_grad():vp=net.head(xv).softmax(1).numpy();tp=net.head(xt).softmax(1).numpy()
# Threshold selected using validation only. Uncertain means manual inspection, never intact.
threshold=.8
for value in np.arange(.6,.96,.05):
 selected=vp.max(1)>=value
 if selected.sum()>=20 and (vp.argmax(1)[selected]==yv.numpy()[selected]).mean()>=.9:threshold=float(round(value,2));break
test_metrics=metric(yt.numpy(),tp.argmax(1));selected=tp.max(1)>=threshold
test_metrics['confident_coverage']=float(selected.mean());test_metrics['confident_accuracy']=float((tp.argmax(1)[selected]==yt.numpy()[selected]).mean()) if selected.any() else None
torch.save({'state_dict':net.state_dict(),'seed':SEED,'labels':labels},Path('.local-data/damage/checkpoint.pt'))
dummy=norm(rows['test'][0]['image']).unsqueeze(0)
torch.onnx.export(net,dummy,str(out/'model.onnx'),opset_version=17,input_names=['image'],output_names=['logits'],dynamo=False,external_data=False)
import onnxruntime as ort
opts=ort.SessionOptions();opts.intra_op_num_threads=4;session=ort.InferenceSession(str(out/'model.onnx'),opts,providers=['CPUExecutionProvider']);times=[];max_error=0
for r in rows['test'][:20]:
 x=norm(r['image']).unsqueeze(0)
 with torch.no_grad():expected=net(x).numpy()
 started=time.perf_counter();actual=session.run(None,{'image':x.numpy()})[0];times.append((time.perf_counter()-started)*1000);max_error=max(max_error,float(abs(expected-actual).max()))
assert max_error<.001, f'ONNX parity failed: {max_error}'
digest=hashlib.sha256((out/'model.onnx').read_bytes()).hexdigest()
report={'version':'visionlink-damage-patch-v1','created':'2026-10-07','purpose':'Experimental classification of a user-centred suspected defect patch. Not whole-box inspection, damage localization, or acceptance certification.','architecture':'ImageNet MobileNetV3-small frozen backbone, locally trained 576→128→4 head','input':{'width':160,'height':160,'layout':'NCHW','rgb':True,'mean':[.485,.456,.406],'std':[.229,.224,.225]},'labels':labels,'threshold':threshold,'seed':SEED,'best_epoch':best_epoch,'source':{'url':'https://www.kaggle.com/datasets/ivannuke/defective-box-detection-real-vs-synthetic','author':'ivannuke','license':'CC BY-SA 4.0','license_url':'https://creativecommons.org/licenses/by-sa/4.0/','subset':'real only; publisher train/valid/test; annotation crops with 10% context'},'split_counts':{s:{labels[i]:sum(r['label']==i for r in rs) for i in range(4)} for s,rs in rows.items()},'duplicate_audit':{'method':'decoded-pixel SHA256 and 64-bit dHash Hamming distance ≤3, holdout precedence','removed_images':len(removed),'physical_box_ids':'Not supplied by publisher; image-level holdout does not establish independent physical-box or Hong Kong field performance.'},'validation':metric(yv.numpy(),vp.argmax(1)),'test':test_metrics,'onnx_parity_max_abs_error':max_error,'cpu_inference_median_ms':float(np.median(times)),'sha256':digest,'model_bytes':(out/'model.onnx').stat().st_size,'limitations':['No intact class and no out-of-distribution rejection guarantee. Do not infer intact from no detection.','Small tear/puncture test class; no field acceptance calibration.','Classifies the selected region; the displayed frame is inspection scope, not a predicted damage boundary.','No private user photos used or deployed.'],'backbone_source':'https://pytorch.org/vision/stable/models/generated/torchvision.models.mobilenet_v3_small.html','weights_license':'CC BY-SA 4.0 for the trained derivative; torchvision software BSD-3-Clause'}
report['architecture']='ImageNet MobileNetV3-small, locally trained 576→128→4 head'+(' and final three backbone blocks' if adapted else ' (frozen backbone)')
report['selection']='Two candidates selected solely by validation macro F1: classifier head and up to 12 epochs adapting final three backbone blocks. Test feedback was used to fix square preprocessing, so the publisher test split is a development holdout, not an untouched certification set.'
report['source']['subset']='real only; publisher train/valid/test; square annotation-centred scope with 10% context'
(out/'model-card.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'ATTRIBUTION.txt').write_text('VisionLink damage patch classifier v1\nTraining data: Package Defect Detection Benchmark by ivannuke\nhttps://www.kaggle.com/datasets/ivannuke/defective-box-detection-real-vs-synthetic\nData and trained derivative: CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/\nChanges: real annotation crops, duplicate filtering, MobileNetV3 transfer features, trained classifier head.\nBackbone: torchvision MobileNetV3-small ImageNet1K_V1, torchvision BSD-3-Clause.\nModel is experimental and is not a whole-box acceptance detector.\n',encoding='utf-8')
audit={'retained_images':[{k:v for k,v in r.items() if k!='dhash'} for r in retained],'removed_images':removed,'patches':{s:[{k:v for k,v in r.items() if k!='image'} for r in rs] for s,rs in rows.items()}}
Path('.local-data/damage/audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'test':test_metrics,'threshold':threshold,'onnx_error':max_error,'bytes':report['model_bytes']},ensure_ascii=True,indent=2),flush=True)
