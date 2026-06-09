-- 15_ledger_normalize.sql — 流水帳資料正規化（在 SQL Editor 執行）
-- 建議：執行後到報表頁按「正規化流水帳」處理轉移拆分（需 API）

-- 1) 舊付款方式 → 更動的帳戶（現金 / 富邦）
update public.daily_transactions
set
  payment_methods = case
    when category = '會員使用' then '{}'::text[]
    when payment_methods && array['現金']::text[] then array['現金']::text[]
    when payment_methods && array['富邦', 'Line', '街口', '仁中信']::text[]
      or payment_methods::text ilike '%line%'
      or payment_methods::text ilike '%街口%'
      or payment_methods::text ilike '%仁中信%'
      then array['富邦']::text[]
    else payment_methods
  end,
  updated_at = now()
where store_id = 'store1';

-- 2) 支出、分紅改為負數
update public.daily_transactions
set amount = -abs(amount), updated_at = now()
where store_id = 'store1'
  and category in ('支出', '分紅')
  and amount > 0;

-- 3) 轉出改負數、轉入改正數（若已遷移類型）
update public.daily_transactions
set amount = -abs(amount), updated_at = now()
where store_id = 'store1' and category = '轉出' and amount > 0;

update public.daily_transactions
set amount = abs(amount), updated_at = now()
where store_id = 'store1' and category = '轉入' and amount < 0;

-- 4) 會員使用清空帳戶
update public.daily_transactions
set payment_methods = '{}'::text[], updated_at = now()
where store_id = 'store1' and category = '會員使用';
