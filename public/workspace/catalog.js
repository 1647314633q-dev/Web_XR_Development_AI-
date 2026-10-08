export function validateCatalog(data){
 if(!data||data.version!==1||typeof data.demo!=='boolean'||!Array.isArray(data.items)||data.items.length>200)throw new Error('資料表須為 version: 1、demo 布林值及 items 陣列（最多 200 筆）。');
 const ids=new Set(),text=(s,n)=>typeof s==='string'&&s.length>0&&s.length<=n;
 for(const i of data.items){if(!i||!text(i.sku,120)||!text(i.name,120)||!text(i.model,160)||!text(i.location,160)||!Number.isSafeInteger(i.stock)||i.stock<0||i.stock>10000000||!Array.isArray(i.aliases)||i.aliases.length>10||!i.aliases.every(a=>text(a,120))||!Array.isArray(i.history)||i.history.length>30||!i.history.every(h=>h&&/^\d{4}-\d{2}-\d{2}$/.test(h.date)&&text(h.text,300)))throw new Error('貨號、名稱、庫存或維修紀錄格式不正確。');
  for(const code of [i.sku,...i.aliases]){if(ids.has(code))throw new Error('貨號或別名重複：'+code);ids.add(code);}
 }
 return data;
}
export function lookupCatalog(data,code){return data?.items.find(i=>i.sku===code||i.aliases.includes(code))||null;}
export function installCatalog({state,$,toast}){
 let catalog=null,selected=null,lastCatalogText='檢查這裡';state.catalogSelection=null;
 state.decorateAI=(items,mode=state.mode)=>mode==='barcode'?items.map(d=>{const i=lookupCatalog(catalog,d.label);return i?{...d,label:`${i.name} · ${i.sku}${catalog.demo?'（示範）':''}`} :d;}):items;
 function show(code,source=''){selected=lookupCatalog(catalog,code);state.catalogSelection=selected?{...selected,demo:catalog.demo}:null;const card=$('catalogCard');card.replaceChildren();
  const badge=document.createElement('span');badge.className='badge muted';badge.textContent=catalog?.demo?'示範資料 · 虛構庫存及紀錄':'本機匯入資料';card.append(badge);
  const title=document.createElement('h3');title.textContent=selected?`${selected.name} · ${selected.sku}`:code?`${code} · 尚未建立資料`:'選擇示範貨號或掃描 QR Code';card.append(title);
  if(selected){const p=document.createElement('p');p.textContent=`${selected.model}\n庫存：${selected.stock} 件／箱\n位置：${selected.location}`;card.append(p);const ul=document.createElement('ul');for(const h of selected.history){const li=document.createElement('li');li.textContent=`${h.date} · ${h.text}`;ul.append(li);}card.append(ul);const next=`${selected.name} · ${selected.sku}${catalog.demo?'（示範）':''}`;if(!$('annotationText').value||$('annotationText').value===lastCatalogText)$('annotationText').value=next;lastCatalogText=next;$('demoSku').value=selected.sku;}
  if(source){const p=document.createElement('small');p.textContent=source;card.append(p);}state.catalogCode=code;
 }
 state.onScan=(code,source)=>show(code,source==='remote'?'由夥伴本機掃描後同步':'由本機條碼掃描取得');
 function options(){const select=$('demoSku');select.replaceChildren();for(const i of catalog.items){const o=document.createElement('option');o.value=i.sku;o.textContent=`${i.sku} · ${i.name}`;select.append(o);}show(state.scans.at(-1)?.value||catalog.items[0]?.sku||'');}
 async function reset(){const r=await fetch('demo-catalog.json');if(!r.ok)throw new Error('示範資料未能載入。');catalog=validateCatalog(await r.json());options();}
 $('demoSku').onchange=()=>show($('demoSku').value,'手動查看資料；尚未掃描或完成驗收。');
 $('demoQr').onclick=async()=>{try{const code=$('demoSku').value;if(!['VL-2048','A102','V003','VL-2051'].includes(code))throw new Error('匯入資料請使用自己的條碼照片。');const img=new Image();img.src=`demo-qr-${code}.svg`;await img.decode();const canvas=document.createElement('canvas');canvas.width=720;canvas.height=720;canvas.getContext('2d').drawImage(img,0,0,720,720);await state.loadInspectionImage(await createImageBitmap(canvas));$('expectedSku').value=code;document.querySelector('[data-mode="barcode"]').click();state.skuUpdate();toast('已載入示範 QR 照片；等待本機條碼讀取。');}catch(e){toast(e.message);}};
 $('catalogLabel').onclick=()=>{if(!selected)return;$('annotationText').value=lastCatalogText;if(state.annotationTool!=='label')document.querySelector('[data-annotation="label"]').click();toast('已選取文字標籤；點擊畫面放置，或在 AR 中確認位置。');};
 $('catalogImport').onclick=()=>$('catalogInput').click();$('catalogInput').onchange=async()=>{try{const f=$('catalogInput').files[0];if(!f)return;if(f.size>250000)throw new Error('JSON 資料表請小於 250 KB。');catalog=validateCatalog(JSON.parse(await f.text()));options();toast('資料僅在本次頁面載入；巡檢紀錄會保存已選資料卡。');}catch(e){toast(e.message);}finally{$('catalogInput').value='';}};
 $('catalogReset').onclick=()=>reset().catch(e=>toast(e.message));reset().catch(e=>toast(e.message));
}
