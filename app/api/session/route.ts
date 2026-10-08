import {env} from 'cloudflare:workers';
import {createSessionService} from '../../../lib/session-service.mjs';
import {getChatGPTUser} from '../../chatgpt-auth';
export const dynamic='force-dynamic';
async function handle(request:Request){const user=await getChatGPTUser();if(!env.DB)return Response.json({error:'資料庫尚未完成設定。'},{status:503});return createSessionService({db:env.DB,env})(request,user?.userId);}
export const GET=handle;
export const POST=handle;
