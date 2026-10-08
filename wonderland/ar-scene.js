// Object3D.active affects only that object's components, not its descendants.
// Keep the real-world AR layer clear and preserve disabled preview components.
export class ARSceneVisibility {
 constructor(scene,root){this.scene=scene;this.root=root;this.saved=null;}
 enter(){
  if(this.saved)return;
  this.saved=[];
  const objects=[this.root];
  while(objects.length){const object=objects.pop();objects.push(...object.children);for(const component of object.getComponents()){this.saved.push([component,component.active]);component.active=false;}}
  this.scene.clearColor=[0,0,0,0];
 }
 leave(){
  if(!this.saved)return;
  for(const [component,active] of this.saved)if(!component.isDestroyed)component.active=active;
  this.saved=null;this.scene.clearColor=[0,0,0,0];
 }
}
