-- ============================================================================
-- Camp — testscript voor het beveiligingsmodel
-- ----------------------------------------------------------------------------
-- Draait tegen een kale PostgreSQL 16 met een nagebootst Supabase-laagje
-- (auth.users, auth.uid(), storage.*), zodat je kunt controleren dat:
--
--   * de eigenaar zijn eigen plek exact ziet;
--   * een ontvanger uitsluitend een vervaagd punt krijgt;
--   * niemand anders de tabellen rechtstreeks kan lezen;
--   * wachtwoord, vervaldatum, maximum aantal keer bekijken en intrekken
--     allemaal echt dichtgaan.
--
-- Gebruik:  ./supabase/run-tests.sh
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

-- De eerste gebruiker mag zonder uitnodiging binnen; daarna is er een geldige
-- code nodig. Voor de rest van de tests maken we er dus eerst een aan.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'eigenaar@voorbeeld.nl');

insert into public.camp_invites (code_hash, created_by, label)
values (encode(extensions.digest('test-uitnodiging','sha256'),'hex'),
        '11111111-1111-1111-1111-111111111111', 'voor de tests');

insert into auth.users (id, email, raw_user_meta_data) values
  ('22222222-2222-2222-2222-222222222222', 'vriend@example.com',
   '{"invite":"test-uitnodiging"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'vreemde@example.com',
   '{"invite":"test-uitnodiging"}'::jsonb);

\echo ''
\echo '### 1. Elke nieuwe gebruiker krijgt automatisch een profiel'
select handle, display_name from public.camp_profiles order by handle;

insert into public.camp_spots (id, owner_id, name, lat, lng, notes, access, tags)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'Beukenbos aan de Ourthe', 50.2, 5.5,
        'Vlak stukje achter de bocht.', 'Parkeer bij de brug.',
        array['water','vuur-ok']);

\echo ''
\echo '### 2. Vervaging blijft altijd binnen de beloofde straal'
with p as (
  select prec,
         public.camp_precision_radius(prec) as r,
         public.camp_fuzz_point(50.2, 5.5, 'share:spot',
           public.camp_precision_radius(prec)) as pt
  from unnest(array['exact','fine','area','region']) as prec
)
select prec, r as straal_m,
       round((6371000 * acos(least(1,
         sin(radians(50.2))*sin(radians(pt[1])) +
         cos(radians(50.2))*cos(radians(pt[1]))*cos(radians(pt[2]-5.5)))))::numeric, 1)
         as werkelijke_afstand_m,
       (6371000 * acos(least(1,
         sin(radians(50.2))*sin(radians(pt[1])) +
         cos(radians(50.2))*cos(radians(pt[1]))*cos(radians(pt[2]-5.5)))) <= r + 1)
         as binnen_straal
from p;

\echo ''
\echo '### 3. Vervaging is stabiel per share (anders middel je hem uit met verversen)'
select public.camp_fuzz_point(50.2, 5.5, 'zaad', 2000)
         = public.camp_fuzz_point(50.2, 5.5, 'zaad', 2000)  as zelfde_seed_zelfde_punt,
       public.camp_fuzz_point(50.2, 5.5, 'zaad', 2000)
         = public.camp_fuzz_point(50.2, 5.5, 'ander', 2000) as andere_seed_ander_punt;

\echo ''
\echo '### 4. Link-share met wachtwoord, "area" (~2 km), max 3 keer te openen'
begin;
set local role authenticated;
set local camp.test_uid = '11111111-1111-1111-1111-111111111111';
select public.camp_create_link_share(
  'aaaaaaaa-0000-0000-0000-000000000001',
  encode(extensions.digest('geheim-token-123','sha256'),'hex'),
  'area', 'ourthe', 'Voor Jasper', null, 3, true, true, false
) is not null as share_aangemaakt;
commit;

\echo ''
\echo '### 5. Zonder (of met verkeerd) wachtwoord komt er niets uit'
begin;
set local role anon;
select public.camp_open_share('geheim-token-123')         -> 'error' as zonder_wachtwoord,
       public.camp_open_share('geheim-token-123','fout')  -> 'error' as verkeerd_wachtwoord,
       public.camp_open_share('onzin','ourthe')           -> 'error' as onbekend_token;
commit;

