-- Trip King — reference-data seed (cities + app settings)
-- These are real reference rows, not prototype mock data: cities the
-- marketplace operates in, and the platform default settings.

insert into public.cities (name, state, lat, lng) values
  ('Vellore',     'Tamil Nadu',     12.9165, 79.1325),
  ('Chennai',     'Tamil Nadu',     13.0827, 80.2707),
  ('Pondicherry', 'Puducherry',     11.9416, 79.8083),
  ('Bangalore',   'Karnataka',      12.9716, 77.5946),
  ('Tirupati',    'Andhra Pradesh', 13.6288, 79.4192),
  ('Salem',       'Tamil Nadu',     11.6643, 78.1460),
  ('Coimbatore',  'Tamil Nadu',     11.0168, 76.9558),
  ('Madurai',     'Tamil Nadu',      9.9252, 78.1198),
  ('Trichy',      'Tamil Nadu',     10.7905, 78.7047),
  ('Hosur',       'Tamil Nadu',     12.7409, 77.8253)
on conflict do nothing;

insert into public.app_settings (id) values (1) on conflict (id) do nothing;
