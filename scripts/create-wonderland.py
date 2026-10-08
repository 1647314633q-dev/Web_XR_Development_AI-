"""Generate an editable Wonderland scene from the installed engine's primitive template."""
import json, math, copy
from pathlib import Path
root = Path(__file__).resolve().parent.parent
template = Path(r'C:\Program Files\Wonderland\WonderlandEngine\templates\default-scene\DefaultScene.wlp')
scene = json.loads(template.read_text(encoding='utf-8'))
scene['objects'] = {
 '76': {'name':'Player','translation':[0,1.9,5.5]},
 '77': {'name':'NonVrCamera','parent':'76','rotation':[math.sin(-.06),0,0,math.cos(-.06)],'components':[{'type':'view','view':{'fov':65.0}}]},
 '78': {'name':'EyeLeft','parent':'76','components':[{'type':'view'},{'type':'input','input':{'type':'eye left'}}]},
 '79': {'name':'EyeRight','parent':'76','components':[{'type':'view'},{'type':'input','input':{'type':'eye right'}}]},
 '90': {'name':'InspectionRoot'},
 '91': {'name':'InspectionLight','translation':[0,5,4],'rotation':[-.35,0,0,.937],'components':[{'type':'light','light':{'type':'point','intensity':40.0}}]},
}
palette={'100':('Floor',[.31,.40,.35]),'101':('Rack',[.13,.27,.24]),'102':('Cardboard',[.66,.49,.29]),'103':('Tape',[.81,.71,.50]),'104':('Labels',[.91,.94,.85]),'105':('Marker',[.38,.83,.62]),'106':('Wall',[.61,.69,.57]),'107':('Warning',[.94,.67,.30])}
for key,(name,color) in palette.items():
 scene['materials'][key]={'name':name,'pipeline':'37','Phong':{'diffuseColor':color+[1],'ambientColor':[.1,.1,.1,1],'emissiveColor':[v*.65 for v in color]+[1],'specularColor':[0,0,0,1],'shininess':1}}
next_id=120
def mesh(name,position,scale,material='102',kind='p1',parent='90'):
 global next_id
 key=str(next_id);next_id+=1
 scene['objects'][key]={'name':name,'parent':parent,'translation':position,'scaling':scale,'components':[{'type':'mesh','mesh':{'mesh':kind,'material':material}}]}
 return key
mesh('Floor',[0,-.10,-1.5],[3.8,.10,3.2],'100')
mesh('BackWall',[0,1.6,-4.4],[3.8,1.7,.08],'106')
for rack_x in [-2.4,2.4]:
 for x in [rack_x-.7,rack_x+.7]:
  for z in [-3.6,-2.3]:mesh('RackPost',[x,1.3,z],[.035,1.3,.035],'101')
 for y in [.15,1.1,2.1]:
  mesh('RackShelf',[rack_x,y,-2.95],[.8,.035,.7],'101')
  for col in [-.43,.43]:mesh('RackCarton',[rack_x+col,y+.30,-2.95],[.32,.26,.40])
mesh('Pallet',[0,.09,-1.4],[1.15,.09,.73],'101')
for x in [-.80,-.4,0,.4,.8]:mesh('PalletSlat',[x,.22,-1.4],[.16,.055,.74],'103')
for name,pos,scale in [('VL-2048',[-.50,.73,-1.4],[.53,.45,.52]),('VL-2051',[.64,.61,-1.4],[.47,.34,.50]),('VL-2048-Upper',[-.47,1.43,-1.4],[.42,.25,.46])]:
 mesh(name,pos,scale)
 mesh(name+'-Tape',[pos[0],pos[1],pos[2]+scale[2]+.006],[.065,scale[1],.008],'103')
 mesh(name+'-Label',[pos[0]-.23,pos[1]+.06,pos[2]+scale[2]+.018],[.17,.10,.008],'104')
 for i in range(9):mesh('Barcode',[pos[0]-.34+i*.026,pos[1]+.06,pos[2]+scale[2]+.029],[.006,.065,.004],'101')
mesh('AttentionMarker',[.7,1,-.87],[.07,.07,.07],'107','p2')
scene['materials']['108']={'name':'SharedVideoMaterial','pipeline':'35','Flat':{'color':[1,1,1,1]}}
mesh('SharedVideoPlane',[0,1.3,.4],[1.6,.9,1],'108','p0')
scene['settings']['project']['name']='VisionLink'
scene['settings']['scripting']['application']['output']='VisionLink-app.js'
scene['settings']['scripting']['components']['output']='VisionLink-bundle.js'
scene['settings']['rendering']['hdr']['exposure']=1.1
scene['settings']['rendering']['clearColor']=[0,0,0,0]
scene['settings']['rendering']['sky']['enabled']=False
scene['settings']['runtime']['clearColor']=[.08,.18,.17,0]
scene['settings']['scripting']['sourcePaths']=['js']
out=root/'wonderland'/'VisionLink.wlp';out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(scene,ensure_ascii=False,indent=2),encoding='utf-8')
print('Created Wonderland project:',out)
