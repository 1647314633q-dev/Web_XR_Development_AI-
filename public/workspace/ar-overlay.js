// Keep WebXR controls in the existing DOM overlay; only the compact dock intercepts touches.
export function installAROverlay(){
 const $=id=>document.getElementById(id),root=$('xr-ui'),sheet=$('ar-tool-sheet'),toggle=$('ar-tools-toggle'),action=$('ar-action');
 let active=false,source=null;
 function setOpen(open){sheet.classList.toggle('is-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'收起工具':'工具／說明';}
 toggle.onclick=()=>setOpen(!sheet.classList.contains('is-open'));
 $('ar-tools-close').onclick=()=>setOpen(false);
 $('ar-exit-compact').onclick=()=>$('exit-ar').click();
 action.onclick=()=>{if(source&&!source.disabled){source.click();setOpen(false);}};
 $('ar-finish-compact').onclick=()=>$('ar-finish').click();
 function update(){
  const next=document.body.classList.contains('xr-active');if(next!==active){active=next;setOpen(false);}
  const complete=$('confirm-point').textContent.includes('✓'),pending=!$('ar-pending').hidden;
  source=!complete?$('confirm-point'):pending?$('ar-pending'):$('ar-mark');
  const receiving=document.body.dataset.operatorRole!=='guest';
  action.textContent=complete&&!pending&&receiving?'等待受邀方指令':source.textContent;action.disabled=source.disabled||complete&&!pending&&receiving;
  $('ar-compact-state').textContent=!complete?'AR · 設定工作區':pending?'AR · 收到指令':'AR · 工作區已設定';
  const hint=complete&&!pending&&receiving?'工作區已設定。等待夥伴送出指令，收到後再對準實物確認位置。':$('status').textContent||$('tracking-status').textContent;
  $('ar-compact-hint').textContent=hint;$('ar-compact-hint').title=hint;
  $('ar-finish-compact').hidden=receiving||$('ar-finish').hidden||!complete||pending;
  $('ar-finish-compact').disabled=$('ar-finish').disabled;
 }
 const observer=new MutationObserver(update);
 for(const id of ['confirm-point','ar-mark','ar-pending','ar-finish','status','tracking-status'])observer.observe($(id),{attributes:true,attributeFilter:['disabled','hidden'],childList:true,characterData:true,subtree:true});
 observer.observe(document.body,{attributes:true,attributeFilter:['class','data-operator-role']});
 root.addEventListener('beforexrselect',event=>{if(event.target.closest('button,input,select,summary,#ar-tool-sheet,.ar-dock,.ar-hud-top'))event.preventDefault();});
 document.addEventListener('keydown',e=>{if(active&&e.key==='Escape'&&sheet.classList.contains('is-open')){e.preventDefault();setOpen(false);}});
 update();
}
installAROverlay();
