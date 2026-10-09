export function inspectionCSV(record){
 const rows=[['項目','內容'],['紀錄名稱',record.title],['更新時間',record.updatedAt],['預期貨號',record.expectedSku],['影像來源',record.source],['貨品名稱',record.catalogSelection?.name||'未選擇'],['資料模式',record.catalogSelection?.demo?'練習資料':'正式驗收'],['參考庫存',record.catalogSelection?.stock??'未填寫']];
 ['貨號與訂單相符','外箱及封口完整','數量核對完成'].forEach((text,i)=>rows.push([text,record.checks?.[i]?'已人工確認':'未確認']));
 for(const scan of record.scans||[])rows.push(['掃描貨號',scan.value]);
 for(const note of record.notes||[])rows.push([`備註 ${note.time||''} ${note.author||''}`,note.text]);
 for(const a of record.annotations||[])if(!a.deleted)rows.push(['指令 '+a.kind,a.text||'畫面標記（完整位置見 JSON 備份）']);
 rows.push(['照片留證','照片未包含於此摘要；請另行擷取並保存畫面。']);
 const escape=v=>{let text=String(v??'');if(/^\s*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 return '\uFEFF'+rows.map(row=>row.map(escape).join(',')).join('\r\n');
}
export function downloadInspectionCSV(record){const url=URL.createObjectURL(new Blob([inspectionCSV(record)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='visionlink-inspection-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
