create table if not exists app_users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists inventory_snapshots (
  user_id text primary key references app_users(id) on delete cascade,
  payload jsonb not null,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create index if not exists app_users_email_idx on app_users (lower(email));
