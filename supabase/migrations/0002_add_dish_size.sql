-- Compatibility migration for databases created before dish_size was added.
alter table public.samples add column if not exists dish_size text;
update public.samples set dish_size = '未记录' where dish_size is null or length(trim(dish_size)) = 0;
alter table public.samples alter column dish_size set not null;
alter table public.samples drop constraint if exists samples_dish_size_check;
alter table public.samples add constraint samples_dish_size_check check (length(trim(dish_size)) > 0);
