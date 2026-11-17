-- =====================================================================
-- SEV Wiki, step 4 of 5: cars and subteams. Edit freely before running.
-- ids are the slugs used in URLs (lowercase letters, digits, hyphens).
-- global_only = content is shared by every car; restricted = members only.
-- =====================================================================

insert into public.cars (id, name, status, sort_order) values
  ('car-solstice', 'Solstice',        'Active',  1),
  ('car-gemini',   'Gemini',          'Concept', 2),
  ('car-legacy',   'Aurora (Legacy)', 'Legacy',  3)
on conflict (id) do nothing;

insert into public.subteams (id, name, restricted, global_only, sort_order) values
  ('sub-exec',       'Exec & Leadership',      true,  true,  1),
  ('sub-ops',        'Operations & Logistics', false, true,  2),
  ('sub-aero',       'Aero',                   false, false, 3),
  ('sub-battery',    'Battery',                false, false, 4),
  ('sub-powertrain', 'Powertrain',             false, false, 5)
on conflict (id) do nothing;