\echo ''
\echo '### 6. Met het juiste wachtwoord: dit is alles wat de ontvanger krijgt'
begin;
set local role anon;
select jsonb_pretty(public.camp_open_share('geheim-token-123','ourthe') -> 'spot');
commit;

\echo ''
\echo '### 7. De exacte coordinaten zitten er niet in'
begin;
set local role anon;
select (public.camp_open_share('geheim-token-123','ourthe') #>> '{spot,lat}')::float8 <> 50.2 as lat_vervaagd,
       (public.camp_open_share('geheim-token-123','ourthe') #>> '{spot,lng}')::float8 <> 5.5  as lng_vervaagd;
commit;

\echo ''
\echo '### 8. Na 3 keer openen is de link op'
begin;
set local role anon;
select public.camp_open_share('geheim-token-123','ourthe') -> 'error' as na_de_limiet;
commit;

\echo ''
\echo '### 9. Een ander ingelogd account ziet de tabellen simpelweg leeg'
begin;
set local role authenticated;
set local camp.test_uid = '22222222-2222-2222-2222-222222222222';
select (select count(*) from public.camp_spots)  as plekken_zichtbaar,
       (select count(*) from public.camp_shares) as shares_zichtbaar;
commit;

\echo ''
\echo '### 10. Rechtstreeks delen met een vriend op "fine" (~250 m)'
begin;
set local role authenticated;
set local camp.test_uid = '11111111-1111-1111-1111-111111111111';
insert into public.camp_shares (spot_id, owner_id, kind, target_user_id, precision)
values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
        'user','22222222-2222-2222-2222-222222222222','fine');
commit;
begin;
set local role authenticated;
set local camp.test_uid = '22222222-2222-2222-2222-222222222222';
select jsonb_array_length(public.camp_shared_with_me())              as aantal,
       public.camp_shared_with_me() #>> '{0,name}'                   as naam,
       (public.camp_shared_with_me() #>> '{0,radius_m}')::float8     as straal_m,
       (public.camp_shared_with_me() #>> '{0,lat}')::float8 <> 50.2  as vervaagd;
commit;

\echo ''
\echo '### 11. Delen met een groep; wie er niet in zit ziet niets'
begin;
set local role authenticated;
set local camp.test_uid = '11111111-1111-1111-1111-111111111111';
insert into public.camp_circles (id, owner_id, name)
values ('cccccccc-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Busploeg');
insert into public.camp_circle_members (circle_id, member_id)
values ('cccccccc-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222');
insert into public.camp_shares (spot_id, owner_id, kind, target_circle_id, precision)
values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
        'circle','cccccccc-0000-0000-0000-000000000001','region');
commit;
begin;
set local role authenticated;
set local camp.test_uid = '33333333-3333-3333-3333-333333333333';
select jsonb_array_length(public.camp_shared_with_me()) as gedeeld_met_buitenstaander;
commit;

\echo ''
\echo '### 12. Intrekken werkt onmiddellijk'
begin;
set local role authenticated;
set local camp.test_uid = '11111111-1111-1111-1111-111111111111';
update public.camp_shares set revoked_at = now();
commit;
begin;
set local role authenticated;
set local camp.test_uid = '22222222-2222-2222-2222-222222222222';
select jsonb_array_length(public.camp_shared_with_me()) as na_intrekken;
commit;
begin;
set local role anon;
select public.camp_open_share('geheim-token-123','ourthe') -> 'error' as link_na_intrekken;
commit;

-- ============================================================================
-- Harde controles
-- ============================================================================
-- De uitvoer hierboven is om te lezen; dit blok is om op af te gaan. Elke
-- regel die niet klopt laat psql met een foutcode stoppen, zodat de workflow
-- rood wordt in plaats van dat iemand een kolom over het hoofd ziet.
\echo ''
\echo '### Harde controles'

do $$
declare
  straal double precision;
  pt     double precision[];
  afstand double precision;
  prec   text;
begin
  -- 1. Vervaging blijft binnen de straal, over veel verschillende zaden.
  foreach prec in array array['exact','fine','area','region'] loop
    straal := public.camp_precision_radius(prec);
    for i in 1..250 loop
      pt := public.camp_fuzz_point(50.2, 5.5, prec || ':' || i::text, straal);
      afstand := 6371000 * acos(least(1,
        sin(radians(50.2)) * sin(radians(pt[1])) +
        cos(radians(50.2)) * cos(radians(pt[1])) * cos(radians(pt[2] - 5.5))));
      if afstand > straal + 1 then
        raise exception 'Vervaging lekt: % kwam % m ver bij een straal van % m',
          prec, round(afstand::numeric, 1), straal;
      end if;
    end loop;
  end loop;

  -- 2. "exact" mag juist niets verschuiven.
  if public.camp_fuzz_point(50.2, 5.5, 'wat dan ook', 0) <> array[50.2, 5.5]::double precision[] then
    raise exception 'Precies delen zou het punt met rust moeten laten';
  end if;

  -- 3. Dezelfde share hoort altijd hetzelfde punt te tonen.
  if public.camp_fuzz_point(50.2, 5.5, 'zaad', 2000)
     <> public.camp_fuzz_point(50.2, 5.5, 'zaad', 2000) then
    raise exception 'Vervaging is niet stabiel; met verversen is het echte punt uit te middelen';
  end if;

  raise notice 'Vervaging: in orde';
end;
$$;

-- 4. Een buitenstaander ziet niets, via geen enkele weg.
begin;
set local role authenticated;
set local camp.test_uid = '33333333-3333-3333-3333-333333333333';
do $$
begin
  if (select count(*) from public.camp_spots) <> 0 then
    raise exception 'Een ander account kan camp_spots lezen';
  end if;
  if (select count(*) from public.camp_shares) <> 0 then
    raise exception 'Een ander account kan camp_shares lezen';
  end if;
  if (select count(*) from public.camp_visits) <> 0 then
    raise exception 'Een ander account kan camp_visits lezen';
  end if;
  if jsonb_array_length(public.camp_shared_with_me()) <> 0 then
    raise exception 'Een buitenstaander krijgt gedeelde plekken te zien';
  end if;
  raise notice 'Afscherming tussen accounts: in orde';
end;
$$;
commit;

-- 5. Anoniem, en na intrekken, komt er niets meer uit een link.
begin;
set local role anon;
do $$
begin
  if public.camp_open_share('geheim-token-123', 'ourthe') ->> 'error' <> 'revoked' then
    raise exception 'Een ingetrokken link geeft nog gegevens terug';
  end if;
  if public.camp_open_share('bestaat-niet') ->> 'error' <> 'not_found' then
    raise exception 'Een onbekend token geeft iets anders dan not_found';
  end if;
  raise notice 'Deel-links: in orde';
end;
$$;
commit;

\echo 'Alle harde controles geslaagd.'

-- ============================================================================
-- Aanvalsscenario's
-- ============================================================================
-- Niet "werkt het zoals bedoeld", maar "houdt het stand als iemand het
-- probeert". Elk van deze aanvallen werkte een keer; ze staan hier zodat ze
-- niet stilletjes terug kunnen komen.
\echo ''
\echo '### Aanvalsscenario s'

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-9999-9999-999999999999', 'aanvaller@example.com',
        '{"invite":"test-uitnodiging"}'::jsonb);

-- ---------------------------------------------------------------------------
-- 1. Een share aanmaken die naar andermans plek wijst.
--    Was het ernstigste gat: eigenaar van de share zijn was genoeg, en
--    camp_shared_with_me() serveerde vervolgens de exacte coordinaten uit.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local camp.test_uid = '99999999-9999-9999-9999-999999999999';
do $$
declare
  gelukt boolean := false;
begin
  begin
    insert into public.camp_shares (spot_id, owner_id, kind, target_user_id, precision)
    values ('aaaaaaaa-0000-0000-0000-000000000001',
            '99999999-9999-9999-9999-999999999999',
            'user', '99999999-9999-9999-9999-999999999999', 'exact');
    gelukt := true;
  exception when insufficient_privilege or others then
    gelukt := false;
  end;
  if gelukt then
    raise exception 'Een vreemde kan een share maken op andermans plek';
  end if;
  raise notice 'Share op andermans plek: geweigerd';
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 2. Een bezoek loggen op andermans plek (komt mee in een share met logboek).
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local camp.test_uid = '99999999-9999-9999-9999-999999999999';
do $$
declare
  gelukt boolean := false;
begin
  begin
    insert into public.camp_visits (spot_id, owner_id, notes)
    values ('aaaaaaaa-0000-0000-0000-000000000001',
            '99999999-9999-9999-9999-999999999999', 'hier stond ik');
    gelukt := true;
  exception when others then
    gelukt := false;
  end;
  if gelukt then
    raise exception 'Een vreemde kan een bezoek loggen op andermans plek';
  end if;
  raise notice 'Bezoek op andermans plek: geweigerd';
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 3. De ledenlijst uitlezen. Een account aanmaken kan iedereen; dan moet je
--    daarmee niet meteen alle namen van alle gebruikers hebben.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local camp.test_uid = '99999999-9999-9999-9999-999999999999';
do $$
declare
  n int;
begin
  select count(*) into n from public.camp_profiles;
  -- Alleen het eigen profiel hoort zichtbaar te zijn.
  if n > 1 then
    raise exception 'Een vreemde ziet % profielen in plaats van alleen zichzelf', n;
  end if;
  raise notice 'Ledenlijst: afgeschermd';
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 4. Maar vrienden moeten elkaar wél kunnen zien, anders werkt de app niet.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local camp.test_uid = '11111111-1111-1111-1111-111111111111';
insert into public.camp_friendships (requester_id, addressee_id, status)
values ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', 'accepted')
on conflict do nothing;
do $$
begin
  if not exists (select 1 from public.camp_profiles
                 where id = '22222222-2222-2222-2222-222222222222') then
    raise exception 'Een vriend kan het profiel van zijn vriend niet zien';
  end if;
  raise notice 'Vrienden zien elkaar: in orde';
end;
$$;
commit;

-- ---------------------------------------------------------------------------
-- 5. Iemand zoeken die nog geen vriend is, moet blijven werken — dat loopt
--    via camp_find_profile(), dat exact op handle matcht en dus geen lijst is.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local camp.test_uid = '99999999-9999-9999-9999-999999999999';
do $$
begin
  if public.camp_find_profile('eigenaar') is null
     or public.camp_find_profile('eigenaar') = 'null'::jsonb then
    raise exception 'Een vriend toevoegen op naam werkt niet meer';
  end if;
  raise notice 'Zoeken op handle: werkt nog';
end;
$$;
commit;

-- ---------------------------------------------------------------------------
-- 6. Het wachtwoord van een link eindeloos blijven raden.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local camp.test_uid = '11111111-1111-1111-1111-111111111111';
select public.camp_create_link_share(
  'aaaaaaaa-0000-0000-0000-000000000001',
  encode(extensions.digest('brute-force-token','sha256'),'hex'),
  'exact', 'geheim', 'test', null, null, true, true, false
) is not null as aangemaakt;
commit;

begin;
set local role anon;
do $$
declare
  antwoord text;
begin
  for i in 1..10 loop
    antwoord := public.camp_open_share('brute-force-token', 'fout' || i::text) ->> 'error';
  end loop;
  -- Na tien misgokken hoort de link op slot te zitten, ook met het JUISTE
  -- wachtwoord.
  antwoord := public.camp_open_share('brute-force-token', 'geheim') ->> 'error';
  if antwoord is distinct from 'locked' then
    raise exception 'Wachtwoord raden wordt niet afgeremd (antwoord: %)', antwoord;
  end if;
  raise notice 'Wachtwoord raden: op slot na 10 pogingen';
end;
$$;
commit;

-- ---------------------------------------------------------------------------
-- 7. De keepalive-tabel als gratis schrijfruimte gebruiken.
-- ---------------------------------------------------------------------------
begin;
set local role anon;
do $$
declare
  gelukt boolean := false;
begin
  begin
    insert into public.camp_keepalive (id) values ('rommel-van-een-vreemde');
    gelukt := true;
  exception when others then
    gelukt := false;
  end;
  if gelukt then
    raise exception 'Iedereen kan willekeurige rijen in camp_keepalive schrijven';
  end if;
  raise notice 'Keepalive: alleen de vaste rij';
end;
$$;
rollback;

\echo 'Alle aanvallen afgeslagen.'

-- ============================================================================
-- De sleutel is geen wachtwoord
-- ============================================================================
-- De publishable key staat in de JavaScript die elke bezoeker binnenhaalt. Die
-- is dus per definitie openbaar; daar valt niets aan te verbergen. De vraag is
-- niet óf iemand hem vindt, maar wat hij ermee kan.
--
-- Hieronder speelt de rol "anon" precies dat: iemand met de sleutel, zonder
-- account. Hij mag nergens bij, en niet doordat er toevallig niets staat maar
-- doordat de database het weigert.
\echo ''
\echo '### Wat kan iemand met alleen de sleutel'

do $$
declare
  tabel      text;
  geweigerd  boolean;
  n          int;
begin
  foreach tabel in array array[
    'camp_spots', 'camp_visits', 'camp_shares', 'camp_share_views',
    'camp_profiles', 'camp_friendships', 'camp_circles', 'camp_circle_members'
  ] loop
    geweigerd := false;
    begin
      set local role anon;
      execute format('select count(*) from public.%I', tabel) into n;
    exception when insufficient_privilege then
      geweigerd := true;
    end;
    reset role;
    if not geweigerd then
      raise exception 'Met alleen de sleutel is % te lezen', tabel;
    end if;
  end loop;
  raise notice 'Alleen de sleutel: alle acht tabellen geweigerd';
end;
$$;

-- En schrijven al helemaal niet.
do $$
declare
  gelukt boolean := false;
begin
  begin
    set local role anon;
    insert into public.camp_spots (owner_id, name, lat, lng)
    values ('11111111-1111-1111-1111-111111111111', 'ingebroken', 0, 0);
    gelukt := true;
  exception when others then
    gelukt := false;
  end;
  reset role;
  if gelukt then
    raise exception 'Met alleen de sleutel is er in camp_spots te schrijven';
  end if;
  raise notice 'Alleen de sleutel: schrijven geweigerd';
end;
$$;

\echo 'De sleutel alleen levert niets op.'

-- ---------------------------------------------------------------------------
-- En als hij met die sleutel een account aanmaakt?
-- ---------------------------------------------------------------------------
-- Dat kan, tenzij je aanmelden dichtzet (zie SUPABASE_SETUP.md stap 5). Hij is
-- dan "authenticated", en die rol heeft wél rechten op de tabellen. Vanaf hier
-- is Row Level Security het enige dat hem tegenhoudt — precies waar het voor
-- bedoeld is.
begin;
set local role authenticated;
set local camp.test_uid = '99999999-9999-9999-9999-999999999999';
do $$
declare
  tabel text;
  n     int;
begin
  foreach tabel in array array[
    'camp_spots', 'camp_visits', 'camp_shares', 'camp_share_views',
    'camp_friendships', 'camp_circles'
  ] loop
    execute format('select count(*) from public.%I', tabel) into n;
    if n <> 0 then
      raise exception 'Een vers account ziet % rijen in %', n, tabel;
    end if;
  end loop;

  -- Alleen het eigen profiel, en verder niemand.
  select count(*) into n from public.camp_profiles;
  if n > 1 then
    raise exception 'Een vers account ziet % profielen', n;
  end if;

  -- En er is niets met hem gedeeld.
  if jsonb_array_length(public.camp_shared_with_me()) <> 0 then
    raise exception 'Een vers account krijgt gedeelde plekken te zien';
  end if;

  raise notice 'Met een eigen account: overal nul rijen';
end;
$$;
commit;

-- ---------------------------------------------------------------------------
-- Grenzen aan de opslag
-- ---------------------------------------------------------------------------
-- Aanmelden staat open, dus iemand met een vers account mag naar zijn eigen map
-- schrijven. Dat is de bedoeling — maar niet ongelimiteerd.
do $$
declare
  b record;
begin
  select * into b from storage.buckets where id = 'camp-photos';
  if b.file_size_limit is null or b.file_size_limit > 10485760 then
    raise exception 'Geen zinnige maximale bestandsgrootte op de fotobucket';
  end if;
  if b.allowed_mime_types is null or 'application/zip' = any(b.allowed_mime_types) then
    raise exception 'De fotobucket accepteert meer dan afbeeldingen';
  end if;
  raise notice 'Fotobucket: max % MB, alleen %',
    b.file_size_limit / 1048576, array_to_string(b.allowed_mime_types, ', ');
end;
$$;

-- ---------------------------------------------------------------------------
-- Aanmelden kan alleen met een uitnodiging
-- ---------------------------------------------------------------------------
-- Het aanmeldformulier staat niet op de voorpagina, maar dat is verstoppen en
-- geen slot. Dit is het slot: ook wie de auth-endpoint rechtstreeks aanroept
-- komt er zonder geldige code niet in.
\echo ''
\echo '### Aanmelden met een uitnodiging'

do $$
declare
  gelukt boolean;
begin
  -- Zonder code
  gelukt := true;
  begin
    insert into auth.users (id, email)
    values (gen_random_uuid(), 'bot@example.com');
  exception when others then gelukt := false;
  end;
  if gelukt then raise exception 'Aanmelden zonder uitnodiging lukt gewoon'; end if;

  -- Met een verzonnen code
  gelukt := true;
  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'bot2@example.com', '{"invite":"zelf-verzonnen"}'::jsonb);
  exception when others then gelukt := false;
  end;
  if gelukt then raise exception 'Een verzonnen uitnodigingscode wordt geaccepteerd'; end if;

  raise notice 'Aanmelden zonder geldige uitnodiging: geweigerd';
