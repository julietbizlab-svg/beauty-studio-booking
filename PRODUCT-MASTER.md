# beauty-studio-booking｜商品母版

本專案是「美業一人工作室 LINE 預約管理系統」的商品母版。

## 一、母版定位

`beauty-studio-booking` 是標準模板，不是某一位客戶的專案。

用途：
- 作為所有新客戶系統的起點
- 保留標準功能
- 保留商品化文件
- 保留可複製流程
- 不直接放入任何單一客戶機密資料

## 二、母版不可直接修改的原則

新增客戶時，不要直接修改本專案作為客戶正式版。

正確流程：

1. 複製本專案
2. 建立新的客戶專案資料夾
3. 建立新的 GitHub Repo
4. 替換客戶設定
5. 建立客戶專屬 Notion
6. 建立客戶專屬 Cloudflare Worker
7. 建立客戶專屬 LINE LIFF
8. 測試完成後交付

## 三、母版可以放的內容

- 通用前端程式
- 通用後端程式
- 商品化文件
- 複製流程文件
- 報價草稿
- 客戶資料蒐集表
- 交付檢查表

## 四、母版不可以放的內容

- 客戶 Notion Token
- 客戶 Cloudflare API Token
- 客戶 LINE Channel Secret
- 客戶個資
- 客戶預約紀錄
- 客戶專屬 .dev.vars

## 五、相關文件

| 文件 | 用途 |
|---|---|
| CLIENT-SETUP-GUIDE.md | 系統設定說明 |
| COPY-FOR-NEW-CLIENT.md | 複製給新客戶流程 |
| product-docs/CLIENT-INFO-CHECKLIST.md | 客戶資料蒐集表 |
| product-docs/PRICING-DRAFT.md | 報價方案草稿 |
| product-docs/CLIENT-DELIVERY-CHECKLIST.md | 客戶交付清單 |

文件版本：v1.0
建立日期：2026-07-12
