-- Seed Michele Scott / Wine Lover's Mysteries cast (voice IDs filled by scripts/seed-voice-ids.ts)
insert into pen_names (name)
values ('Michele Scott')
on conflict (name) do nothing;

insert into series (pen_name_id, name, description)
select pn.id, 'Wine Lover''s Mysteries', 'Michele Scott wine-country mystery series'
from pen_names pn
where pn.name = 'Michele Scott'
on conflict do nothing;

-- Characters (only insert if series exists and character not present)
insert into characters (series_id, canonical_name, aliases, gender, voice_style, elevenlabs_voice_name)
select s.id, v.canonical_name, v.aliases, v.gender, v.voice_style, v.voice_name
from series s
cross join (values
  ('Narrator', array['Narrator']::text[], 'unknown', 'Professional, Bright, Warm', 'Bella'),
  ('Nikki Sands', array['Nikki', 'Sands', 'Ms. Sands']::text[], 'female', 'Elegant & Lovely', 'Eliza'),
  ('Derek Malveaux', array['Derek', 'Malveaux', 'Mr. Malveaux']::text[], 'male', 'Dark and Tough', 'Adam'),
  ('Isabel', array['Isabel']::text[], 'female', 'Warm English Female', 'Vega'),
  ('Susan', array['Susan']::text[], 'female', null, 'Janet'),
  ('Andres', array['Andres']::text[], 'male', null, 'Andres'),
  ('Pamela', array['Pamela']::text[], 'female', null, 'Cameo'),
  ('Jennifer', array['Jennifer']::text[], 'female', null, 'Brittany'),
  ('Blake', array['Blake']::text[], 'male', null, 'Kel'),
  ('Marty', array['Marty']::text[], 'male', 'Dominant, Firm', 'Adam')
) as v(canonical_name, aliases, gender, voice_style, voice_name)
where s.name = 'Wine Lover''s Mysteries'
  and not exists (
    select 1 from characters c
    where c.series_id = s.id and c.canonical_name = v.canonical_name
  );