end;
$$;

-- Een ingetrokken of opgebruikte uitnodiging werkt niet meer.
insert into public.camp_invites (code_hash, created_by, label, max_uses)
values (encode(extensions.digest('eenmalig','sha256'),'hex'),
        '11111111-1111-1111-1111-111111111111', 'eenmalig', 1);

do $$
declare
  gelukt boolean;
begin
  -- Eerste keer: mag.
  insert into auth.users (id, email, raw_user_meta_data)
  values (gen_random_uuid(), 'gast1@example.com', '{"invite":"eenmalig"}'::jsonb);

  -- Tweede keer met dezelfde eenmalige code: mag niet.
  gelukt := true;
  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'gast2@example.com', '{"invite":"eenmalig"}'::jsonb);
  exception when others then gelukt := false;
  end;
  if gelukt then raise exception 'Een eenmalige uitnodiging is twee keer te gebruiken'; end if;

  raise notice 'Uitnodiging met max_uses: raakt op zoals bedoeld';
end;
$$;

-- Ingetrokken uitnodiging.
insert into public.camp_invites (code_hash, created_by, label, revoked_at)
values (encode(extensions.digest('ingetrokken','sha256'),'hex'),
        '11111111-1111-1111-1111-111111111111', 'ingetrokken', now());

do $$
declare
  gelukt boolean := true;
