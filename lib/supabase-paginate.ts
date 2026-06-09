const DEFAULT_PAGE_SIZE = 1000;

export interface PageResult<T> {
  rows: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Fetch all rows from Supabase using offset pagination.
 * PostgREST caps each request at 1000 rows — this loops until complete.
 */
export async function fetchAllPages<T>(
  fetchPage: (offset: number, pageSize: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await fetchPage(offset, pageSize);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

export function slicePage<T>(all: T[], page: number, pageSize: number): PageResult<T> {
  const totalCount = all.length;
  const start = page * pageSize;
  const rows = all.slice(start, start + pageSize);
  return {
    rows,
    totalCount,
    page,
    pageSize,
    hasMore: start + rows.length < totalCount,
  };
}
