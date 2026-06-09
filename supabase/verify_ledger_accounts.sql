-- verify_ledger_accounts.sql — 執行前先檢查舊帳戶是否已透過轉移清空
-- 在 Supabase SQL Editor 執行，確認結果後再跑 15_ledger_normalize.sql

-- 1) 各付款方式淨額（應接近 0 才可安全合併到富邦）
select
  account,
  count(*) as rows,
  sum(amt) as net_amount
from (
  select
    unnest(payment_methods) as account,
    case
      when category in ('支出', '工資', '分紅') then -abs(amount)
      when category = '轉出' then -abs(amount)
      when category = '轉入' then abs(amount)
      when category = '轉移' then amount
      else amount
    end as amt
  from public.daily_transactions
  where store_id = 'store1'
) t
group by account
order by account;

-- 2) 舊帳戶 Line / 街口 / 仁中信 是否還有餘額
select
  account,
  sum(amt) as net_amount
from (
  select unnest(payment_methods) as account, amount as amt
  from public.daily_transactions
  where store_id = 'store1'
    and payment_methods && array['Line', '街口', '仁中信']::text[]
) t
where account in ('Line', '街口', '仁中信')
group by account;

-- 3) 轉移類（含標題提到舊帳戶）
select occurred_on, amount, category, payment_methods, left(title, 60) as title
from public.daily_transactions
where store_id = 'store1'
  and (
    category in ('轉移', '轉出', '轉入')
    or title ilike '%line%'
    or title ilike '%街口%'
    or title ilike '%仁中信%'
    or payment_methods && array['Line', '街口', '仁中信']::text[]
  )
order by occurred_on desc
limit 50;

-- 4) 合併模擬：若全部映射為現金/富邦後，銀行帳戶淨額
with mapped as (
  select
    case
      when category = '會員使用' then null
      when payment_methods && array['現金']::text[] then '現金'
      when payment_methods && array['富邦', 'Line', '街口', '仁中信']::text[]
        or payment_methods::text ilike '%line%'
        then '富邦'
      else null
    end as account,
    case
      when category in ('支出', '工資', '分紅') then -abs(amount)
      when category = '轉出' then -abs(amount)
      when category = '轉入' then abs(amount)
      else amount
    end as amt
  from public.daily_transactions
  where store_id = 'store1'
)
select account, sum(amt) as net_after_merge
from mapped
where account is not null
group by account;
