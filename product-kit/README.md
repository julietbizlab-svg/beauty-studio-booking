# Juliet Studio OS 商品安裝包

這個資料夾是平台經營者使用的正式入口。目標是讓系統可以重複安裝、驗收、升級與除蟲，同時避免把密碼或客戶資料放進交付檔。

## 先看哪一份

1. [00-目錄與快速開始.md](manuals/00-目錄與快速開始.md)
2. 第一次建立平台：看 [01-平台安裝說明.md](manuals/01-平台安裝說明.md)
3. 新增訂閱業主：看 [02-新增訂閱業主.md](manuals/02-新增訂閱業主.md)
4. 交給業主操作：看 [03-業主使用說明書.md](manuals/03-業主使用說明書.md)
5. 升級或除蟲：看 [04-升級與除蟲.md](manuals/04-升級與除蟲.md)
6. 小幅客製：看 [05-小修改指南.md](manuals/05-小修改指南.md)

## 三個重要原則

- 平台只安裝一次；一般訂閱業主只新增 tenant，不重建 OA、LIFF、Worker 或 Pages。
- secrets 永遠由平台經營者在 Cloudflare／LINE 後台設定，不放進安裝包。
- 部署與遠端 D1 寫入前一定先備份、測試並取得當次授權。

## 本機指令

```bash
./product-kit/bin/check-system.sh
./product-kit/bin/install-local.sh
node product-kit/bin/build-package.mjs
```

`install-local.sh` 只安裝本機相依套件並跑測試，不會部署或修改遠端資料。

## 目前修正版

2026-08-20 第一版營業時段手機排版實機不合格，current 安裝包已撤下。第二版固定外框修正已完成本機測試，但必須等重新部署及手機實機確認後才可重建 current 包。其他功能細節請看 `manuals/00-目錄與快速開始.md`、`manuals/03-業主使用說明書.md` 與 `manuals/04-升級與除蟲.md`。
