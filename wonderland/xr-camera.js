// Raw Camera Access is optional. Native passthrough is not contained in canvas.captureStream().
// We read only a permission-granted XR camera texture into our own framebuffer.
export class XRCameraCapture {
 constructor(session,canvas,binding=null){this.session=session;this.gl=canvas.getContext('webgl2');this.binding=binding||new XRWebGLBinding(session,this.gl);this.resources=null;this.last=0;this.busy=false;this.ended=false;session.addEventListener('end',()=>{this.ended=true;this.destroy();},{once:true});}
 capture(frame,view,points,onFrame){
  if(this.ended||this.busy||performance.now()-this.last<125||!view.camera)return false;
  this.last=performance.now();const gl=this.gl,camera=view.camera;
  const old={program:gl.getParameter(gl.CURRENT_PROGRAM),vao:gl.getParameter(gl.VERTEX_ARRAY_BINDING),read:gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),draw:gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),viewport:gl.getParameter(gl.VIEWPORT),active:gl.getParameter(gl.ACTIVE_TEXTURE),mask:gl.getParameter(gl.COLOR_WRITEMASK),pack:gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING),enables:[gl.BLEND,gl.DEPTH_TEST,gl.CULL_FACE,gl.SCISSOR_TEST,gl.RASTERIZER_DISCARD].map(k=>[k,gl.isEnabled(k)])};
  gl.activeTexture(gl.TEXTURE0);const texture0=gl.getParameter(gl.TEXTURE_BINDING_2D);let pixels,width,height;
  try{
   if(!this.resources)this.init();const r=this.resources,texture=this.binding.getCameraImage(camera);if(!texture)return false;
   const scale=Math.min(1,640/camera.width,640/camera.height);width=Math.max(1,Math.round(camera.width*scale));height=Math.max(1,Math.round(camera.height*scale));
   gl.bindTexture(gl.TEXTURE_2D,r.target);if(r.width!==width||r.height!==height){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);r.width=width;r.height=height;}
   gl.bindFramebuffer(gl.FRAMEBUFFER,r.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,r.target,0);
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('AR 鏡頭擷取緩衝不可用');
   old.enables.forEach(([k])=>gl.disable(k));gl.colorMask(true,true,true,true);gl.viewport(0,0,width,height);gl.useProgram(r.program);gl.bindVertexArray(r.vao);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(r.uniform,0);gl.drawArrays(gl.TRIANGLES,0,3);
   pixels=new Uint8Array(width*height*4);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  }finally{
   gl.bindTexture(gl.TEXTURE_2D,texture0);gl.activeTexture(old.active);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,old.read);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,old.draw);gl.viewport(...old.viewport);gl.useProgram(old.program);gl.bindVertexArray(old.vao);gl.colorMask(...old.mask);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,old.pack);old.enables.forEach(([k,on])=>on?gl.enable(k):gl.disable(k));
  }
  const rgba=new Uint8ClampedArray(pixels.length),row=width*4;
  for(let y=0;y<height;y++)rgba.set(pixels.subarray(y*row,(y+1)*row),(height-1-y)*row);
  this.busy=true;createImageBitmap(new ImageData(rgba,width,height)).then(bitmap=>{if(this.ended)bitmap.close();else onFrame(bitmap,points);}).catch(()=>{}).finally(()=>this.busy=false);return true;
 }
 init(){
  const gl=this.gl,compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
  const vs=compile(gl.VERTEX_SHADER,'#version 300 es\n out vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}');
  const fs=compile(gl.FRAGMENT_SHADER,'#version 300 es\n precision mediump float;in vec2 uv;uniform sampler2D cameraImage;out vec4 color;void main(){color=vec4(texture(cameraImage,uv).rgb,1.0);}');
  const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  const target=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,target);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  this.resources={program,uniform:gl.getUniformLocation(program,'cameraImage'),target,fbo:gl.createFramebuffer(),vao:gl.createVertexArray(),width:0,height:0};
 }
 destroy(){if(!this.resources)return;const g=this.gl,r=this.resources;g.deleteProgram(r.program);g.deleteTexture(r.target);g.deleteFramebuffer(r.fbo);g.deleteVertexArray(r.vao);this.resources=null;}
}
