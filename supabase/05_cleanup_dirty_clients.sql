-- 清除第一次匯入留下的非 VIP 髒名字（新匯入會以 phone 重建正確資料）
delete from public.clients
where is_vip = false
  and (
    name like '%/%'
    or name like '%、%'
    or name like '%+%'
    or name like '%分%'
    or name like '仁%'
    or name like '錦%'
    or name like '湘%'
    or name like '杰恩%'
  );
