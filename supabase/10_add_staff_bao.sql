-- 新增師傅「寶」（民有店）；已存在則略過
insert into public.staff (store_id, display_name, commission_rate, bonus_formula)
select 'store1', '寶', 0.6000::numeric, '{"tier": "6成"}'::jsonb
where not exists (
  select 1
  from public.staff st
  where st.store_id = 'store1'
    and st.display_name = '寶'
    and st.is_active = true
);
