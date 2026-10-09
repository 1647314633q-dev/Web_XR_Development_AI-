export const CATALOG_LIMIT = 200;
export const EMPTY_CATALOG = () => ({version:1,demo:false,items:[]});
export const localDate = (date=new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const FIELDS = [
 ['sku','貨號／條碼',true],['name','名稱',true],['stock','庫存',false],['unit','單位',false],
 ['model','型號',false],['location','存放位置',false],['aliases','其他條碼',false],['history','維修／檢查紀錄',false]
];
export function validateCatalog(data){
 if(!data||data.version!==1||typeof data.demo!=='boolean'||!Array.isArray(data.items)||data.items.length>CATALOG_LIMIT)throw new Error(`資料表最多 ${CATALOG_LIMIT} 筆。`);
 const ids=new Set(),text=(s,n,empty=false)=>typeof s==='string'&&(empty||s.trim().length>0)&&s.length<=n;
 for(const [index,i] of data.items.entries()){
  if(!i||!text(i.sku,120)||!text(i.name,120)||!text(i.model,160,true)||!text(i.location,160,true)||!(i.stock===null||Number.isSafeInteger(i.stock)&&i.stock>=0&&i.stock<=10000000)||(i.unit!==undefined&&!text(i.unit,12))||!Array.isArray(i.aliases)||i.aliases.length>10||!i.aliases.every(a=>text(a,120))||!Array.isArray(i.history)||i.history.length>30||!i.history.every(h=>h&&/^\d{4}-\d{2}-\d{2}$/.test(h.date)&&text(h.text,300)))throw new Error(`第 ${index+1} 筆的貨號、名稱、庫存或紀錄不正確。庫存須為非負整數或留空；每項最多 30 則紀錄。`);
  for(const code of [i.sku,...i.aliases]){if(ids.has(code))throw new Error('貨號或其他條碼重複：'+code);ids.add(code);}
 }
 return data;
}
export function lookupCatalog(data,code){return data?.items.find(i=>i.sku===code||i.aliases.includes(code))||null;}
// CSV/TSV text only: spreadsheet formulas are never evaluated.
export function readTable(text){
 if(typeof text!=='string'||text.length>250000)throw new Error('表格請小於 250 KB。');
 text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 const first=text.split('\n')[0]||'',delimiter=first.includes('\t')?'\t':first.includes(';')&&!first.includes(',')?';':',';
 const rows=[];let row=[],cell='',quoted=false,ended=false;
 const pushCell=()=>{row.push(cell);cell='';ended=false;if(row.length>60)throw new Error('每列最多 60 欄。');};
 const pushRow=()=>{pushCell();if(row.some(v=>v.trim()))rows.push(row);row=[];if(rows.length>CATALOG_LIMIT+1)throw new Error(`每次最多匯入 ${CATALOG_LIMIT} 筆。`);};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;ended=true;}}else cell+=c;}
  else if(c===delimiter)pushCell();else if(c==='\n')pushRow();
  else if(c==='"'&&!cell&&!ended)quoted=true;
  else if(ended){if(c!==' ')throw new Error('引號結尾後應為分隔符號，請檢查表格。');}
  else cell+=c;
 }
 if(quoted)throw new Error('表格有未關閉的雙引號。');
 if(cell||row.length||ended)pushRow();
 if(rows.length<2)throw new Error('請包含第一列欄名，以及至少一筆貨品。');
 const headers=rows.shift().map(x=>x.trim());
 if(rows.some(r=>r.length>headers.length))throw new Error('有資料超出欄名數量；CSV 中的逗號須放在雙引號內。');
 return {headers,rows};
}
const aliases={sku:['貨號','货号','貨號／條碼','sku','條碼','条码','barcode','產品編號','產品代碼','商品編號','item code'],name:['名稱','名称','品名','產品名稱','商品名稱','name','product'],stock:['庫存','库存','數量','数量','stock','quantity','qty'],unit:['單位','单位','unit'],model:['型號','型号','model'],location:['存放位置','位置','倉位','仓位','location'],aliases:['其他條碼','別名','别名','aliases'],history:['維修／檢查紀錄','維修紀錄','維修記錄','備註','备注','history','notes']};
export function suggestMapping(headers){return Object.fromEntries(FIELDS.map(([key])=>[key,headers.findIndex(h=>aliases[key].includes(h.trim().toLowerCase()))]));}
export function tableItems(table,mapping){
 for(const [key,label,required] of FIELDS)if(required&&!(mapping[key]>=0&&mapping[key]<table.headers.length))throw new Error('請指定「'+label+'」對應的欄位。');
 const chosen=Object.values(mapping).filter(v=>v>=0);if(new Set(chosen).size!==chosen.length)throw new Error('同一欄不能對應兩個欄位。');
 const today=localDate();
 const items=table.rows.map((row,n)=>{
  const get=k=>String(row[mapping[k]]??'').trim(),stock=get('stock');
  if(stock&&!/^\d+$/.test(stock))throw new Error(`表格第 ${n+2} 列庫存不是非負整數；請勿輸入單位或千位逗號。`);
  const history=get('history').split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d{4}-\d{2}-\d{2})\s*[:：]\s*(.+)$/);return {date:m?.[1]||today,text:m?.[2]||line};});
  return {sku:get('sku'),name:get('name'),stock:stock?Number(stock):null,unit:get('unit')||'件',model:get('model'),location:get('location'),aliases:get('aliases').split('|').map(x=>x.trim()).filter(Boolean),history};
 });
 validateCatalog({version:1,demo:false,items});return items;
}
export function mergeCatalog(current,items,fields=FIELDS.map(f=>f[0])){
 const merged=new Map(current.items.map(i=>[i.sku,structuredClone(i)]));let added=0,updated=0;
 for(const item of items){const old=merged.get(item.sku);if(old){const next={...old};for(const key of fields)if(key in item)next[key]=item[key];merged.set(item.sku,next);updated++;}else{merged.set(item.sku,item);added++;}}
 const catalog=validateCatalog({version:1,demo:false,items:[...merged.values()]});return {catalog,added,updated};
}
export function catalogCSV(catalog){
 const safe=value=>{let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return '\uFEFF'+[FIELDS.map(f=>f[1]),...catalog.items.map(i=>[i.sku,i.name,i.stock,i.unit||'件',i.model,i.location,i.aliases.join('|'),i.history.map(h=>`${h.date}: ${h.text}`).join('\n')])].map(row=>row.map(safe).join(',')).join('\r\n');
}
