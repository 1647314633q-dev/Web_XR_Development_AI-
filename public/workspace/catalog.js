import {lookupCatalog,EMPTY_CATALOG} from './catalog-data.js';
import {installCatalogManager} from './catalog-manager.js';
export {validateCatalog,lookupCatalog} from './catalog-data.js';
export function installCatalog({state,$,toast}){
 let catalog=EMPTY_CATALOG(),selected=null,lastCatalogText='檢查這裡',snapshot=state.catalogSelection||null;
 state.decorateAI=(items,mode=state.mode)=>mode==='barcode'?items.map(d=>{const i=lookupCatalog(catalog,d.label);return i?{...d,label:`${i.name} · ${i.sku}${catalog.demo?'（練習）':''}`} :d;}):items;
 function show(code,source='',saved=null){
  selected=saved||lookupCatalog(catalog,code);const isDemo=saved?!!saved.demo:catalog.demo;state.catalogSelection=selected?{...structuredClone(selected),demo:isDemo}:null;const card=$('catalogCard');card.replaceChildren();
  const badge=document.createElement('span');badge.className='badge muted';badge.textContent=isDemo?'練習資料 · 虛構庫存及紀錄':'我的貨品資料';card.append(badge);
  const title=document.createElement('h3');title.textContent=selected?`${selected.name} · ${selected.sku}`:code?`${code} · 尚未建立資料`:catalog.items.length?'請選擇貨號或掃描條碼':'先新增或匯入你的貨品';card.append(title);
  if(selected){const p=document.createElement('p');p.textContent=`型號：${selected.model||'未填寫'}\n庫存：${selected.stock===null?'未填寫':selected.stock+' '+(selected.unit||'件')}\n位置：${selected.location||'未填寫'}`;card.append(p);const ul=document.createElement('ul');for(const h of selected.history){const li=document.createElement('li');li.textContent=`${h.date} · ${h.text}`;ul.append(li);}card.append(ul);const next=`${selected.name} · ${selected.sku}${isDemo?'（練習）':''}`;if(!$('annotationText').value||$('annotationText').value===lastCatalogText)$('annotationText').value=next;lastCatalogText=next;$('demoSku').value=selected.sku;}
  if(source){const p=document.createElement('small');p.textContent=source;card.append(p);}state.catalogCode=code;snapshot=state.catalogSelection;
  $('catalogLabel').disabled=!selected;$('catalogExpected').disabled=!selected;$('demoQr').hidden=!catalog.demo;
 }
 state.restoreCatalogSelection=value=>{snapshot=value;show(value?.sku||'','本次驗收的貨品資料快照；重新選擇貨號可讀取最新資料',value);};
 state.onScan=(code,source)=>{snapshot=null;show(code,source==='remote'?'夥伴掃到的條碼；以你的貨品資料核對':'本機掃描取得；請人工核對驗收項目');};
 const manager=installCatalogManager({$,toast,onChange:data=>{catalog=data;const select=$('demoSku');select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='選擇貨號或掃描條碼';select.append(empty);for(const i of catalog.items){const o=document.createElement('option');o.value=i.sku;o.textContent=`${i.sku} · ${i.name}`;select.append(o);}if(snapshot)show(snapshot.sku,'本次驗收的貨品資料快照；重新選擇貨號可讀取最新資料',snapshot);else show(state.catalogCode||state.scans.at(-1)?.value||'');}});
 $('demoSku').onchange=()=>{snapshot=null;show($('demoSku').value,'手動查看；尚未掃描或完成驗收。');};
 $('catalogExpected').onclick=()=>{if(!selected)return;$('expectedSku').value=selected.sku;state.skuUpdate();toast('已設定本次預期貨號。請開啟鏡頭掃描實物。');};
 $('catalogManage').onclick=()=>manager.open(selected?.sku||state.catalogCode);
 $('demoQr').onclick=async()=>{try{const code=$('demoSku').value;if(!['VL-2048','A102','V003','VL-2051'].includes(code))throw new Error('請先選一個練習貨號。');const img=new Image();img.src=`demo-qr-${code}.svg`;await img.decode();const canvas=document.createElement('canvas');canvas.width=720;canvas.height=720;canvas.getContext('2d').drawImage(img,0,0,720,720);await state.loadInspectionImage(await createImageBitmap(canvas));$('expectedSku').value=code;document.querySelector('[data-mode="barcode"]').click();state.skuUpdate();toast('已載入練習 QR 照片；等待本機條碼讀取。');}catch(e){toast(e.message);}};
 $('catalogLabel').onclick=()=>{if(!selected)return;$('annotationText').value=lastCatalogText;if(state.annotationTool!=='label')document.querySelector('[data-annotation="label"]').click();toast('已選取文字標籤；點擊畫面放置，或在 AR 中確認位置。');};
}
