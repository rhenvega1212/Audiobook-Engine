-- Fast single-query renumber after line delete/merge (replaces per-row updates in app code)
create or replace function renumber_tagged_lines(p_book_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update tagged_lines t
  set line_order = ordered.new_order
  from (
    select
      id,
      (row_number() over (order by line_order) - 1)::int as new_order
    from tagged_lines
    where book_id = p_book_id
  ) as ordered
  where t.id = ordered.id
    and t.book_id = p_book_id
    and t.line_order is distinct from ordered.new_order;
$$;

grant execute on function renumber_tagged_lines(uuid) to service_role;
