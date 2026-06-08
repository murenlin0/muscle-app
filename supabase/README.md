# Supabase SQL（筋棧 muscle-app）

**單一 Supabase 專案**，各店資料以 `store_id`（`store1` = 民有店、`store2` = 文一店）區分。

在 Dashboard → **SQL Editor** 依序執行：

| 順序 | 檔案 | 說明 |
|------|------|------|
| 1 | `00_reset.sql` | 刪除所有業務表（**會清空資料**） |
| 2 | `01_schema.sql` | Schema（含 `stores`、`admin_users`、各表 `store_id`） |
| 3 | `02_rls.sql` | GRANT + RLS（**缺此檔會 permission denied**） |
| 4 | `03_seed.sql` | 分店 + 服務價目 + 師傅 |

### 既有專案升級（不想清空資料）

執行 `06_multi_store.sql` 後再跑 `02_rls.sql`。既有資料預設歸到 `store1`（民有店）。

## 權限模型

| 角色 | 說明 |
|------|------|
| **super** | `admin_users.role = 'super'`，`store_id` 為 null，可讀寫所有店 |
| **store** | `admin_users.role = 'store'`，僅能存取自己的 `store_id` |
| **LINE 會員** | Phase 1 經 Next.js API（service role）+ `store_id` 過濾 |

建立超級管理員（在 Supabase Auth 建立帳號後）：

```sql
insert into public.admin_users (user_id, role, display_name)
values ('<auth.users.id>', 'super', '老闆');
```

建立店長：

```sql
insert into public.admin_users (user_id, role, store_id, display_name)
values ('<auth.users.id>', 'store', 'store1', '民有店店長');
```

## 本機環境變數（`.env.local`）

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# 各店官方 LINE 各自建立 LIFF（見下方說明）
NEXT_PUBLIC_LIFF_ID_STORE1=
NEXT_PUBLIC_LIFF_ID_STORE2=
NEXT_PUBLIC_DEV_LINE_USER_ID=dev-local-user-001
ADMIN_IMPORT_SECRET=your-secret
```

不再需要 `NEXT_PUBLIC_SUPABASE_URL_STORE1` 等分店獨立變數。

## Notion 期初匯入

```bash
npm run import:notion -- "民有店.csv" store1
```

會寫入該店的 `clients`（`store_id = store1`）。

## 驗證

執行 `verify.sql` 檢查表與 `stores` 種子資料。
