-- ============================================================================
-- Camp — database schema
-- ----------------------------------------------------------------------------
-- Plak dit hele bestand in de Supabase SQL Editor en druk op Run. Het is
-- idempotent: je kunt het opnieuw draaien na een update zonder data te
-- verliezen.
--
-- Uitgangspunt van het beveiligingsmodel:
--
--   1. Niemand kan camp_spots direct lezen, behalve de eigenaar. Punt.
--   2. Alles wat gedeeld is, gaat via SECURITY DEFINER-functies die de
--      coordinaten eerst vervagen volgens de nauwkeurigheid van die share.
--      Een vriend met "~2 km" krijgt de exacte plek dus nooit binnen — ook
--      niet als hij het netwerkverkeer openmaakt.
--   3. Deel-links worden alleen als SHA-256-hash bewaard. Wie de database
--      leest, kan er geen werkende link uit reconstrueren.
--   4. Wachtwoorden op een link staan als bcrypt-hash (pgcrypto crypt()).
-- ============================================================================

-- Supabase heeft pgcrypto meestal al staan in het schema "extensions". Een
-- kale "create extension" is dan een no-op en digest()/crypt() staan dus NIET
-- in het standaard zoekpad. Daarom hieronder overal expliciet
-- "search_path = public, extensions, pg_temp".
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profielen
-- ---------------------------------------------------------------------------
create table if not exists public.camp_profiles (
  id           uuid primary key references auth.users on delete cascade,
  handle       text unique not null,
  display_name text not null default '',
  emoji        text not null default '🏕️',
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Plekken
-- ---------------------------------------------------------------------------
create table if not exists public.camp_spots (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users on delete cascade,
  name        text not null,
  lat         double precision not null,
  lng         double precision not null,
  kind        text not null default 'wild',
  rating      int,
  notes       text not null default '',
  access      text not null default '',
  tags        text[] not null default '{}',
  best_months int[] not null default '{}',
  capacity    int,
  elevation   double precision,
  legal       text not null default 'unknown',
  photos      jsonb not null default '[]'::jsonb,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists camp_spots_owner_idx on public.camp_spots (owner_id);

-- ---------------------------------------------------------------------------
-- Bezoeken (het logboek per plek)
-- ---------------------------------------------------------------------------
create table if not exists public.camp_visits (
  id         uuid primary key default gen_random_uuid(),
  spot_id    uuid not null references public.camp_spots on delete cascade,
  owner_id   uuid not null references auth.users on delete cascade,
  visited_on date not null default current_date,
  nights     int not null default 1,
  rating     int,
  companions text not null default '',
  notes      text not null default '',
  weather    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists camp_visits_spot_idx on public.camp_visits (spot_id);

-- ---------------------------------------------------------------------------
-- Vrienden en groepen
-- ---------------------------------------------------------------------------
create table if not exists public.camp_friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users on delete cascade,
  addressee_id uuid not null references auth.users on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table if not exists public.camp_circles (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users on delete cascade,
  name       text not null,
  emoji      text not null default '👥',
  created_at timestamptz not null default now()
);

create table if not exists public.camp_circle_members (
  circle_id uuid not null references public.camp_circles on delete cascade,
  member_id uuid not null references auth.users on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (circle_id, member_id)
);

-- ---------------------------------------------------------------------------
-- Shares
-- ---------------------------------------------------------------------------
-- kind = 'link'   → geheime URL, optioneel met wachtwoord
-- kind = 'user'   → rechtstreeks aan een vriend
-- kind = 'circle' → aan een hele groep
create table if not exists public.camp_shares (
  id               uuid primary key default gen_random_uuid(),
  spot_id          uuid not null references public.camp_spots on delete cascade,
  owner_id         uuid not null references auth.users on delete cascade,
  kind             text not null check (kind in ('link', 'user', 'circle')),
  target_user_id   uuid references auth.users on delete cascade,
  target_circle_id uuid references public.camp_circles on delete cascade,
  token_hash       text,
  pass_hash        text,
  precision        text not null default 'exact'
                   check (precision in ('exact', 'fine', 'area', 'region')),
  label            text not null default '',
  show_notes       boolean not null default true,
  show_photos      boolean not null default true,
  show_visits      boolean not null default false,
  expires_at       timestamptz,
  max_views        int,
  view_count       int not null default 0,
  failed_count     int not null default 0,
  last_viewed_at   timestamptz,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now()
);
-- Voor projecten die het schema al eerder draaiden.
alter table public.camp_shares add column if not exists failed_count int not null default 0;

create unique index if not exists camp_shares_token_idx on public.camp_shares (token_hash)
  where token_hash is not null;
create index if not exists camp_shares_spot_idx on public.camp_shares (spot_id);
create index if not exists camp_shares_target_user_idx on public.camp_shares (target_user_id);

create table if not exists public.camp_share_views (
  id        uuid primary key default gen_random_uuid(),
  share_id  uuid not null references public.camp_shares on delete cascade,
  viewed_at timestamptz not null default now()
);
create index if not exists camp_share_views_share_idx on public.camp_share_views (share_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.camp_profiles       enable row level security;
alter table public.camp_spots          enable row level security;
alter table public.camp_visits         enable row level security;
alter table public.camp_friendships    enable row level security;
alter table public.camp_circles        enable row level security;
alter table public.camp_circle_members enable row level security;
alter table public.camp_shares         enable row level security;
alter table public.camp_share_views    enable row level security;

-- Profielen: alleen van mensen met wie je iets te maken hebt. "Iedereen die
-- ingelogd is mag alles zien" was makkelijker, maar dan kan iemand die een
-- account aanmaakt de complete ledenlijst uitlezen. Een vriend zoeken gaat via
-- camp_find_profile(), dat exact op handle matcht en dus geen lijst oplevert.
create or replace function public.camp_can_see_profile(p_target uuid)
returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  select p_target = auth.uid()
      or exists (
           select 1 from public.camp_friendships f
           where (f.requester_id = auth.uid() and f.addressee_id = p_target)
              or (f.addressee_id = auth.uid() and f.requester_id = p_target)
         )
      or exists (
           select 1 from public.camp_circles c
           join public.camp_circle_members m on m.circle_id = c.id
           where c.owner_id = auth.uid() and m.member_id = p_target
         )
      or exists (
           select 1 from public.camp_circle_members mine
           join public.camp_circle_members other on other.circle_id = mine.circle_id
           where mine.member_id = auth.uid() and other.member_id = p_target
         );
$$;

drop policy if exists camp_profiles_read on public.camp_profiles;
create policy camp_profiles_read on public.camp_profiles
  for select to authenticated using (public.camp_can_see_profile(id));

drop policy if exists camp_profiles_write on public.camp_profiles;
create policy camp_profiles_write on public.camp_profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Plekken: strikt privé. Gedeelde toegang loopt uitsluitend via de RPC's
-- verderop, die de coordinaten eerst vervagen.
drop policy if exists camp_spots_owner on public.camp_spots;
create policy camp_spots_owner on public.camp_spots
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists camp_visits_owner on public.camp_visits;
create policy camp_visits_owner on public.camp_visits
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.camp_spots sp
      where sp.id = spot_id and sp.owner_id = auth.uid()
    )
  );

-- Vriendschappen: allebei de kanten mogen de rij zien; alleen de ontvanger
-- mag hem accepteren.
drop policy if exists camp_friendships_read on public.camp_friendships;
create policy camp_friendships_read on public.camp_friendships
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists camp_friendships_insert on public.camp_friendships;
create policy camp_friendships_insert on public.camp_friendships
  for insert to authenticated with check (requester_id = auth.uid());

drop policy if exists camp_friendships_update on public.camp_friendships;
create policy camp_friendships_update on public.camp_friendships
  for update to authenticated using (addressee_id = auth.uid());

drop policy if exists camp_friendships_delete on public.camp_friendships;
create policy camp_friendships_delete on public.camp_friendships
  for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Groepen: van de eigenaar. Leden mogen zien in welke groep ze zitten, maar
-- niet wie er verder in zit — dat loopt via een definer-functie zodat RLS
-- zichzelf niet recursief aanroept.
create or replace function public.camp_is_circle_member(p_circle uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.camp_circle_members
    where circle_id = p_circle and member_id = p_user
  );
$$;

drop policy if exists camp_circles_owner on public.camp_circles;
create policy camp_circles_owner on public.camp_circles
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists camp_circles_member_read on public.camp_circles;
create policy camp_circles_member_read on public.camp_circles
  for select to authenticated using (public.camp_is_circle_member(id, auth.uid()));

drop policy if exists camp_circle_members_owner on public.camp_circle_members;
create policy camp_circle_members_owner on public.camp_circle_members
  for all to authenticated
  using (exists (select 1 from public.camp_circles c
                 where c.id = circle_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.camp_circles c
                      where c.id = circle_id and c.owner_id = auth.uid()));

drop policy if exists camp_circle_members_self on public.camp_circle_members;
create policy camp_circle_members_self on public.camp_circle_members
  for select to authenticated using (member_id = auth.uid());

-- Shares: alleen de eigenaar ziet en beheert ze. Ontvangers komen er via RPC.
-- Let op de tweede voorwaarde in "with check". Zonder die regel kan iemand een
-- share aanmaken die naar ANDERMANS plek wijst en zichzelf als ontvanger
-- opgeven; camp_shared_with_me() zou dan keurig de exacte coordinaten van een
-- vreemde uitserveren. Eigenaar zijn van de share is niet genoeg — je moet ook
-- eigenaar zijn van de plek.
drop policy if exists camp_shares_owner on public.camp_shares;
create policy camp_shares_owner on public.camp_shares
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.camp_spots sp
      where sp.id = spot_id and sp.owner_id = auth.uid()
    )
  );