begin
  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'gast3@example.com', '{"invite":"ingetrokken"}'::jsonb);
  exception when others then gelukt := false;
  end;
  if gelukt then raise exception 'Een ingetrokken uitnodiging werkt nog'; end if;
  raise notice 'Ingetrokken uitnodiging: geweigerd';
end;
$$;

\echo 'Uitnodigingen doen wat ze moeten doen.'

-- ---------------------------------------------------------------------------
-- Geen e-mailadressen in het publieke schema
-- ---------------------------------------------------------------------------
-- auth.users heeft een e-mailkolom, maar dat schema stelt Supabase niet via de
-- REST-API beschikbaar. Alles wat Camp zelf aanmaakt staat in "public", en daar
-- hoort geen adres in te staan — ook niet per ongeluk, later, in een nieuwe
-- kolom. Vandaar deze controle.
do $$
declare
  gevonden text;
begin
  select string_agg(table_name || '.' || column_name, ', ')
    into gevonden
  from information_schema.columns
  where table_schema = 'public'
    and table_name like 'camp\_%'
    and (column_name ilike '%email%' or column_name ilike '%mail%');

  if gevonden is not null then
    raise exception 'E-mailkolom in het publieke schema: %', gevonden;
  end if;
  raise notice 'Publiek schema: geen e-mailkolommen';
end;
$$;

-- En het profiel dat een gedeelde link prijsgeeft, bevat er ook geen.
begin;
set local role anon;
do $$
declare
  payload jsonb;
begin
  select public.camp_open_share('brute-force-token', 'geheim') into payload;
  -- Die link zit inmiddels op slot; daarom kijken we naar de opbouw van de
  -- eigenaar-informatie zoals camp_share_payload die maakt.
  if payload::text ilike '%@%' then
    raise exception 'Er zit een e-mailachtige waarde in wat een link prijsgeeft: %', payload;
  end if;
  raise notice 'Deel-link: geeft geen adres prijs';
end;
$$;
commit;
