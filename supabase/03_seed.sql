-- =============================================================================
-- 03_seed.sql — 分店 + 各店服務價目 + 示範師傅
-- =============================================================================

insert into public.stores (id, name, area)
values
  ('store1', '林口民有店', '新北市林口區'),
  ('store2', '林口文一店', '新北市林口區')
on conflict (id) do update set
  name = excluded.name,
  area = excluded.area,
  is_active = true;

-- 各店服務價目（目前相同，之後可各店獨立調整）
insert into public.services (store_id, name, duration_minutes, price_cash, price_member, sort_order)
select s.id, v.name, v.duration_minutes, v.price_cash, v.price_member, v.sort_order
from public.stores s
cross join (
  values
    ('30分鐘', 30, 700, null::integer, 1),
    ('60分鐘', 60, 1200, 1000, 2),
    ('90分鐘', 90, 1700, 1500, 3),
    ('120分鐘', 120, 2100, 1900, 4)
) as v(name, duration_minutes, price_cash, price_member, sort_order)
on conflict (store_id, duration_minutes) do update set
  name = excluded.name,
  price_cash = excluded.price_cash,
  price_member = excluded.price_member,
  sort_order = excluded.sort_order,
  is_active = true;

-- 師傅（先寫入民有店；文一店開業後可再補）
insert into public.staff (store_id, display_name, commission_rate, bonus_formula)
select 'store1', v.display_name, v.commission_rate, v.bonus_formula
from (
  values
    ('仁', 0.6000::numeric, '{"tier": "6成"}'::jsonb),
    ('錦', 0.7000::numeric, '{"tier": "7成"}'::jsonb),
    ('約翰', 0.6000::numeric, '{"tier": "6成"}'::jsonb),
    ('湘', 0.7000::numeric, '{"tier": "7成"}'::jsonb),
    ('杰恩', 0.7000::numeric, '{"tier": "7成"}'::jsonb)
) as v(display_name, commission_rate, bonus_formula)
where not exists (
  select 1
  from public.staff st
  where st.store_id = 'store1'
    and st.display_name = v.display_name
    and st.is_active = true
);
