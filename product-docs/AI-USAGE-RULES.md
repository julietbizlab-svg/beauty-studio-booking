# AI 使用規則｜省額度操作守則

本文件用來規範：什麼情況需要問 ChatGPT，什麼情況應該先看文件、自己判斷或用 Terminal 確認。

目的不是少用 AI，而是把 AI 用在最有價值的地方。

---

## 一、核心原則

凡是問過 2 次以上的問題，都要整理成 SOP、模板或檢查表。

ChatGPT 不應該當成臨時記憶。

正確分工：

| 工具 | 主要用途 |
|---|---|
| ChatGPT | 判斷、設計、排錯、商業策略、安全風險 |
| Terminal | 執行指令、確認狀態 |
| 文件 | 保存固定流程、話術、SOP |
| Cursor | 寫檔案、改程式 |
| Codex | 審查大型程式、架構、安全性 |

---

## 二、不需要問 AI 的情況

以下情況可以自己判斷，不需要每次問 ChatGPT。

### 1. Git 狀態乾淨

如果 Terminal 顯示：

```text
nothing to commit, working tree clean

商品母版不要直接改
新客戶要複製母版
客戶版才可以改店名、服務、顏色、價格
不要刪 backend / customer-ui / owner-admin / docs / scripts
不要把 Token、密碼、驗證碼放進 GitHub
不要請客戶提供密碼或驗證碼
