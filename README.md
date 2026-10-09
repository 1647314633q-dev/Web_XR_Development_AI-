# VisionLink · 即時視覺 AI 協作

雙人遠程貨品驗收 Web 應用，結合 WebRTC、Wonderland Engine 1.6.1 / WebXR、瀏覽器端 AI、條碼核對與 Cloudflare Workers / D1。

[開啟正式網站](https://visionlink-hk.visionlink-workspace.workers.dev/workspace/) · [註冊／登入](https://visionlink-hk.visionlink-workspace.workers.dev/login/) · [使用與測試](docs/GETTING-STARTED.md)

## 使用網站

首次使用在登入頁按「首次使用？免費建立帳戶」，輸入顯示名稱並保存自己的個人金鑰，再進入工作空間建立房間。受邀夥伴憑完整房間邀請免登入加入。GitHub 帳戶與網站帳戶分開，無需你的管理員金鑰。

房間最多兩人、有效一小時。私人紀錄按帳戶隔離。自行註冊每個網絡每日最多3個名額。登錄密匙并不會保存,用戶需自行保存。
<img width="695" height="726" alt="image" src="https://github.com/user-attachments/assets/effc6786-9e5f-46dc-b2e4-86b0f2d564b5" />


## 功能與實際範圍

| 功能 | 已提供 |
| --- | --- |
| 即時協作 | 雙向影音、鏡頭切換、獨立收音、指令與驗收清單同步 |
| 貨品資料與核對 | 帳戶內持久資料庫、直接新增／編輯、Excel 表格貼上、CSV／TSV／JSON 匯入預覽、搜尋、CSV 匯出；條碼／QR 精確比對 |
| 視覺 AI | MediaPipe 物件／人臉位置、AI 結果及帶標記影像同步；不辨識個人身份 |
| 協作指令 | 由受邀方繪製箭頭、圈選、畫線及文字；「這裡拆／這裡檢查／按這個按鈕」快捷指令同步，暫停畫面、撤回與清除；指令隨巡檢紀錄保存 |
| AR | 真實 WebXR 平面定位、文字／箭頭／圈選／逐點線條固定、三點對齊及 XR 鏡頭分享 |<img width="311" height="326" alt="image" src="https://github.com/user-attachments/assets/ad8b53d7-63ec-41f5-bc25-713c89c4a9a1" />|
| 紀錄 | 登入者保存自己的 D1 紀錄、頁籤內草稿、CSV 驗收摘要、完整 JSON 備份與 PNG 擷取 |
| 貨箱損傷 | 已訓練實驗模型、ONNX 本機推論及公開測試報告；結果須人工覆核 |
| 貨箱檢測示範，運用了AI模型進行檢測，精確率高達78%，無法檢測時會提醒呼叫人工。擁有多功能模式：物件檢測，人臉檢測，貨號識別以及損傷檢查 |<img width="1236" height="479" alt="image" src="https://github.com/user-attachments/assets/4e5c0aab-2df8-414b-ae44-4448e1354e8e" />|


桌面通常使用 3D 預覽，原生 AR 需支援的裝置／瀏覽器。一般畫面標記跟隨影像位置；AR 標記記錄真實空間位置。沒有完整實景 3D 重建或自動共享世界錨點。實驗損傷模型未通過現場泛化驗證，不可作為自動合格／拒收依據。

發起方負責拍攝及確認位置，繪圖工具停用。AR 顯示精簡操作列，其他工具及說明按需展開。受邀方在「夥伴視角」繪製指令後，按「固定到實物（AR）」；現場對準實物位置按「固定這個指令」。箭頭末端／文字起點落在確認位置，圈選及線條按約 25 公分範圍轉為平面圖形。這是人工確認定位，不會自動推算深度或追蹤移動設備。AI 自動顯示名稱／紅色疑似損傷檢查框；損傷框是中央分類範圍，AR 定位需人工確認。

正式資料由使用者新增或匯入，儲存到自己的帳戶，同帳戶可跨裝置讀取。最多 200 筆；庫存是人工維護的參考總數，掃描及驗收不會自動入庫或扣貨，尚未介接外部 ERP。匯入先指定欄位及預覽，再合併同貨號資料；未對應欄位和其他貨品保留。多頁同時修改會阻止舊版本覆寫。受邀訪客沒有正式貨品庫的讀寫權。

「練習與備份」內仍提供 4 筆**虛構資料**，與正式帳戶資料分開。Motor A／Valve 03 名稱來自條碼對應資料表，不代表 AI 能辨識馬達型號。Excel `.xlsx` 請複製儲存格貼上或另存 CSV UTF-8；不直接解析活頁簿。可下載 CSV 日常交接，JSON 用於完整備份。

## 系統架構

```text
                     VisionLink
                        │
            ┌───────────┴───────────┐
            │                       │
       現場裝置                  遠端夥伴
     Android / Tablet          PC / Phone
            │                       │
            └────── WebRTC ─────────┘
                   │       │
              Video/Audio  Data
                           │
                  ┌────────┼────────┐
                  │        │        │
                 AI      標記      AR
              MediaPipe  Annotation WebXR
              ONNX        │        │
                  └────────┴────────┘
                           │
                    Cloudflare Worker
                           │
                    ┌──────┴──────┐
                    │             │
                  Room           D1
                Signaling      Records


## 線上使用

正式部署版本：

https://visionlink-hk.visionlink-workspace.workers.dev/workspace/

一般使用者可直接透過正式 HTTPS 網址使用，不需要安裝 Node.js、下載專案或與開發者處於同一網絡。

---

## 本機開發

需要 **Node.js 24** 與 npm。Windows 可使用 `npm.cmd`。

```bash
npm ci
npm ci --prefix wonderland
npm run prepare:runtime
npm run check
npm run build:independent
npm run start:independent
```


## 自己部署

使用自己的 Cloudflare Workers Free 與 D1，按 [香港免費部署說明](docs/HONG-KONG-FREE.md) 建立資源、套用遷移，並透過 Worker secrets 設定首次管理員設定碼及 TURN。複製 `standalone/wrangler.example.jsonc` 至未追蹤的 `standalone/wrangler.local.jsonc`，填入自己的資料庫和帳戶設定。

`PUBLIC_REGISTRATION` 是普通環境開關，不是密鑰。設成字串 `true` 開放自行註冊，`false` 關閉。不要複製正式站的管理員金鑰或長期 TURN token。

Cloudflare 為全球邊緣服務，這個方案適合香港試用，不能保證專屬香港主機或全球所有網絡均可達。免費配額及 TURN 用量需由部署者管理；註冊配額不是帳戶級費用硬上限。

## 目錄

| 路徑 | 用途 |
| --- | --- |
| public/workspace/ | 瀏覽器介面、AI、房間、標記與協作程式 |
| standalone/ | 獨立 Worker、本機服務、登入頁、設定範例及資產 manifest |
| lib/、drizzle/ | 登入、房間服務、私人紀錄及資料庫遷移 |
| wonderland/ | 可編輯場景、AR 與空間校準原始碼 |
| scripts/ | 建置、資產下載與模型訓練／評估 |
| tests/ | 認證、權限、同步、座標與 TURN 檢查 |
| docs/、licenses/ | 操作、部署、模型限制及第三方授權 |
| app/、build/ | 原 Sites／框架整合；本次預設使用獨立 Worker 流程 |

`npm run build` 是原 Sites 的建置入口，需要該平台的專案設定；一般 GitHub 使用者請使用上面的 `build:independent` 流程。

## 安全與驗證

不得提交金鑰、有效邀請、Cookie、.env 私人值、OAuth 憑證、資料庫或客戶圖片。請閱讀 [SECURITY.md](SECURITY.md) 與 [第三方資產授權](docs/THIRD-PARTY-ASSETS.md)。保留模型與軟體署名；重新訓練的模型遵循原資料授權。此倉庫沒有宣告將第三方程式或 Wonderland runtime 改授權。

43 項程式測試通過；雙頁已驗證受邀方繪圖、發起方接收及 AR 固定請求。正式網站已實測自行註冊、登入工作空間及建立房間；香港雙機跨網絡影音、AR 定位漂移與雙端精度仍須依 [Android 驗收](docs/ANDROID-ACCEPTANCE.md) 完成實機測試。


AR 鏡頭切換保留帶「已暫停」提示的最後畫面；只停止普通鏡頭的視訊軌，保留收音及連線。AR 影像由 XR 影格直接更新共享畫布並主動要求送出，不依赖普通頁面的計時器。首次取得影像等待 20 秒，開始共享後連續 10 秒無新影像會標示暫停並重試，不會因逾時強制退出 AR，也不把逾時當成永久不支援。手動離開 AR 後嘗試恢復普通鏡頭；恢復逾時會提示手動開啟鏡頭，遲到的相機串流會釋放。
