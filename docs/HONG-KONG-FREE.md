# 香港免費獨立版

2026-10-09：按使用者要求開放自行註冊。登入頁按「首次使用？免費建立帳戶」，輸入顯示名稱並保存一次性顯示的個人金鑰。新帳戶為普通成員，可建立房間及保存自己的紀錄；不能管理其他帳戶。部署 vars.PUBLIC_REGISTRATION 設為字串 true；設 false 可關閉。每個 IP 每 UTC 日最多 3 個註冊名額，整站每日 100 個；不構成帳戶級 TURN 費用硬上限。

本次 24 項程式檢查通過，Worker 版本 61e783a1-6adb-47b6-a757-31fa8a845c3b。正式 health 200、registrationEnabled=true，匿名私人紀錄與帳戶管理仍 401。GitHub 最初只有部分來源，後續已整理為 119 個公開來源／文件檔案，補齊獨立 Worker 的安裝建置流程。乾淨副本重新 npm ci、下載及校驗 runtime、24 項檢查、建置與啟動均通過；本機服務實測註冊、登入、房間、訪客及私人紀錄隔離。清理快取與重複 README，初始 4 次歷史提交的 16 個不同檔案版本未發現有效密鑰。

範圍：香港 Android Chrome 的雙人貨品驗收試用。使用自己的 Cloudflare 帳戶、Workers Free、D1 和免費 `workers.dev` HTTPS 網址。保留真正的 Wonderland Engine 1.6.1、條碼核對、遠程指令、清單與紀錄。沒有購買香港 VPS、域名或升級付費方案。

Cloudflare 是全球邊緣網絡，這個方案適合在香港試用，但不是專屬香港主機；D1 建立時可指定 `apac` 位置提示，不能保證資料只存放在香港。網站不需要 ChatGPT 登入。辨識程式、模型、WASM 均與網站一起部署，字型使用裝置字型。無法保證所有電訊商、地區或網絡永遠可達；正式 HTTPS 網址須由香港手機實測。

## 本機預覽

需要 Node.js 24。在專案根目錄執行：

```powershell
npm.cmd install
npm.cmd run prepare:models
npm.cmd run build:independent
npm.cmd run check
npm.cmd run start:independent
```

開啟 `http://localhost:4174`。第一次設定碼在被 Git 忽略的 `.local-data/independent-bootstrap.txt`；只用於本機。資料庫為 `.local-data/independent.sqlite`。本機服務只監聽回送介面，手機鏡頭請使用正式 HTTPS 部署。

`prepare:models` 從 Google 官方模型倉庫下載 BlazeFace 與 EfficientDet Lite0，之後在建置中驗證 SHA256。手機執行時不向 Google、jsDelivr 或 Google Fonts 下載資產。物件模型約 13.8 MB，人臉模型約 0.23 MB。

## 免費 Cloudflare 部署

1. 保持 Workers **Free**，不要加入付款資料或選擇升級。使用官方 Wrangler OAuth，只授予部署所需的帳戶／使用者讀取、Workers scripts 寫入及 D1 寫入；這些權限可管理帳戶內相關資源，並非只限本專案。
2. 在自己的帳戶建立新 D1，與舊 Sites 資料庫分開：

   ```powershell
   npx wrangler d1 create visionlink-hk --location apac
   ```

3. 複製 `standalone/wrangler.example.jsonc` 至被忽略的 `standalone/wrangler.local.jsonc`，填入返回的真實資料庫 ID 和自己的 account_id。不可用範例佔位 ID 發佈。
4. 執行 `npx wrangler d1 migrations apply visionlink-hk --remote --config standalone/wrangler.local.jsonc`。只對新資料庫執行，遷移保留在 `artifacts/independent/migrations/`。
5. 透過 Wrangler secret 的互動輸入或標準輸入設定 `AUTH_BOOTSTRAP_KEY`（32 隨機 bytes、64 個十六進位字元）、現有 `CLOUDFLARE_TURN_KEY_ID` 與 `CLOUDFLARE_TURN_API_TOKEN`。不能寫入前端、Wrangler vars、Git 或聊天；不可將長期 TURN token 寄給夥伴。
6. 執行 `npm.cmd run deploy:independent`，採用返回的真實 HTTPS 網址。未完成部署前，本機預覽不代表已有公開可用版本。
7. 管理員本人開啟 `/login`，輸入設定碼、建立並保存自己的存取金鑰。首次建立後不再接受第二個管理員設定。登入的發起方建立房間後，受邀夥伴直接開啟完整房間連結並按「加入房間」，無需帳戶或金鑰。需要建立自己的房間及保存私人紀錄的長期夥伴，才由「管理夥伴」接受帳戶邀請。

