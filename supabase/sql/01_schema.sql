-- =====================================================================
-- SEV Wiki, step 1 of 5: types, tables, indexes.
-- Run the files in order in Supabase > SQL Editor. Run each file once.
-- =====================================================================

create type public.system_role  as enum ('admin', 'user');
create type public.subteam_role as enum ('viewer', 'editor', 'lead');
create type public.user_status  as enum ('active', 'deactivated');
create type public.car_status   as enum ('Active', 'Concept', 'Legacy');
create type public.page_location as (car_id text, subteam_id text, folder_id uuid);

-- ---------- catalog ----------
create table public.cars (
  id         text primary key check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  name       text not null check (char_length(btrim(name)) between 1 and 100),
  status     public.car_status not null default 'Active',
  sort_order int  not null default 0
);

-- global_only subteams hold content that is not tied to a car (car_id is always null).
create table public.subteams (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  restricted  boolean not null default false,
  global_only boolean not null default false,
  sort_order  int  not null default 0
);

-- ---------- people ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  system_role public.system_role not null default 'user',
  status      public.user_status not null default 'active',
  created_at  timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));

create table public.memberships (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  subteam_id text not null references public.subteams (id) on delete cascade,
  role       public.subteam_role not null,
  primary key (user_id, subteam_id)
);
create index memberships_subteam_idx on public.memberships (subteam_id);

-- An email can only sign up if it has an open, unexpired invitation (enforced in 02_functions.sql).
create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  name        text not null default '' check (char_length(name) <= 100),
  system_role public.system_role not null default 'user',
  invited_by  uuid,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '30 days'),
  accepted_at timestamptz,
  -- Subteam roles to grant on sign-up, e.g. {"sub-battery": "editor"}. Validated by invite_user().
  roles       jsonb not null default '{}'::jsonb,
  constraint invitations_roles_is_object check (jsonb_typeof(roles) = 'object'),
  constraint invitations_invited_by_fkey foreign key (invited_by) references public.profiles (id) on delete set null
);
create unique index invitations_open_email on public.invitations (email) where accepted_at is null;
create index invitations_invited_by_idx on public.invitations (invited_by);

-- ---------- content ----------
create table public.folders (
  id         uuid primary key default gen_random_uuid(),
  car_id     text,
  subteam_id text not null,
  parent_id  uuid,
  name       text not null check (char_length(btrim(name)) between 1 and 100),
  created_by uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint folders_car_id_fkey     foreign key (car_id)     references public.cars (id),
  constraint folders_subteam_id_fkey foreign key (subteam_id) references public.subteams (id),
  constraint folders_parent_id_fkey  foreign key (parent_id)  references public.folders (id),
  constraint folders_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null
);
create unique index folders_unique_name on public.folders (
  coalesce(car_id, ''), subteam_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name))
) where deleted_at is null;
create index folders_subteam_idx on public.folders (subteam_id) where deleted_at is null;
create index folders_parent_idx  on public.folders (parent_id);

create table public.pages (
  id          uuid primary key default gen_random_uuid(),
  car_id      text,
  subteam_id  text not null,
  folder_id   uuid,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  content     text not null default '' check (char_length(content) <= 200000),
  excerpt     text not null default '',
  tags        text[] not null default '{}' check (cardinality(tags) <= 20),
  links       jsonb  not null default '[]'::jsonb,
  version     int    not null default 1,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  fts         tsvector,
  constraint pages_car_id_fkey     foreign key (car_id)     references public.cars (id),
  constraint pages_subteam_id_fkey foreign key (subteam_id) references public.subteams (id),
  constraint pages_folder_id_fkey  foreign key (folder_id)  references public.folders (id),
  constraint pages_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null,
  constraint pages_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null,
  constraint pages_links_is_array  check (jsonb_typeof(links) = 'array'),
  constraint pages_links_max       check (jsonb_typeof(links) <> 'array' or jsonb_array_length(links) <= 10)
);
create unique index pages_unique_title on public.pages (
  coalesce(car_id, ''), subteam_id, coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(title))
) where deleted_at is null;
create index pages_subteam_idx    on public.pages (subteam_id) where deleted_at is null;
create index pages_folder_idx     on public.pages (folder_id);
create index pages_updated_idx    on public.pages (updated_at desc) where deleted_at is null;
create index pages_created_by_idx on public.pages (created_by);
create index pages_updated_by_idx on public.pages (updated_by);
create index pages_fts_idx        on public.pages using gin (fts);

-- Every save writes one row here. The location is stored so a restore can put the page back.
create table public.page_revisions (
  page_id    uuid not null references public.pages (id) on delete cascade,
  version    int  not null,
  title      text not null,
  content    text not null,
  tags       text[] not null default '{}',
  links      jsonb  not null default '[]'::jsonb,
  car_id     text,
  subteam_id text not null,
  folder_id  uuid,
  author_id  uuid,
  note       text,
  created_at timestamptz not null default now(),
  primary key (page_id, version),
  constraint page_revisions_author_id_fkey foreign key (author_id) references public.profiles (id) on delete set null
);
create index page_revisions_author_idx on public.page_revisions (author_id);
