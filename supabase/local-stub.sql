-- Minimale nabootsing van wat Supabase zelf al meelevert (auth, storage,
-- rollen), zodat schema.sql en test.sql op een kale PostgreSQL draaien.
-- Dit bestand hoort NIET in je Supabase-project — daar bestaat dit al.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema if not exists auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  -- Hier zet Supabase mee wat de client bij het aanmelden meegeeft via
  -- options.data. Camp gebruikt dat voor de uitnodigingscode.
  raw_user_meta_data jsonb
);
-- In Supabase leest auth.uid() de JWT; hier lezen we een sessie-variabele.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('camp.test_uid', true), '')::uuid;
$$;

create schema if not exists storage;
create table storage.buckets (
  id                 text primary key,
  name               text,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text,
  name      text,
  owner     uuid
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(p text) returns text[] language sql immutable as $$
  select (string_to_array(p, '/'))[1:array_length(string_to_array(p, '/'), 1) - 1];
$$;

grant usage on schema public, auth, storage to anon, authenticated;

-- Belangrijk voor een eerlijke test: Supabase zet standaardrechten zo dat ELKE
-- nieuwe tabel in "public" automatisch volledig toegankelijk wordt voor anon en
-- authenticated. Als we dat hier niet nabootsen, kan anon er lokaal toch al niet
-- bij en bewijst een test dat anon niets ziet helemaal niets. Met deze regel
-- moet schema.sql die rechten actief weer afpakken — net als in het echt.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
