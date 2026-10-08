import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {openLocalDatabase} from './lib/local-db.mjs';
import {createSessionService} from './lib/session-service.mjs';
const root=path.resolve('public/workspace');
const db=openLocalDatabase('.local-data/visionlink.sqlite');
const handle=createSessionService({db,env:process.env});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.bin':'application/octet-stream','.ttf':'font/ttf','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost:4173');
 if(url.pathname.startsWith('/api/')){
  const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>150000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const response=await handle(request,'local-workspace');res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 const relative=decodeURIComponent(url.pathname).replace(/^\/workspace/,'')||'/';const file=path.resolve(root,relative==='/'?'index.html':relative.slice(1));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Permissions-Policy':'camera=(self), microphone=(self), xr-spatial-tracking=(self)'});res.end(body);
}catch{res.writeHead(404);res.end('Not found');}});
server.listen(4173,'127.0.0.1',()=>console.log('VisionLink: http://localhost:4173'));
