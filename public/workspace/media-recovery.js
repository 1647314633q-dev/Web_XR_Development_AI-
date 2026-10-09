// A stalled browser camera request must not leave the UI permanently disabled.
// If it resolves after the deadline, release its tracks instead of leaking a camera.
export function withDeadline(promise,{ms=8000,onLate=()=>{},schedule=(fn,delay)=>setTimeout(fn,delay),cancel=id=>clearTimeout(id)}={}){
 return new Promise((resolve,reject)=>{let expired=false;const timer=schedule(()=>{expired=true;reject(new Error('鏡頭回應逾時，請按「開啟鏡頭」重試。'));},ms);Promise.resolve(promise).then(value=>{if(expired){onLate(value);return;}cancel(timer);resolve(value);},error=>{if(!expired){cancel(timer);reject(error);}});});
}
