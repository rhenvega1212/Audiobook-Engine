-- Expand Wine Lover's aliases to reduce duplicate detected speakers
update characters c
set aliases = v.aliases
from series s,
  (values
    ('Nikki Sands', array['Nikki', 'Sands', 'Ms. Sands', 'Miss Sands']::text[]),
    ('Derek Malveaux', array['Derek', 'Malveaux', 'Mr. Malveaux', 'Detective Malveaux']::text[]),
    ('Susan', array['Susan', 'Susan Jennings']::text[]),
    ('Isabel', array['Isabel', 'Isabel Fernandez']::text[]),
    ('Kristof Waltman', array['Kristof', 'Waltman']::text[])
  ) as v(name, aliases)
where c.series_id = s.id
  and s.name = 'Wine Lover''s Mysteries'
  and c.canonical_name = v.name;
