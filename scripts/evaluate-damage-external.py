"""Evaluate publisher-supplied extra images, after weight selection; never train here."""
from pathlib import Path
import hashlib,json,time
import numpy as np
from PIL import Image,ImageOps
import torch
from torch import nn
from torchvision import models,transforms
torch.set_num_threads(4)
base=models.mobilenet_v3_small(weights=None)
class Network(nn.Module):
 def __init__(self):
  super().__init__();self.features=base.features;self.pool=nn.AdaptiveAvgPool2d(1);self.head=nn.Sequential(nn.Linear(576,128),nn.ReLU(),nn.Dropout(.25),nn.Linear(128,4))
 def forward(self,x):return self.head(self.pool(self.features(x)).flatten(1))
net=Network().eval();net.load_state_dict(torch.load('.local-data/damage/checkpoint.pt',weights_only=True)['state_dict'])
norm=transforms.Compose([transforms.Resize((160,160)),transforms.ToTensor(),transforms.Normalize([.485,.456,.406],[.229,.224,.225])])
def dhash(image):
 a=np.array(image.convert('L').resize((9,8)));return int.from_bytes(np.packbits(a[:,1:]>a[:,:-1]).tobytes(),'big')
audit=json.loads(Path('.local-data/damage/audit.json').read_text(encoding='utf-8'));known=[];root=Path('.local-data/damage/data/box_defect_dataset/box_defect_dataset/real')
for r in audit['retained_images']:
 with Image.open(root/r['file']) as im:known.append((r['sha'],dhash(ImageOps.exif_transpose(im).convert('RGB'))))
external=Path('.local-data/damage/data/Dataset_extendido/Dataset_extendido_publicable');cm=np.zeros((4,4),dtype=int);skipped=0;images=0;predictions=[]
for f in sorted((external/'images/test').glob('*')):
 with Image.open(f) as raw:im=ImageOps.exif_transpose(raw).convert('RGB')
 sha=hashlib.sha256(im.tobytes()).hexdigest();dh=dhash(im)
 if any(h==sha or (d^dh).bit_count()<=3 for h,d in known):skipped+=1;continue
 images+=1
 for i,line in enumerate((external/'labels/test'/(f.stem+'.txt')).read_text().splitlines()):
  k,cx,cy,w,h=map(float,line.split());k=int(k);iw,ih=im.size;size=min(max(w*iw,h*ih)*1.2,iw,ih);left=max(0,min(iw-size,cx*iw-size/2));top=max(0,min(ih-size,cy*ih-size/2));patch=im.crop(tuple(round(n) for n in [left,top,left+size,top+size]));
  if min(patch.size)<8:continue
  with torch.no_grad():p=net(norm(patch).unsqueeze(0)).softmax(1).numpy()[0]
  pred=int(p.argmax());cm[k,pred]+=1;predictions.append({'file':f.name,'patch':i,'label':k,'predicted':pred,'score':float(p.max())})
precision=np.diag(cm)/np.maximum(cm.sum(0),1);recall=np.diag(cm)/np.maximum(cm.sum(1),1);f1=2*precision*recall/np.maximum(precision+recall,1e-10)
card_path=Path('public/workspace/vendor/damage/model-card.json');card=json.loads(card_path.read_text(encoding='utf-8'))
result={'source_subset':'Dataset_extendido_publicable/images/test (same licensed publisher archive)','images_after_duplicate_filter':images,'excluded_overlap_images':skipped,'patches':int(cm.sum()),'accuracy':float(np.trace(cm)/cm.sum()) if cm.sum() else None,'macro_f1':float(f1.mean()),'confusion_matrix':cm.tolist(),'per_class':[{'label':card['labels'][i],'n':int(cm[i].sum()),'precision':float(precision[i]),'recall':float(recall[i])} for i in range(4)],'limitations':'Different images after exact/near duplicate checks; physical box identities and independently acquired Hong Kong conditions remain unknown. No parameters selected on this subset.'}
card['additional_evaluation']=result;card_path.write_text(json.dumps(card,ensure_ascii=False,indent=2),encoding='utf-8');Path('.local-data/damage/external-predictions.json').write_text(json.dumps(predictions,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=True,indent=2))
