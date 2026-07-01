-- Cryobox Manager initial schema. Run with `supabase db push` or in the SQL editor.
create extension if not exists pgcrypto;

create table public.freezers (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  location text not null default '',
  deleted_at timestamptz,
  unique (user_id, name)
);

create table public.racks (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  freezer_id text not null references public.freezers(id),
  name text not null check (length(trim(name)) > 0),
  deleted_at timestamptz,
  unique (freezer_id, name)
);

create table public.boxes (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rack_id text not null references public.racks(id),
  name text not null check (length(trim(name)) > 0),
  rows smallint not null check (rows between 1 and 26),
  columns smallint not null check (columns between 1 and 30),
  temperature text,
  deleted_at timestamptz,
  unique (rack_id, name)
);

create table public.samples (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  type text not null check (length(trim(type)) > 0),
  source text not null default '',
  collected_at date,
  frozen_at date,
  dish_size text not null check (length(trim(dish_size)) > 0),
  quantity numeric not null default 1 check (quantity >= 0),
  unit text not null default '管' check (length(trim(unit)) > 0),
  project text not null default '',
  notes text not null default '',
  status text not null default 'stored' check (status in ('stored', 'checked_out', 'deleted')),
  custom_values jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_values) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, code)
);

create table public.sample_locations (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sample_id text not null references public.samples(id),
  box_id text not null references public.boxes(id),
  row_index smallint not null check (row_index >= 0),
  column_index smallint not null check (column_index >= 0),
  active boolean not null default true,
  stored_at timestamptz not null default now(),
  removed_at timestamptz,
  removal_reason text
);

create unique index one_active_location_per_sample on public.sample_locations(sample_id) where active;
create unique index one_tube_per_active_slot on public.sample_locations(box_id, row_index, column_index) where active;

create table public.custom_field_definitions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  required boolean not null default false,
  unique (user_id, name)
);

create table public.audit_events (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  action text not null check (action in ('create', 'update', 'move', 'checkout', 'restore', 'delete', 'import')),
  entity_type text not null check (entity_type in ('sample', 'box', 'system')),
  entity_id text not null,
  summary text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create or replace function public.validate_slot_bounds() returns trigger
language plpgsql set search_path = public as $$
declare target_box public.boxes;
begin
  select * into target_box from public.boxes where id = new.box_id;
  if target_box.id is null then raise exception '冻存盒不存在'; end if;
  if new.row_index >= target_box.rows or new.column_index >= target_box.columns then
    raise exception '孔位超出冻存盒范围';
  end if;
  if new.user_id <> target_box.user_id then raise exception '数据归属不一致'; end if;
  return new;
end $$;

create trigger sample_location_bounds before insert or update on public.sample_locations
for each row execute function public.validate_slot_bounds();

alter table public.freezers enable row level security;
alter table public.racks enable row level security;
alter table public.boxes enable row level security;
alter table public.samples enable row level security;
alter table public.sample_locations enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.audit_events enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['freezers','racks','boxes','samples','sample_locations','custom_field_definitions'] loop
    execute format('create policy "owner_all_%1$s" on public.%1$I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', table_name);
  end loop;
end $$;
create policy "owner_read_audit" on public.audit_events for select using (auth.uid() = user_id);
create policy "owner_insert_audit" on public.audit_events for insert with check (auth.uid() = user_id);

create or replace function public.load_inventory_snapshot() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'freezers', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'location',location,'deletedAt',deleted_at)) from public.freezers where user_id=auth.uid()), '[]'::jsonb),
    'racks', coalesce((select jsonb_agg(jsonb_build_object('id',id,'freezerId',freezer_id,'name',name,'deletedAt',deleted_at)) from public.racks where user_id=auth.uid()), '[]'::jsonb),
    'boxes', coalesce((select jsonb_agg(jsonb_build_object('id',id,'rackId',rack_id,'name',name,'rows',rows,'columns',columns,'temperature',temperature,'deletedAt',deleted_at)) from public.boxes where user_id=auth.uid()), '[]'::jsonb),
    'samples', coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'type',type,'source',source,'collectedAt',coalesce(collected_at::text,''),'frozenAt',coalesce(frozen_at::text,''),'dishSize',dish_size,'quantity',quantity,'unit',unit,'project',project,'notes',notes,'status',status,'customValues',custom_values,'createdAt',created_at,'updatedAt',updated_at,'deletedAt',deleted_at)) from public.samples where user_id=auth.uid()), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(jsonb_build_object('id',id,'sampleId',sample_id,'boxId',box_id,'row',row_index,'column',column_index,'active',active,'storedAt',stored_at,'removedAt',removed_at,'removalReason',removal_reason)) from public.sample_locations where user_id=auth.uid()), '[]'::jsonb),
    'customFields', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'required',required)) from public.custom_field_definitions where user_id=auth.uid()), '[]'::jsonb),
    'auditEvents', coalesce((select jsonb_agg(jsonb_build_object('id',id,'action',action,'entityType',entity_type,'entityId',entity_id,'summary',summary,'createdAt',created_at,'metadata',metadata) order by created_at desc) from public.audit_events where user_id=auth.uid()), '[]'::jsonb)
  )