drop policy if exists camp_share_views_owner on public.camp_share_views;
create policy camp_share_views_owner on public.camp_share_views
  for select to authenticated
  using (exists (select 1 from public.camp_shares s
                 where s.id = share_id and s.owner_id = auth.uid()));

-- ============================================================================
-- Rechten
-- ============================================================================
-- Supabase geeft anon/authenticated standaard rechten op alles in "public".
-- We zetten het hier expliciet neer in plaats van op die default te vertrouwen:
-- anon heeft op geen enkele tabel iets te zoeken (die komt alleen binnen via
-- camp_open_share), en authenticated komt sowieso niet langs RLS heen.
revoke all on all tables in schema public from anon;

grant select, insert, update, delete on
  public.camp_profiles, public.camp_spots, public.camp_visits,
  public.camp_friendships, public.camp_circles, public.camp_circle_members,
  public.camp_shares
  to authenticated;
grant select, delete on public.camp_share_views to authenticated;

-- ============================================================================
-- Vervaging
-- ============================================================================
-- De straal per nauwkeurigheid, in meters.
create or replace function public.camp_precision_radius(p_precision text)
returns double precision
language sql immutable
as $$
  select case p_precision
    when 'exact'  then 0
    when 'fine'   then 250
    when 'area'   then 2000
    when 'region' then 15000
    else 2000
  end;
