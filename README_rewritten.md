# 視界協作 · VisionLink

> 面向雙人遠程貨品驗收與現場協作的 Web 平台，結合 WebRTC、Wonderland Engine / WebXR、MediaPipe、條碼／QR 掃描與 Cloudflare Worker。

VisionLink 目前以 **Android 手機／平板作為現場端**，另一方可使用 **電腦、手機或平板** 進行雙人遠程協作。  
發起方使用個人存取金鑰登入；受邀者只需要完整房間連結即可免登入加入一小時協作，不會取得私人紀錄或帳戶管理權限，也不需要 ChatGPT 登入。

正式試用入口：

- 香港免費版：<https://visionlink-hk.visionlink-workspace.workers.dev/workspace/>

---

## ✨ 核心功能

### 雙人遠程協作

- 建立有效期一小時的雙人房間。
- 透過完整邀請連結讓受邀者免登入加入。
- 使用 WebRTC 傳送：
  - 即時影音
  - 畫面標記
  - 遠程指令
  - 驗收清單
- 支援重新整理後恢復房間。
- 支援 ICE 重新連線。
- 預設使用後置鏡頭。
- 切換鏡頭時保留影音發送通道。
- 麥克風可獨立開啟／關閉。

### 條碼與 QR 驗收

- 使用隨網站提供的 ZXing。
- 在 Worker 內讀取條碼／QR。
- 可將掃描結果與訂單欄位做精確比對。
- 可使用本機驗收照片進行測試。

目前限制：

- 不提供 OCR。
- 不提供 SKU／EAN 外部資料庫對照。

### 驗收紀錄

- 驗收紀錄儲存於 Cloudflare D1。
- 紀錄依帳戶權限隔離。
- 使用者明確儲存一次後，後續編輯會自動同步。
- 暫時離線時，會保留目前分頁內的草稿。
- 已保存紀錄可重新讀取。
- 支援：
  - 匯出 JSON
  - 擷取 PNG

### AR / 3D 協作

- 使用 Wonderland Engine 建立 3D 場景。
- 支援模型座標標記。
- 支援即時影片材質。
- 支援 WebXR 平面 hit-test 放置。
- 可使用三個參考點建立公尺座標。
- 可選擇使用 XR camera-access 分享。

目前 AR 能力仍屬於「空間標記與協作」階段：

- 影片平面本身仍然是 2D。
- 尚未進行完整實景 3D 重建。
- 尚未實作兩台裝置共享的真實世界空間錨點。

### AI 視覺輔助

目前提供通用 MediaPipe 視覺能力：

- 物件位置偵測
- 人臉位置偵測
- AI 結果遠程同步
- 標記畫面合成

損傷部分：

- 現階段仍以人工標記為主要操作方式。
- 通用模型不能宣稱能可靠識別貨箱損傷。
- 已使用公開授權真實資料在本機訓練損傷模型，並產出驗證報告。

---

## 🧭 典型使用流程

```text
發起方登入
    ↓
建立 1 小時雙人房間
    ↓
分享完整邀請連結
    ↓
受邀者免登入加入
    ↓
WebRTC 建立即時影音
    ↓
掃描條碼 / QR
    ↓
遠程標記 / 指令 / 驗收清單
    ↓
AR / 3D 空間標記
    ↓
AI 視覺結果同步
    ↓
保存驗收紀錄
    ↓
匯出 JSON / 擷取 PNG
```

---

## 🏗️ 系統架構