$$;

create or replace function public.save_inventory_snapshot(payload jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare item jsonb; owner uuid := auth.uid();
begin
  if owner is null then raise exception '需要登录'; end if;
  for item in select * from jsonb_array_elements(coalesce(payload->'freezers','[]')) loop
    insert into freezers(id,user_id,name,location,deleted_at) values(item->>'id',owner,item->>'name',coalesce(item->>'location',''),nullif(item->>'deletedAt','')::timestamptz)
    on conflict(id) do update set name=excluded.name,location=excluded.location,deleted_at=excluded.deleted_at where freezers.user_id=owner;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(payload->'racks','[]')) loop
    insert into racks(id,user_id,freezer_id,name,deleted_at) values(item->>'id',owner,item->>'freezerId',item->>'name',nullif(item->>'deletedAt','')::timestamptz)
    on conflict(id) do update set freezer_id=excluded.freezer_id,name=excluded.name,deleted_at=excluded.deleted_at where racks.user_id=owner;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(payload->'boxes','[]')) loop
    insert into boxes(id,user_id,rack_id,name,rows,columns,temperature,deleted_at) values(item->>'id',owner,item->>'rackId',item->>'name',(item->>'rows')::smallint,(item->>'columns')::smallint,item->>'temperature',nullif(item->>'deletedAt','')::timestamptz)
    on conflict(id) do update set rack_id=excluded.rack_id,name=excluded.name,rows=excluded.rows,columns=excluded.columns,temperature=excluded.temperature,deleted_at=excluded.deleted_at where boxes.user_id=owner;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(payload->'samples','[]')) loop
    insert into samples(id,user_id,code,name,type,source,collected_at,frozen_at,dish_size,quantity,unit,project,notes,status,custom_values,created_at,updated_at,deleted_at)
    values(item->>'id',owner,item->>'code',item->>'name',item->>'type',coalesce(item->>'source',''),nullif(item->>'collectedAt','')::date,nullif(item->>'frozenAt','')::date,item->>'dishSize',coalesce((item->>'quantity')::numeric,0),item->>'unit',coalesce(item->>'project',''),coalesce(item->>'notes',''),item->>'status',coalesce(item->'customValues','{}'),(item->>'createdAt')::timestamptz,(item->>'updatedAt')::timestamptz,nullif(item->>'deletedAt','')::timestamptz)
    on conflict(id) do update set code=excluded.code,name=excluded.name,type=excluded.type,source=excluded.source,collected_at=excluded.collected_at,frozen_at=excluded.frozen_at,dish_size=excluded.dish_size,quantity=excluded.quantity,unit=excluded.unit,project=excluded.project,notes=excluded.notes,status=excluded.status,custom_values=excluded.custom_values,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at where samples.user_id=owner;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(payload->'locations','[]')) loop
    insert into sample_locations(id,user_id,sample_id,box_id,row_index,column_index,active,stored_at,removed_at,removal_reason)
    values(item->>'id',owner,item->>'sampleId',item->>'boxId',(item->>'row')::smallint,(item->>'column')::smallint,(item->>'active')::boolean,(item->>'storedAt')::timestamptz,nullif(item->>'removedAt','')::timestamptz,item->>'removalReason')
    on conflict(id) do update set box_id=excluded.box_id,row_index=excluded.row_index,column_index=excluded.column_index,active=excluded.active,removed_at=excluded.removed_at,removal_reason=excluded.removal_reason where sample_locations.user_id=owner;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(payload->'customFields','[]')) loop
    insert into custom_field_definitions(id,user_id,name,required) values(item->>'id',owner,item->>'name',(item->>'required')::boolean)
    on conflict(id) do update set name=excluded.name,required=excluded.required where custom_field_definitions.user_id=owner;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(payload->'auditEvents','[]')) loop
    insert into audit_events(id,user_id,action,entity_type,entity_id,summary,created_at,metadata)
    values(item->>'id',owner,item->>'action',item->>'entityType',item->>'entityId',item->>'summary',(item->>'createdAt')::timestamptz,coalesce(item->'metadata','{}')) on conflict(id) do nothing;
  end loop;
end $$;

grant execute on function public.load_inventory_snapshot() to authenticated;
grant execute on function public.save_inventory_snapshot(jsonb) to authenticated;
