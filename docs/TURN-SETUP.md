# TURN 搭建與接線

建議雙人試點使用 Cloudflare Realtime 託管 TURN，免維護獨立主機；也保留 Coturn 接口。服務尚未開通前，介面會顯示「TURN 中繼尚未設定」，不能宣稱跨網絡影音已驗證。

## Cloudflare Realtime

1. 使用你的 Cloudflare 帳戶登入 Dashboard，找到 Realtime → TURN。以 VisionLink 試點用途建立 TURN Key。新帳戶的條款、帳戶建立與任何付款步驟由帳戶持有人處理。
2. 長期 API token 留在伺服器。執行 `powershell -NoProfile -File scripts/configure-turn.ps1`，在本機提示中輸入 Key ID 及隱藏的 API token；會建立被 Git 忽略的 `.env.local`。不要把 token 放進聊天、前端檔案或邀請連結。
3. 本機啟動使用 `npm run start:local`。已部署 Sites 要在 Runtime Environment 設定 `CLOUDFLARE_TURN_KEY_ID` 及秘密值 `CLOUDFLARE_TURN_API_TOKEN`，不能只修改本機檔案。之後重新部署使設定生效。
4. 後端向官方 API 取得一小時的临時 ICE 憑證。前端只取得短期憑證，長期 token 不會傳给瀏覽器。
5. 連線視窗按「測試 TURN 可用性」，應取得 relay 位址。雙方勾選「強制 TURN 中繼」後建立新房間，驗證不同網絡下的影音、指令及標記。只取得 relay 位址不等同完整雙人連線通過。

查核日期 2026-10-07：官方公布 SFU／TURN 合計每月前 1,000 GB 免費，超額 US$0.05／GB；正式開通時需再確認帳戶方案及用量。

官方：[憑證產生 API](https://developers.cloudflare.com/realtime/turn/generate-credentials/)、[價格](https://developers.cloudflare.com/realtime/sfu/platform/pricing/)。

## 自架 Coturn

需要 Linux 主機、公網 IP、可用域名及防火牆規則。TURN UDP/TCP 3478，TLS 5349（或專用 443），及設定的 UDP relay 端口範圍都必須可達。一般 HTTP tunnel 不能取代 TURN 的 UDP/TCP 中繼。

按官方 [Coturn 設定](https://github.com/coturn/coturn/blob/master/docker/coturn/turnserver.conf)啟用 `use-auth-secret`，設定相同的 `static-auth-secret`，搭配 realm、公網 external-ip、relay 範圍及有效 TLS 憑證。不要把內網或管理服務暴露作中繼目標；正式主機須按網絡架構配置防火牆和用量限制。

Sites／本機環境設 `TURN_URLS`（逗號分隔的 turn／turns URL）及秘密值 `TURN_SHARED_SECRET`。本機可使用 `scripts/configure-turn.ps1 -Provider coturn`。後端以時間戳及 HMAC 產生短期 Coturn 憑證。

2026-10-07 已將帳戶持有人建立的 Cloudflare `XR_WORKSHOP` TURN 應用程式接至現有 Sites 網站。Key ID 與 API token 都以後端秘密環境值儲存；部署採用環境設定 revision 1。已部署網站成功取得 relay 位址，桌面雙頁勾選強制中繼後建立連線，雙向協作指令通過。Android 相機／收音、行動數據與 Wi-Fi 跨網絡影音、AR 追蹤仍需兩台實機驗收。
