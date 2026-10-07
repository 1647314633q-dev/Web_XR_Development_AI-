# 視界協作 · VisionLink

Android 手機／平板的双人遠程貨品驗收試點，包含真正的 **Wonderland Engine 1.6.1** 專案與 Runtime。已從靜態示範改成有信令服務、持久記錄和條碼核對的網站；仍需 Android、跨網絡影音與 AR 實機驗收才可投入正式工作。

香港免費獨立版已備妥，部署至自己的 Cloudflare Workers Free + D1，使用免費 `workers.dev` HTTPS 網址。發起方使用個人存取金鑰登入；受邀者憑完整房間連結免登入加入一小時協作，不取得私人紀錄或帳戶管理權限。不需要 ChatGPT 登入。設定見 [香港免費版](docs/HONG-KONG-FREE.md)，實測見 [Android 雙機測試](docs/ANDROID-ACCEPTANCE.md)。舊 Sites 與獨立版資料庫分開，舊紀錄不會自動搬移。

## 可使用的流程

- 建立一小時的雙人房間，分享完整邀請連結；WebRTC 傳送影音、畫面標記、指令和驗收清單。
- 預設後置鏡頭，切換鏡頭保留影音發送通道；收音獨立開啟。支援重新整理恢復房間與 ICE 重連。
- ZXing 隨網站提供，在 Worker 內讀取條碼／QR，精確比對訂單欄；可使用本機驗收照片測試。不提供 OCR 或 SKU／EAN 資料庫對照。
- 記錄存到 D1，依帳戶限制存取。明確儲存一次後，後續編輯自動同步；暫時離線保留該分頁的草稿。可重讀記錄或匯出 JSON、擷取 PNG。
- Wonderland 3D 場景、模型座標標記、即時影片材質及 AR 平面 hit-test 放置。影片平面仍是 2D，沒有實景 3D 重建或兩台裝置共享的真實空間錨點。
- 通用 MediaPipe 物件／人臉位置偵測，模型隨網站提供；損傷由人工標記。通用模型不能宣稱識別貨箱損傷。

## 啟動與編譯

需要 Node.js 24 及 npm。Windows 用 `npm.cmd`。

```powershell
npm.cmd install
npm.cmd run start:local
```

本機網址 http://localhost:4173 ，SQLite 檔位於被忽略的 `.local-data/`。本機服務只監聽 127.0.0.1；手機請使用正式 HTTPS 網址。

```powershell
npm.cmd run check
npm.cmd run build
```

`build` 打包 ZXing 及 Vinext／Cloudflare Worker，保留 Sites 官方 build integration。部署清单 `.openai/hosting.json` 使用 D1 `DB`；Drizzle 遷移在 `drizzle/`，不在請求時建立資料表。UI 原始碼在 `public/workspace/`，不要直接修改產物 `dist/`。

## Wonderland

以已安裝及登入的 Editor 開啟 `wonderland/VisionLink.wlp` 修改場景。重建使用 `npm.cmd run build:wonderland`，將實際 `.bin`、WASM、引擎 API 和应用 JS 匯出至 `public/workspace/wonderland/`。之後再次 build 網站。

## 網絡与實測

香港獨立版由發起方登入個人金鑰建立房間；受邀者使用有效完整連結免登入加入，一次兩人、有效一小時。私人 D1 紀錄仍按帳戶隔離。TURN 已在現有 Cloudflare 帳戶設定，正式站取得 relay 位址已驗證。

新增 AI 結果遠程同步、標記畫面合成、三參考點公尺座標及可選 XR camera-access 分享。損傷模型已以公開授權真實資料在本機訓練，並產出驗證報告；