$$;

-- Verschuift een punt met een vaste, maar onvoorspelbare offset binnen een
-- cirkel met straal p_radius. De offset hangt alleen af van p_seed, dus
-- dezelfde share toont de plek elke keer op precies dezelfde vervaagde plek —
-- anders zou je met een paar keer verversen alsnog het midden uitmiddelen.
create or replace function public.camp_fuzz_point(
  p_lat double precision,
  p_lng double precision,
  p_seed text,
  p_radius double precision
) returns double precision[]
language plpgsql immutable
set search_path = public, extensions, pg_temp
as $$
declare
  h       text;
  bearing double precision;
  dist    double precision;
  coslat  double precision;
begin
  if p_radius <= 0 then
    return array[p_lat, p_lng];
  end if;
  -- sha256 in plaats van md5, zodat de app in de browser (WebCrypto kent geen
  -- md5) precies hetzelfde vervaagde punt kan uitrekenen voor de preview.
  h := encode(digest(p_seed, 'sha256'), 'hex');
  -- 7 hex-tekens = 28 bits: past altijd positief in een int.
  bearing := (('x' || substr(h, 1, 7))::bit(28)::int / 268435456.0) * 2 * pi();
  -- sqrt() zorgt voor een gelijkmatige verdeling over het oppervlak van de
  -- cirkel in plaats van een opeenhoping rond het midden.
  dist := sqrt(('x' || substr(h, 8, 7))::bit(28)::int / 268435456.0) * p_radius;
  coslat := greatest(cos(radians(p_lat)), 0.01);
  return array[
    p_lat + (dist * cos(bearing)) / 111320.0,
    p_lng + (dist * sin(bearing)) / (111320.0 * coslat)
  ];
