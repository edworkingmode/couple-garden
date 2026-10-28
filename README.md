# 瓶中花 Bloom Jar（試用中）

給情侶用的每日小儀式：完成約定的事就在玻璃球裡長出一朵花，不乖會收到小黑花，可以申訴、可以用花贖回；另外有紀念日、在一起天數、異地見面倒數與兩地時間。

## 設定步驟
1. Supabase → SQL Editor → New query，貼上 `setup.sql` 全部內容 → Run。
2. Supabase → Authentication → Sign In / Providers → Email：關掉 **Confirm email**（不用寄信，註冊後直接能用）。
3. `config.js` 填 Project URL 與 publishable key（公開金鑰，不是密碼）。
4. 放到 GitHub Pages。

## 檔案
- `index.html`：頁面與樣式　- `app.js`：程式　- `config.js`：Supabase 設定　- `setup.sql`：資料表與權限
- 素材：`bg*.mp4`、`bg*.jpg`（背景，來自 MotionSites，使用前確認授權）、`flowers*.png`（取自背景影片並改色）
- 圖示 `icon-*.png`、`apple-touch-icon.png` 為暫時版，之後換成自己設計的。

## 資料與權限
- 資料表皆以 `cg_` 開頭，與舊版 `meals` 分開。
- 每個人只能讀寫自己這一對的資料（Row Level Security）；配對透過 `cg_create_couple` / `cg_join_couple` 函式。
