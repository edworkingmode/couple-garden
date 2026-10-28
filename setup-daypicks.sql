-- 天數頁要顯示哪些日子：每個人各自設定（最多 4 個）。貼到 Supabase SQL Editor 執行。
-- 內容例如 ["meet","started","d:紀念日的id"]；空的（null）就用預設：見面倒數、在一起、認識、最近的紀念日。
alter table cg_profiles add column if not exists day_picks jsonb;