end;
$$;

-- Bouwt de JSON die een ontvanger te zien krijgt. Alles wat de share niet
-- toestaat, wordt hier weggelaten — niet in de client verstopt.
create or replace function public.camp_share_payload(s public.camp_shares, sp public.camp_spots)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp
as $$
declare
  radius double precision;
  pt     double precision[];
  owner  record;
  result jsonb;
begin
  radius := public.camp_precision_radius(s.precision);
  pt := public.camp_fuzz_point(sp.lat, sp.lng, s.id::text || ':' || sp.id::text, radius);

  select display_name, handle, emoji into owner
  from public.camp_profiles where id = sp.owner_id;

  result := jsonb_build_object(
    'share_id',   s.id,
    'spot_id',    sp.id,
    'name',       sp.name,
    'kind',       sp.kind,
    'lat',        pt[1],
    'lng',        pt[2],
    'radius_m',   radius,
    'precision',  s.precision,
    'label',      s.label,
    'tags',       to_jsonb(sp.tags),
    'rating',     sp.rating,
    'capacity',   sp.capacity,
    'elevation',  sp.elevation,
    'legal',      sp.legal,
    'best_months', to_jsonb(sp.best_months),
    'expires_at', s.expires_at,
    'owner',      jsonb_build_object(
                    'name',   coalesce(owner.display_name, ''),
                    'handle', coalesce(owner.handle, ''),
                    'emoji',  coalesce(owner.emoji, '🏕️')
                  )
  );

  if s.show_notes then
    result := result || jsonb_build_object('notes', sp.notes, 'access', sp.access);
  end if;

  -- Foto's verraden vaak precies waar je staat, dus alleen bij een scherpe share.
  if s.show_photos and s.precision in ('exact', 'fine') then
    result := result || jsonb_build_object('photos', sp.photos);
  end if;

  if s.show_visits then
    result := result || jsonb_build_object('visits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'visited_on', v.visited_on, 'nights', v.nights,
               'rating', v.rating, 'notes', v.notes
             ) order by v.visited_on desc)
      from public.camp_visits v where v.spot_id = sp.id
    ), '[]'::jsonb));
  end if;

  return result;
end;
$$;