## 存取與資料

- 登入金鑰有 256 bits 隨機性，只存 SHA256。HTTPS 工作階段使用 Secure、HttpOnly、SameSite Strict cookie，八小時到期；不用 OpenAI 身份標頭。
- 同來源 JSON 操作、防止跨網站請求、登入嘗試限流、串流 body 大小限制。成員不能管理帳戶；停用夥伴會撤銷已簽發的登入工作階段。
- 存取金鑰只顯示一次。請自行保存；這個試點沒有電郵找回。夥伴不要共用管理員金鑰。
- 個人驗收紀錄依帳戶隔離。受邀訪客免登入，只有該房間的即時影音、標記、指令與清單權限；不能建立房間、讀寫雲端私人紀錄或管理帳戶。可將本次資料匯出到自己的裝置。原 Sites 資料不會自動搬入；原網站存取範圍不受影響。
- 房間連結含 192 bits 隨機邀請碼，請只交給指定夥伴。加入後使用另一個隨機成員憑證；它只對該房間有效。房間限兩人，一小時到期或發起方結束後，加入與信令均失效。訪客離開會撤銷該成員憑證；在房間有效期內可重新使用邀請加入。
- 訪客加入後才可取得 TURN 臨時憑證，有效期不超過房間剩餘時間；每房間訪客最多簽發 12 次。這是應用端限制，不是帳戶級流量或帳單上限。既有 Sites 服務預設仍要求登入，免登入只啟用於獨立 Worker。
- 圖片、影片辨識在裝置執行；雙人協作影音可經 TURN 中繼。3D 仍是示範模型與影片平面，没有實景重建或共享實體空間錨點。

## HK$0 的額度邊界

2026-10-07 查核官方文件：

| 服務 | 免費額度 | 到達限制時 |
| --- | --- | --- |
| Workers 動態 API | 每日 100,000 請求；每次 10 ms CPU | 免費計劃限制服務；不升級 |
| 靜態資產 | 免費、不計入上述動態請求量 | 仍有檔案大小及檔案數限制 |
| D1 | 每日 500 萬讀取、10 萬寫入；帳戶總計 5 GB，另有單庫大小限制 | 免費計劃停止相關查詢／寫入；不升級 |
| Realtime TURN / SFU | 合共每月首 1,000 GB 免費 | 超額價格 US$0.05/GB，不能宣稱無限免費 |

信令每秒輪詢，兩位夥伴八小時約 57,600 次輪詢，登入、建立房間、儲存等另計。這適合少量雙人試用，不能宣稱支持不限人數或全天候工作。

每次試用後關閉房間及鏡頭，在 Realtime Usage 查看實際中繼用量，並計入舊網站或同帳戶其他應用。應用沒有 Cloudflare 帳戶級 TURN 帳單硬上限；如付款方案允許超額計費，須先確認服務商提供的額度限制，不能把應用內提示當作零費用保證。預算為 HK$0，不新增付款或付費承諾；無法控制超額時先停用中繼。

來源：[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)、[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)、[Realtime pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/)、[D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/)。

## 驗證記錄

本機：12 項 Node 測試通過，獨立資產建置及 Wrangler deploy dry-run 通過。CUA 瀏覽器驗證獨立登入、QR `VL-2048` 讀取／訂單比對、物件及人臉模型初始化及推論、Wonderland 1.6.1 載入、紀錄保存、390px 手機排版無橫向溢出。物件／人臉測試輸入為 QR 圖，這只證明模型能推論，不代表貨品或人臉準確率驗收。

