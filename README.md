# VisionLink · 即時視覺 AI 協作

雙人遠程貨品驗收 Web 應用，結合 WebRTC、Wonderland Engine 1.6.1 / WebXR、瀏覽器端 AI、條碼核對與 Cloudflare Workers / D1。

[開啟正式網站](https://visionlink-hk.visionlink-workspace.workers.dev/workspace/) · [註冊／登入](https://visionlink-hk.visionlink-workspace.workers.dev/login/) · [使用與測試](docs/GETTING-STARTED.md)

## 使用網站

首次使用在登入頁按「首次使用？免費建立帳戶」，輸入顯示名稱並保存自己的個人金鑰，再進入工作空間建立房間。受邀夥伴憑完整房間邀請免登入加入。GitHub 帳戶與網站帳戶分開，無需你的管理員金鑰。

房間最多兩人、有效一小時。私人紀錄按帳戶隔離。自行註冊每個網絡每 UTC 日最多 3 個名額，整站每日 100 個。登入金鑰只顯示一次，沒有電郵找回功能。

## 功能與實際範圍

| 功能 | 已提供 |
| --- | --- |
| 即時協作 | 雙向影音、鏡頭切換、獨立收音、指令與驗收清單同步 |
| 貨號核對 | 本機條碼／QR、訂單精確比對、4 筆虛構設備／貨箱資料與示範 QR；可匯入本機 JSON |
| 視覺 AI | MediaPipe 物件／人臉位置、AI 結果及帶標記影像同步；不辨識個人身份 |
| 協作指令 | 箭頭、圈選、畫線及文字同步，暫停畫面、撤回與清除；指令隨巡檢紀錄保存 |
| AR | 真實 WebXR 平面定位、文字／箭頭／圈選／逐點線條固定、三點對齊及 XR 鏡頭分享 |
| 紀錄 | 登入者保存自己的 D1 紀錄、離線草稿、JSON 匯出與 PNG 擷取 |
| 貨箱損傷 | 已訓練實驗模型、ONNX 本機推論及公開測試報告；結果須人工覆核 |

桌面通常使用 3D 預覽，原生 AR 需支援的裝置／瀏覽器。一般畫面標記跟隨影像位置；AR 標記記錄真實空間位置。沒有完整實景 3D 重建或自動共享世界錨點。實驗損傷模型未通過現場泛化驗證，不可作為自動合格／拒收依據。

遠端在「夥伴視角」繪製指令後，按「固定到實物（AR）」；現場對準實物位置按「固定這個指令」。箭頭末端／文字起點落在確認位置，圈選及線條按約 25 公分範圍轉為平面圖形。這是人工確認定位，不會自動推算深度或追蹤移動設備。AI 自動顯示名稱／紅色疑似損傷檢查框；損傷框是中央分類範圍，AR 定位需人工確認。

資料卡的庫存及維修紀錄全部是**示範資料**。Motor A／Valve 03 由條碼對應資料表取得，不代表 AI 能辨識馬達型號。JSON 只在本次頁面載入；已選資料卡可隨私人巡檢紀錄保存，尚未介接真正庫存系統。

## 本機啟動

需要 **Node.js 24** 與 npm。Windows 可使用 npm.cmd。

```sh
npm ci
npm run prepare:runtime
npm run check
npm run build:independent
npm run start:independent
```

開啟 http://localhost:4174 。第一次管理員設定碼會寫入被 Git 忽略的 `.local-data/independent-bootstrap.txt`；本機資料庫也在 `.local-data/`。這些不屬於正式站的帳戶或資料。

本機要開放自行註冊，在未追蹤的 `.env.independent.local` 加入 `PUBLIC_REGISTRATION=true`，並先完成本機管理員設定。正式站已啟用自行註冊。

`prepare:runtime` 下載約 9.2 MB 的已發佈 Wonderland 執行資產及實驗 ONNX 模型，再下載 Google 官方 MediaPipe 模型；每個檔案驗證 SHA256。第三方 JavaScript／WASM 由 npm 套件建置。這些二進位產物與原始訓練照片不直接放入 Git。首次準備需要網絡，執行網站辨識時使用本地資產。

若公開資產的版本已改變，校驗會停止，不能跳過校驗；部署者需更新對應的 manifest 或使用 Wonderland Editor 從場景源檔重建。修改 `wonderland/` 後使用 `npm run build:wonderland`，再建置網站。

手機真實鏡頭／AR 請使用 HTTPS 正式部署；本機 HTTP 只監聽 127.0.0.1。

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

28 項程式測試通過。正式網站已實測自行註冊、登入工作空間及建立房間；香港雙機跨網絡影音、AR 定位漂移與雙端精度仍須依 [Android 驗收](docs/ANDROID-ACCEPTANCE.md) 完成實機測試。

