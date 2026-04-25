
-- Roles enum
create type public.app_role as enum ('co_founder', 'admin', 'special', 'premium', 'member');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles are viewable by everyone authed"
  on public.profiles for select to authenticated using (true);
create policy "users update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- User roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('co_founder','admin'))
$$;

create policy "users view own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);
create policy "admins view all roles" on public.user_roles for select to authenticated using (public.is_admin(auth.uid()));
create policy "admins manage roles" on public.user_roles for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- AI providers (models catalog)
create table public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  provider_type text not null check (provider_type in ('groq','axox')),
  display_name text not null,
  model_id text not null,
  base_url text not null,
  auth_header text not null default 'bearer' check (auth_header in ('bearer','x-api-key')),
  api_key text not null,
  enabled boolean not null default true,
  min_role app_role not null default 'member',
  created_at timestamptz not null default now()
);
alter table public.ai_providers enable row level security;

-- All authed users can see metadata of enabled models (NOT the api_key — handled by edge function)
create policy "authed view enabled providers" on public.ai_providers for select to authenticated using (enabled = true or public.is_admin(auth.uid()));
create policy "admins manage providers" on public.ai_providers for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Conversations
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  model_id uuid references public.ai_providers(id) on delete set null,
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.conversations enable row level security;

create policy "users view own conversations" on public.conversations for select to authenticated using (auth.uid() = user_id);
create policy "anyone view shared" on public.conversations for select to anon, authenticated using (share_token is not null);
create policy "users insert own conv" on public.conversations for insert to authenticated with check (auth.uid() = user_id);
create policy "users update own conv" on public.conversations for update to authenticated using (auth.uid() = user_id);
create policy "users delete own conv" on public.conversations for delete to authenticated using (auth.uid() = user_id);

-- Messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  tokens int,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;

create policy "users view own messages" on public.messages for select to authenticated using (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
);
create policy "anyone view shared messages" on public.messages for select to anon, authenticated using (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.share_token is not null)
);
create policy "users insert own messages" on public.messages for insert to authenticated with check (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
);
create policy "users delete own messages" on public.messages for delete to authenticated using (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
);

-- Auto profile + founder role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );

  if lower(new.email) = 'ashad.umar355@gmail.com' then
    insert into public.user_roles (user_id, role) values (new.id, 'co_founder') on conflict do nothing;
  else
    insert into public.user_roles (user_id, role) values (new.id, 'member') on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Updated_at trigger for conversations
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();