待完成：正式網址的香港 5G / Wi-Fi 雙機 TURN 影音、Android 後置鏡頭／切換／收音、實體 AR 平面追蹤。舊 Sites 版本先前已驗證真實 TURN 分配與雙頁強制中繼指令，但不能據此宣稱新網址已验收。

## 實際部署狀態

2026-10-07 已透過管理員批准的官方 Wrangler 授權完成部署。正式網址：[VisionLink 香港試用版](https://visionlink-hk.visionlink-workspace.workers.dev/)。D1 已建立於亞太位置提示，兩個資料表遷移已套用。現有 TURN 金鑰已作為 Worker secrets 沿用，長期 API token 未存入前端或版本庫。版本預覽網址已關閉。

已查核：`/health` 200、獨立登入狀態 200、匿名 `/api/records` 401。管理員已完成設定並使用房間邀請。設定碼僅用於首次設定，不是受邀者登入金鑰。正式網址的雙機 TURN 影音及 AR 實機驗收仍未完成。

免登入更新：15 項測試通過，涵蓋訪客只可存取受邀房間、拒絕私人紀錄與管理權限、錯誤邀請、已滿房間、結束／到期、TURN 憑證期限與簽發次數限制。本機隔離登入來源的雙頁測試已驗證訪客免金鑰加入、雙向指令、訂單／清單同步與訪客重新整理恢復。

免登入功能已部署到正式網址，最新 Worker 版本 `04efc010-12c7-4529-a1df-919e33a4d0f3`，包括加入房間時再次檢查到期時間的修正。正式前端檔案 SHA256 與本機一致；未登入建立房間／讀取紀錄／取得未授權 TURN 設定仍回傳 401，無效房間邀請回傳 410。正式頁面已顯示「受邀者免登入」，並成功取得真正的 TURN relay 位址。香港雙機跨網絡影音與實體 AR 仍需按照 Android 測試文件完成。


AI／AR 更新（2026-10-07）：正式 Worker 版本 `8072cdec-95be-40ff-8bac-8fbbd656df29`。20 項檢查通過；正式新程式、Wonderland 匯出、ONNX 模型／WASM 的 SHA256 與本機一致，health 200，匿名私人紀錄／未授權 TURN 設定仍 401。手機尺寸的 Wonderland iframe 已修正橫向溢出。桌面無帳戶訪客看到真 QR 結果、帶框影像與 AI 暫停清除；模型在瀏覽器可推論。AR camera-access 實機和公尺對齊精度仍待驗收。新頁面 `/workspace/model-report.html` 公開實際訓練及驗證：原保留集 140 區域準確率 77.9%，額外 137 區域只有 52.6%，撕裂召回率 0%，因此損傷模式標示「研究」，不能用於自動驗收。詳細見 [AI／AR 升級說明](AI-AR-UPGRADE.md)。


2026-10-07 AR 遮擋及文案更新：Worker 版本 `6532d179-8010-4fac-afb6-71d6794d4dc9`。真實引擎驗證 72 個示範組件全部隱藏、canvas alpha=0，退出時保留原有組件狀態；控制介面使用透明 DOM overlay 根背景。20 項既有檢查通過，正式站公開檔案 checksum 與本機一致，health 200。Android 截圖證明舊版確實啟動了 AR，但仍顯示示範模型；本次修正後手機透視影像及平面追蹤仍需重測。指定的長準確率段落從工作畫面移除，研究模式與人工覆核短提示保留，詳細結果仍可從模型報告查看。


2026-10-07 AR 操作簡化：Worker `8db9e68b-863b-438f-b4f9-173c9a692931`。預設「對準桌面 → 一次設定工作區 → 新增空間標記」，簡易方向依手機面向建立；進階三點保留已接受點、錯誤不會默默重置到 1/3，並显示完成進度與間距。22 項程式檢查與原生引擎打包通過，正式站七個公開檔案 checksum 一致，health 200；手機新流程、走動漂移與雙端精度需實機重測。桌面介面與原生引擎載入已驗證，未以桌面瀏覽器尺寸測試冒充手機原生 AR。
