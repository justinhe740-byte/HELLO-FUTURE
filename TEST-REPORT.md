# HELLO, FUTURE. — 發布及 iPhone 交付驗證

驗證日期：2026-10-21（香港時間）。

**目前未完成最終交付：公開新倉庫已建好並推送 main，但啟用 Pages 嘅 API 被 GitHub 整合權限拒絕，網站未部署；真實 iPhone 微信「儲存到相片」尚未實機驗收。** 下列模擬測試唔代表真實 iPhone／微信已驗收。

## 已完成嘅必要修改

- 保留四幕、視覺、星球、世界規則、雙語同紀念卡。網站仍然係單一靜態 `index.html`，冇執行階段依賴、外部資源或付費 API。
- 加入 `viewport-fit=cover`、上下左右 safe-area、`100dvh` 同 `100vh`／`innerHeight` 回退；橫竪屏變化只更新畫布背景同視口，唔重設創作。
- 語言、音效、次要按鈕同選項有最少 44px 點擊高度；工具按鈕有最少 44px 寬度。稱呼輸入字體係 16px，避免 iOS 聚焦時自動放大。
- 畫布圓角改用基本路徑，唔依賴 `Canvas.roundRect`。捲動唔使用非標準 `behavior: instant`。
- 生成中鎖住選項、提交同語言按鈕；重複事件有狀態檢查。生成／PNG 失敗會解鎖，容許重試。音效唔需要 autoplay 或等待 resume 完成。
- PNG 固定 1200 × 1800（2.16MP；RGBA 畫布約 8.64MB），唔再乘 Retina DPR。景觀暫存畫布重用，唔會每次輸入稱呼都新增大型畫布。**未量度真實 iPhone 峰值記憶體或 FPS。**
- PNG 使用 `Canvas.toDataURL` → 原生 `<img>`，冇外部圖像／字型污染畫布；冇 `toBlob`、FileReader、Blob URL 前提。
- iPhone 同微信唔會自動點擊下載連結。原頁顯示完整高清圖片，並捲動到提示「長按圖片儲存到相片」。英文係 “Press and hold the image to save it to Photos.”
- 圖片唔阻止 context menu／touch callout，亦冇攔截長按手勢；圖片唔會喺離開／返回頁面時被撤銷。切換語言會更新已顯示嘅 PNG，保留選擇同稱呼。
- 根目錄已有 `index.html`、`.nojekyll`；冇 `/assets`、本地絕對資源路徑或 `file://` 依賴。內嵌 favicon 避免斷網測試時瀏覽器另行請求 `/favicon.ico`。

## 實際執行嘅瀏覽器測試

環境係 Linux，**冇接駁真實手機**。

| 引擎／工具 | 執行內容 | 邊界 |
| --- | --- | --- |
| Chromium 154.0.8037.57 | iPhone 13 尺寸、DPR 3、觸屏操作，Safari／MicroMessenger UA | 唔係 Apple Safari 或微信 App |
| Playwright WebKit 26.5（Linux WPE） | 相同觸屏流程、PNG 圖像生成同解碼、語言切換、動畫 | 唔係 iOS WebKit；冇 iOS 相片選單 |
| Chromium CDP safe-area 模擬 | 59px 頂部、34px 底部，以及橫屏左右 59px 保護區 | 唔係真實劉海／Dynamic Island |
| 原有 Chromium 回歸測試 | 300 組視覺組合、桌面 PNG 實際下載、鍵盤、離線流程、減少動態效果 | 唔驗證 iOS 下載或相簿 |

`node scripts/test-mobile.cjs` 會喺本地 HTTP `/hello-future/` 子路徑提供同一份 HTML，完成載入之後切斷網絡。

本輪移動測試：Chromium 13 組、WebKit 12 組全部通過；兩者均無頁面 JavaScript 錯誤或 console error。最後版本另完成 WebKit／微信 UA 離線流程同 PNG 煙霧測試。

已驗證：

