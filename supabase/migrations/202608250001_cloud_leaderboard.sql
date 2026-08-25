create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 20),
  created_at timestamptz not null default now()
);

create table if not exists public.leaderboard_entries (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  best_score integer not null default 0 check (best_score between 0 and 100000000),
  best_level smallint not null default 1 check (best_level between 1 and 8),
  won boolean not null default false,
  games_played integer not null default 0 check (games_played >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists leaderboard_rank_idx
  on public.leaderboard_entries (best_score desc, best_level desc, updated_at asc);

alter table public.profiles enable row level security;
alter table public.leaderboard_entries enable row level security;

drop policy if exists "Public profiles are readable" on public.profiles;
create policy "Public profiles are readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

drop policy if exists "Leaderboard is readable" on public.leaderboard_entries;
create policy "Leaderboard is readable"
  on public.leaderboard_entries for select
  to anon, authenticated
  using (true);

create or replace function public.create_player_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_name text;
begin
  requested_name := regexp_replace(coalesce(new.raw_user_meta_data ->> 'display_name', ''), '<[^>]*>', '', 'g');
  requested_name := trim(regexp_replace(requested_name, '[[:cntrl:]]+', ' ', 'g'));
  if char_length(requested_name) < 2 then
    requested_name := 'Player-' || substr(new.id::text, 1, 6);
  end if;
  insert into public.profiles (user_id, display_name)
  values (new.id, left(requested_name, 20))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_player_profile_after_signup on auth.users;
create trigger create_player_profile_after_signup
  after insert on auth.users
  for each row execute procedure public.create_player_profile();

create or replace function public.submit_score(p_score integer, p_level integer, p_won boolean)
returns table (
  user_id uuid,
  best_score integer,
  best_level smallint,
  won boolean,
  games_played integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  player_id uuid := auth.uid();
begin
  if player_id is null then raise exception 'Login required'; end if;
  if p_score < 0 or p_score > 100000000 then raise exception 'Invalid score'; end if;
  if p_level < 1 or p_level > 8 then raise exception 'Invalid level'; end if;

  insert into public.leaderboard_entries as current (user_id, best_score, best_level, won, games_played)
  values (player_id, p_score, p_level, p_won, 1)
  on conflict (user_id) do update set
    best_score = greatest(current.best_score, excluded.best_score),
    best_level = greatest(current.best_level, excluded.best_level),
    won = current.won or excluded.won,
    games_played = current.games_played + 1,
    updated_at = now();

  return query
    select entry.user_id, entry.best_score, entry.best_level, entry.won, entry.games_played, entry.updated_at
    from public.leaderboard_entries entry
    where entry.user_id = player_id;
end;
$$;

revoke all on public.profiles from anon, authenticated;
revoke all on public.leaderboard_entries from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select on public.leaderboard_entries to anon, authenticated;
revoke all on function public.submit_score(integer, integer, boolean) from public, anon;
grant execute on function public.submit_score(integer, integer, boolean) to authenticated;
