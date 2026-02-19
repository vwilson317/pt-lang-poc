-- Pilot users: first 100 get refresh every 12h, referral rewards, min 3h refresh, max 20 likes.
-- Profiles table (extends auth.users; create row on signup).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  referral_slug text not null unique,
  is_pilot boolean not null default false,
  default_likes int not null default 3 check (default_likes >= 1 and default_likes <= 20),
  likes_remaining int not null default 3 check (likes_remaining >= 0),
  refresh_interval_minutes int not null default 720 check (refresh_interval_minutes >= 180),
  next_refresh_at timestamptz not null default (now() + interval '12 hours')
);

-- Referral events: link click (refresh likes only) or signup (refresh + increase default + reduce timer).
create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('click', 'signup')),
  created_at timestamptz not null default now(),
  referred_user_id uuid references public.profiles(id) on delete set null
);

create index if not exists idx_referral_events_referrer on public.referral_events(referrer_id);
create index if not exists idx_profiles_referral_slug on public.profiles(referral_slug);

-- Generate unique 8-char referral slug for new profiles.
create or replace function public.generate_referral_slug()
returns text language sql as $$
  select encode(gen_random_bytes(4), 'hex');
$$;

-- When inserting a new profile, set referral_slug if missing and determine is_pilot from current count.
create or replace function public.handle_new_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  profile_count int;
begin
  if new.referral_slug is null or new.referral_slug = '' then
    new.referral_slug := public.generate_referral_slug();
    -- Ensure uniqueness (retry once if collision).
    if exists (select 1 from public.profiles p where p.referral_slug = new.referral_slug) then
      new.referral_slug := public.generate_referral_slug();
    end if;
  end if;
  select count(*) into profile_count from public.profiles;
  -- New row not yet in table, so count 0..99 => first 100 users are pilot.
  new.is_pilot := (profile_count < 100);
  if new.is_pilot then
    new.default_likes := 3;
    new.likes_remaining := 3;
    new.refresh_interval_minutes := 720;  -- 12 hours
    new.next_refresh_at := now() + (new.refresh_interval_minutes || ' minutes')::interval;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_insert_handle on public.profiles;
create trigger on_profile_insert_handle
  before insert on public.profiles
  for each row execute function public.handle_new_profile();

-- RLS
alter table public.profiles enable row level security;
alter table public.referral_events enable row level security;

create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Anyone can read a profile by referral_slug (for landing page to resolve referrer).
create policy "Anyone can read profile by referral_slug"
  on public.profiles for select using (true);

-- Referral events: referrer can read own; service can insert (we use anon/key from app).
create policy "Users can read own referral events"
  on public.referral_events for select using (auth.uid() = referrer_id);

create policy "Insert referral events (app records clicks and signups)"
  on public.referral_events for insert with check (true);

-- Function: record referral click — refresh referrer's likes only (timer unchanged).
create or replace function public.record_referral_click(referrer_slug text)
returns void language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
begin
  select id into pid from public.profiles where referral_slug = referrer_slug limit 1;
  if pid is not null then
    insert into public.referral_events (referrer_id, event_type) values (pid, 'click');
    update public.profiles
    set likes_remaining = default_likes
    where id = pid;
  end if;
end;
$$;

-- Function: record referral signup — increase default_likes (cap 20), refresh likes, reduce timer (min 3h).
create or replace function public.record_referral_signup(referrer_slug text, new_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  new_default int;
  new_interval int;
begin
  select id into pid from public.profiles where referral_slug = referrer_slug limit 1;
  if pid is null then return; end if;

  insert into public.referral_events (referrer_id, event_type, referred_user_id)
  values (pid, 'signup', new_user_id);

  select p.default_likes, p.refresh_interval_minutes into new_default, new_interval
  from public.profiles p where p.id = pid;

  new_default := least(20, new_default + 1);
  new_interval := greatest(180, new_interval - 15);

  update public.profiles
  set
    default_likes = new_default,
    likes_remaining = new_default,
    refresh_interval_minutes = new_interval,
    next_refresh_at = now() + (new_interval || ' minutes')::interval
  where id = pid;
end;
$$;