- 開場可跳過；正常動畫亦能結束，星球過場會自動進入創作，生成動畫唔會鎖死導航。
- 三顆星球、5 個世界、4 位主角、5 種能力均可用 tap 選擇；返回／繼續流程正常。
- EN／粵語保留選擇、稱呼同世界；已生成嘅 PNG 會按新語言更新。
- 320 × 568、375 × 667、390 × 844、430 × 932、844 × 390 同再次返回直屏，全部主要畫面冇橫向溢出。
- Safari／微信 UA 模擬模式完成四幕，產生可解碼嘅 1200 × 1800 PNG，**唔會發起檔案下載或跳離頁面**。
- 停用 roundRect、toBlob、FileReader、createObjectURL 同 inert 後仍可完成流程。
- 連續觸發 12 次提交有狀態保護；刻意令 PNG 編碼失敗後顯示錯誤、解鎖並可重試。
- 無音訊 API 仍可繼續；prefers-reduced-motion 同動態視口回退正常。
- 原生 contextmenu 事件冇被程式取消；Linux WebKit 冇提供 iOS 專用 touch-callout 屬性，因此其實際行為只作代碼檢查。

測試程式只供開發者使用，依賴免費 Playwright；網站唔會載入佢。雲端 WebKit 使用官方下載，缺少嘅共享庫由 Debian 已簽名套件索引驗證後下載並解壓到 `/tmp`，冇改動系統安裝或降低 TLS／套件驗證。

## GitHub Pages 狀態及最少外部操作

- 已確認目前 GitHub 身份：`justinhe740-byte`。
- 帳戶持有人已建立公開倉庫 `justinhe740-byte/HELLO-FUTURE`；已確認目前連接可讀取同推送。
- 完整網站、`.nojekyll`、說明、測試同發布腳本已推送到 `main`。
- 倉庫實際名稱係大寫 `HELLO-FUTURE`，因此 Pages 路徑亦使用相同大小寫。
- 建立新倉庫權限唔再係前提；目前未完成嘅步驟係啟用 Pages：REST `POST /repos/justinhe740-byte/HELLO-FUTURE/pages` 返回 HTTP 403 `Resource not accessible by integration`。
- 倉庫角色回報 `admin: true` 唔代表目前 GitHub 應用獲授所有管理 API；已觀察到程式碼推送成功，而 Pages 開通被拒絕。
- `.default_branch` 已係 `main`，發布腳本唔再要求額外修改倉庫 metadata。
- 腳本可以喺使用者手動啟用 Pages 之後繼續驗證。正式驗證保留 TLS 檢查並比對線上 HTML。

最少操作：帳戶持有人開啟 https://github.com/justinhe740-byte/HELLO-FUTURE/settings/pages ，Source 選 **Deploy from a branch**，Branch 選 **main**，Folder 選 **/ (root)**，撳 **Save**。唔需要新增建立倉庫權限，亦唔需要喺聊天提供 token。

- 已建立嘅倉庫：https://github.com/justinhe740-byte/HELLO-FUTURE
- 預期網站（**尚未啟用／未驗證，唔係已上線交付連結**）：`https://justinhe740-byte.github.io/HELLO-FUTURE/`

環境網絡草稿已加入 `api.github.com`、`justinhe740-byte.github.io`、`cdn.playwright.dev`、`playwright.download.prss.microsoft.com`，保留原有預設域名。之後重試已能連線 GitHub API 同下載 WebKit。草稿保存唔等於環境版本已發布，亦唔等於網站已發布；可喺環境設定審閱、保存並發布，以保留設定。

## 真實 iPhone／微信硬性驗收（未完成）

發布後必須用真實 iPhone：

1. 喺微信聊天點 HTTPS 網址，唔經 HTML 附件或檔案預覽器。
2. 等待／跳過開場，點星球，完成三項選擇，切換一次語言，確認選擇仍在。
3. 建立世界，進入禮物頁，可留空稱呼；撳保存。
4. 見到完整紀念卡，長按圖片，使用微信／iOS 提供嘅儲存圖片選項。
5. 打開相片 App，確認圖片已保存、文字完整、解像度 1200 × 1800。
6. 另用 Safari 重走流程；包含橫竪屏、軟鍵盤同 Home Indicator 檢查。

網頁唔可以靜默寫入相簿，亦唔可以繞過微信嘅網址攔截或系統長按選單限制。如果特定微信版本唔提供圖片保存選項，呢項硬性驗收就未通過，唔可以用桌面測試代替。