```text
┌───────────────────────────────────────────────────────────┐
│                      VisionLink Web                        │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐     ┌──────────────┐                    │
│  │   Field Side  │     │ Remote Side   │                    │
│  │ Android/Tablet│◄───►│ PC/Phone/Pad  │                    │
│  └──────┬───────┘     └──────┬───────┘                    │
│         │                    │                            │
│         └──────── WebRTC ────┘                            │
│                 Video / Audio                              │
│                 Markers / Commands                         │
│                 Checklist                                  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                  Web Application                     │  │
│  │  UI / Room / Checklist / Scan / Record / Export     │  │
│  └──────────────┬──────────────────────┬───────────────┘  │
│                 │                      │                  │
│         ┌───────▼────────┐     ┌───────▼────────┐         │
│         │ Wonderland / XR │     │ MediaPipe / AI │         │
│         │ 3D + Hit Test   │     │ Detection      │         │
│         └────────────────┘     └────────────────┘         │
│                                                           │
│         ┌───────────────────────────────────────────┐      │
│         │ Cloudflare Worker + D1 + TURN / Signaling │      │
│         └───────────────────────────────────────────┘      │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

---

## 🧰 技術棧

| 模組 | 技術 |
|---|---|
| 前端 | Web / TypeScript / JavaScript |
| 即時通訊 | WebRTC |
| AR / 3D | Wonderland Engine / WebXR |
| 視覺 AI | MediaPipe |
| 條碼 / QR | ZXing |
| 後端 | Cloudflare Worker |
| 資料庫 | Cloudflare D1 |
| ORM / Migration | Drizzle |
| 本機資料庫 | SQLite |
| 建置工具 | Node.js / npm / Vite / Next.js / Vinext |
| 部署 | Cloudflare |

---

## 🚀 啟動與編譯

### 環境需求

- Node.js 24
- npm
- Windows 使用 `npm.cmd`

### 安裝依賴

```powershell
npm.cmd install
```

### 啟動本機環境

```powershell
npm.cmd run start:local
```

本機網址：

```text
http://localhost:4173
```

本機 SQLite 檔位於被忽略的：

```text
.local-data/
```

本機服務只監聽：

```text
127.0.0.1
```

因此手機測試請使用正式 HTTPS 網址，而不是直接連接本機 HTTP。

### 檢查

```powershell
npm.cmd run check
```

### Build

```powershell
npm.cmd run build
```

`build` 會：

- 打包 ZXing
- 打包 Vinext / Cloudflare Worker
- 保留 Sites 官方 build integration

Cloudflare 部署清單：

```text
.openai/hosting.json
```

部署時使用 D1 binding：

```text
DB
```

Drizzle migration 位於：

```text
drizzle/
```

資料表不會在每次 request 時動態建立。

---

## 📁 重要專案目錄

```text
VisionLink/
├── app/
├── db/
├── docs/
├── drizzle/
├── lib/
├── public/
│   └── workspace/              # 主要 UI 原始碼
│       └── wonderland/         # Wonderland build 輸出
├── scripts/
├── tests/
├── wonderland/
│   └── VisionLink.wlp          # Wonderland 專案
├── .env.example
├── .gitignore
├── drizzle.config.ts
├── next.config.ts
├── package.json
├── package-lock.json
├── server.mjs
├── tsconfig.json
└── vite.config.ts
```

> 不要直接修改 `dist/` 產物。UI 原始碼位於 `public/workspace/`。

---

## 🥽 Wonderland Engine

使用已安裝並登入的 Wonderland Editor 開啟：

```text
wonderland/VisionLink.wlp
```

修改場景後重新建置：

```powershell
npm.cmd run build:wonderland
```

這個步驟會輸出實際的：

- `.bin`
- WASM
- Wonderland Engine API
- 應用 JavaScript

輸出位置：

```text
public/workspace/wonderland/
```

完成後再重新 build 整個網站。

---

## 🌐 網絡與實測

香港獨立版目前的使用方式：

1. 發起方以個人金鑰登入。
2. 建立雙人房間。
3. 產生完整邀請連結。
4. 受邀者免登入加入。
5. 房間一次最多兩人。
6. 房間有效期為一小時。
7. 私人 D1 紀錄仍依帳戶隔離。

TURN 已在現有 Cloudflare 帳戶設定。

正式站已驗證可以取得 relay 位址。

---

## 🔒 權限與私隱設計

受邀者只持有短時間有效的完整房間連結。

受邀者：

- 不需要 ChatGPT 登入
- 不取得帳戶管理權限
- 不取得私人驗收紀錄
- 不會因加入房間而取得其他歷史資料

私人紀錄仍按照發起方帳戶進行隔離。

---

## ⚠️ 目前限制

VisionLink 目前仍屬於試點 / Demo 階段，以下功能不應被誇大描述：

- 沒有實景完整 3D reconstruction。
- 沒有跨裝置共享真實世界 anchor。
- MediaPipe 通用模型不能被描述為可靠貨箱損傷辨識模型。
- 條碼功能不提供 OCR。
- 條碼功能不提供 SKU / EAN 外部資料庫查詢。

---

## 🛣️ 後續方向

目前已加入或正在驗證的方向包括：

- AI 結果遠程同步
- 標記畫面合成
- 三參考點公尺座標
- 可選 XR camera-access 分享
- 損傷模型本機訓練與驗證

後續可以繼續擴展：

- 更穩定的 AR 空間標記
- 遠程 Pin / Arrow / Text annotation
- AI 偵測結果與 AR marker 自動連結
- 多種驗收任務模板
- 更完整的損傷模型驗證與報告
- 真正跨裝置共享的空間 anchor

---

## 📌 開發注意事項

請不要把以下內容提交到 Git：

```text
node_modules/
.next/
dist/
build/
.local-data/
.env
```

建議只提交：

- 原始碼
- 設定檔
- migration
- Wonderland 專案
- README / docs
- `.env.example`

---

## 📄 專案定位

VisionLink 目前的核心目標不是建立完整 3D 數位孿生，而是：

> **讓兩地使用者透過即時影音、AI 視覺、AR / 3D 空間標記與驗收流程，在瀏覽器中完成遠程貨品驗收與現場協作。**