-- ============================================================================
-- RPC: een deel-link openen (mag ook zonder account)
-- ============================================================================
create or replace function public.camp_open_share(p_token text, p_pass text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare
  s  public.camp_shares;
  sp public.camp_spots;
begin
  select * into s from public.camp_shares
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and kind = 'link';

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if s.revoked_at is not null then
    return jsonb_build_object('error', 'revoked');
  end if;
  if s.expires_at is not null and s.expires_at < now() then
    return jsonb_build_object('error', 'expired');
  end if;
  if s.max_views is not null and s.view_count >= s.max_views then
    return jsonb_build_object('error', 'used_up');
  end if;

  -- Wie het token heeft maar het wachtwoord niet, mag niet eindeloos blijven
  -- proberen. bcrypt is traag, maar traag is niet hetzelfde als eindig: een
  -- kort wachtwoord als "ourthe" is anders alsnog te raden.
  if s.failed_count >= 10 then
    return jsonb_build_object('error', 'locked');
  end if;

  if s.pass_hash is not null then
    if p_pass is null or p_pass = '' then
      return jsonb_build_object('error', 'needs_pass');
    end if;
    if crypt(p_pass, s.pass_hash) <> s.pass_hash then
      update public.camp_shares set failed_count = failed_count + 1 where id = s.id;
      return jsonb_build_object('error', 'wrong_pass');
    end if;
  end if;

  select * into sp from public.camp_spots where id = s.spot_id;
  if not found or sp.owner_id <> s.owner_id then
    return jsonb_build_object('error', 'not_found');
  end if;

  -- Gelukt: de teller met misgokken weer op nul.
  update public.camp_shares
     set view_count = view_count + 1, last_viewed_at = now(), failed_count = 0
   where id = s.id;
  insert into public.camp_share_views (share_id) values (s.id);

  return jsonb_build_object('ok', true, 'spot', public.camp_share_payload(s, sp));
end;
$$;

revoke all on function public.camp_open_share(text, text) from public;
grant execute on function public.camp_open_share(text, text) to anon, authenticated;

-- ============================================================================
-- RPC: alles wat met mij gedeeld is
-- ============================================================================
create or replace function public.camp_shared_with_me()
returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp
as $$
declare
  me     uuid := auth.uid();
  result jsonb := '[]'::jsonb;
  r      record;
  s      public.camp_shares;
  sp     public.camp_spots;
begin
  if me is null then
    return result;
  end if;

  -- Eerst alleen de id's ophalen en daarna per stuk in getypeerde variabelen
  -- laden: een plpgsql-record laat zich niet naar een composite type casten.
  for r in
    select s2.id as share_id, s2.spot_id
      from public.camp_shares s2
     where s2.revoked_at is null
       and (s2.expires_at is null or s2.expires_at > now())
       and (
         (s2.kind = 'user' and s2.target_user_id = me)
         or (s2.kind = 'circle' and public.camp_is_circle_member(s2.target_circle_id, me))
       )
     order by s2.created_at desc
  loop
    select * into s  from public.camp_shares where id = r.share_id;
    select * into sp from public.camp_spots  where id = r.spot_id;
    -- Tweede slot op dezelfde deur: een share mag alleen een plek uitserveren
    -- die van dezelfde persoon is. Het RLS-beleid houdt scheve rijen al tegen
    -- bij het schrijven; dit vangt ze af bij het lezen.
    if found and sp.owner_id = s.owner_id then
      result := result || jsonb_build_array(public.camp_share_payload(s, sp));
    end if;
  end loop;

  return result;
end;
$$;

revoke all on function public.camp_shared_with_me() from public;
grant execute on function public.camp_shared_with_me() to authenticated;

-- ============================================================================
-- RPC: een link-share aanmaken
-- ============================================================================
-- De client verzint zelf een token, hasht dat met WebCrypto en stuurt alleen
-- de hash mee. Het token zelf komt dus nooit op de server aan; het staat
-- alleen in de URL die jij doorstuurt.
create or replace function public.camp_create_link_share(
  p_spot_id    uuid,
  p_token_hash text,
  p_precision  text default 'exact',
  p_pass       text default null,
  p_label      text default '',
  p_expires_at timestamptz default null,
  p_max_views  int default null,
  p_show_notes boolean default true,
  p_show_photos boolean default true,
  p_show_visits boolean default false
) returns uuid
language plpgsql volatile security definer set search_path = public, extensions, pg_temp
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd';
  end if;
  if not exists (select 1 from public.camp_spots
                 where id = p_spot_id and owner_id = auth.uid()) then
    raise exception 'niet jouw plek';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'ongeldige token-hash';
  end if;

  insert into public.camp_shares (
    spot_id, owner_id, kind, token_hash, pass_hash, precision, label,
    expires_at, max_views, show_notes, show_photos, show_visits
  ) values (
    p_spot_id, auth.uid(), 'link', p_token_hash,
    case when p_pass is null or p_pass = '' then null
         else crypt(p_pass, gen_salt('bf')) end,
    p_precision, coalesce(p_label, ''),
    p_expires_at, p_max_views, p_show_notes, p_show_photos, p_show_visits
  ) returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.camp_create_link_share(uuid, text, text, text, text, timestamptz, int, boolean, boolean, boolean) from public;
grant execute on function public.camp_create_link_share(uuid, text, text, text, text, timestamptz, int, boolean, boolean, boolean) to authenticated;

-- ============================================================================
-- RPC: profiel opzoeken op handle (om een vriend toe te voegen)
-- ============================================================================
create or replace function public.camp_find_profile(p_handle text)
returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  select coalesce(jsonb_build_object('id', id, 'handle', handle,
                                     'display_name', display_name, 'emoji', emoji), 'null'::jsonb)
  from public.camp_profiles
  where lower(handle) = lower(trim(p_handle))
  limit 1;
$$;

revoke all on function public.camp_find_profile(text) from public;
grant execute on function public.camp_find_profile(text) to authenticated;

-- ============================================================================
-- Nieuwe gebruikers krijgen automatisch een profiel
-- ============================================================================
create or replace function public.camp_handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  base text;
  try  text;
  n    int := 0;
begin
  base := regexp_replace(lower(split_part(coalesce(new.email, 'kampeerder'), '@', 1)),
                         '[^a-z0-9]+', '', 'g');
  if base = '' then base := 'kampeerder'; end if;
  try := base;
  while exists (select 1 from public.camp_profiles where handle = try) loop
    n := n + 1;
    try := base || n::text;
  end loop;

  insert into public.camp_profiles (id, handle, display_name)
  values (new.id, try, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists camp_on_auth_user_created on auth.users;
create trigger camp_on_auth_user_created
  after insert on auth.users
  for each row execute function public.camp_handle_new_user();

-- ============================================================================
-- Opslag voor foto's
-- ============================================================================
-- Publieke bucket met onraadbare uuid-bestandsnamen (capability-URL's), zodat
-- ook iemand zonder account een gedeelde foto kan zien. Alleen de eigenaar
-- mag uploaden en verwijderen.
insert into storage.buckets (id, name, public)
values ('camp-photos', 'camp-photos', true)
on conflict (id) do nothing;

-- Alleen de eigenaar mag de objecten OPSOMMEN. De bucket staat op openbaar,
-- dus /storage/v1/object/public/... blijft voor iedereen bereikbaar en gedeelde
-- foto's blijven gewoon laden — maar niemand kan de lijst met paden opvragen.
-- Zonder deze beperking is "onraadbare bestandsnaam" niets waard: dan vraag je
-- de namen simpelweg op.
drop policy if exists camp_photos_read on storage.objects;
create policy camp_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'camp-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists camp_photos_write on storage.objects;
create policy camp_photos_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'camp-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists camp_photos_delete on storage.objects;
create policy camp_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'camp-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- Keepalive (zie .github/workflows/keepalive.yml)
-- ============================================================================
create table if not exists public.camp_keepalive (
  id         text primary key,
  pinged_at  timestamptz not null default now()
);
alter table public.camp_keepalive enable row level security;

-- Precies één rij, anders is dit een gratis schrijfruimte voor voorbijgangers.
drop policy if exists camp_keepalive_anon on public.camp_keepalive;
create policy camp_keepalive_anon on public.camp_keepalive
  for all to anon, authenticated
  using (id = 'keepalive') with check (id = 'keepalive');

grant select, insert, update, delete on public.camp_keepalive to anon, authenticated;
