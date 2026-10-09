// A visible AR passthrough does not prove that camera frames can be shared.
export class XRVideoWatchdog {
 constructor(onFailure,{delay=6000,schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}={}){this.onFailure=onFailure;this.delay=delay;this.schedule=schedule;this.cancel=cancel;this.active=false;this.failed=false;this.timer=null;}
 start(){this.stop();this.active=true;this.failed=false;this.frame();}
 frame(){if(!this.active||this.failed)return;this.cancel(this.timer);this.timer=this.schedule(()=>this.fail('timeout'),this.delay);}
 fail(reason){if(!this.active||this.failed)return;this.failed=true;this.cancel(this.timer);this.timer=null;this.onFailure(reason);}
 stop(){this.cancel(this.timer);this.timer=null;this.active=false;}
}
