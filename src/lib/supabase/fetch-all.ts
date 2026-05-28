import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaggedLine } from "@/lib/types/database";

export const SUPABASE_PAGE_SIZE = 1000;

/**
 * Fetch all rows from a Supabase query that may exceed the default 1000-row limit.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  while (true) {
    const from = offset;
    const to = offset + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    all.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
    offset += SUPABASE_PAGE_SIZE;
  }

  return all;
}

export async function fetchAllTaggedLines<T = TaggedLine>(
  client: SupabaseClient,
  bookId: string,
  select = "*"
): Promise<T[]> {
  return fetchAllPages<T>(async (from, to) => {
    const { data, error } = await client
      .from("tagged_lines")
      .select(select)
      .eq("book_id", bookId)
      .order("line_order")
      .range(from, to);
    return { data: data as T[] | null, error };
  });
}
