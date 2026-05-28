-- Character role for library sorting and manual override of auto-tiering
alter table characters
  add column if not exists role text check (role in (
    'narrator', 'protagonist', 'series_regular', 'recurring', 'guest'
  )) default 'guest';

-- Wine Lover's core cast
update characters c
set role = v.role
from series s,
  (values
    ('Narrator', 'narrator'),
    ('Nikki Sands', 'protagonist'),
    ('Derek Malveaux', 'series_regular'),
    ('Isabel', 'series_regular'),
    ('Susan', 'series_regular'),
    ('Andres', 'series_regular'),
    ('Pamela', 'series_regular'),
    ('Jennifer', 'series_regular'),
    ('Blake', 'series_regular'),
    ('Marty', 'series_regular')
  ) as v(name, role)
where c.series_id = s.id
  and s.name = 'Wine Lover''s Mysteries'
  and c.canonical_name = v.name;
