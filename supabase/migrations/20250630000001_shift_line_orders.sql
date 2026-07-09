-- Shift line_order for all lines after a position (used by split before insert).
create or replace function shift_tagged_line_orders(
  p_book_id uuid,
  p_after_order int,
  p_delta int
)
returns void
language sql
security definer
set search_path = public
as $$
  update tagged_lines
  set line_order = line_order + p_delta
  where book_id = p_book_id
    and line_order > p_after_order;
$$;

grant execute on function shift_tagged_line_orders(uuid, int, int) to service_role;

-- Stable ordering when line_order ties exist during renumber.
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
      (row_number() over (order by line_order, id) - 1)::int as new_order
    from tagged_lines
    where book_id = p_book_id
  ) as ordered
  where t.id = ordered.id
    and t.book_id = p_book_id
    and t.line_order is distinct from ordered.new_order;
$$;
