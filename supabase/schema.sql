-- BBAN Sudan V2 — Supabase SQL
-- Run this entire file in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_bban_admin()
returns boolean language sql stable security definer
set search_path = public
as $$ select exists(select 1 from public.admin_users where user_id = auth.uid()); $$;

create table if not exists public.banks (
  id text primary key check (id ~ '^[a-z0-9_-]{1,32}$'),
  name_ar text not null,
  name_en text not null,
  prefix text not null check (prefix ~ '^[0-9]{1,10}$'),
  suffix text not null default '' check (suffix ~ '^[0-9]{0,10}$'),
  status text not null default 'unk' check (status in ('ok','unk','bad')),
  enabled boolean not null default true,
  logo_url text,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now(),
  check (length(prefix) + length(suffix) < 14)
);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('page_view','bank_selected','bban_generate')),
  bank_id text references public.banks(id) on delete set null,
  page_path text,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_created_at_idx on public.usage_events(created_at desc);
create index if not exists usage_events_type_idx on public.usage_events(event_type);

alter table public.admin_users enable row level security;
alter table public.banks enable row level security;
alter table public.usage_events enable row level security;

drop policy if exists "admins read own admin record" on public.admin_users;
create policy "admins read own admin record" on public.admin_users for select to authenticated using (user_id = auth.uid());

drop policy if exists "public read enabled banks" on public.banks;
create policy "public read enabled banks" on public.banks for select to anon, authenticated using (enabled = true or public.is_bban_admin());
drop policy if exists "admins insert banks" on public.banks;
create policy "admins insert banks" on public.banks for insert to authenticated with check (public.is_bban_admin());
drop policy if exists "admins update banks" on public.banks;
create policy "admins update banks" on public.banks for update to authenticated using (public.is_bban_admin()) with check (public.is_bban_admin());
drop policy if exists "admins delete banks" on public.banks;
create policy "admins delete banks" on public.banks for delete to authenticated using (public.is_bban_admin());

drop policy if exists "public insert anonymous aggregate events" on public.usage_events;
create policy "public insert anonymous aggregate events" on public.usage_events for insert to anon, authenticated with check (
  event_type in ('page_view','bank_selected','bban_generate')
  and (bank_id is null or exists(select 1 from public.banks b where b.id = bank_id))
  and (page_path is null or length(page_path) <= 120)
);
drop policy if exists "admins read usage events" on public.usage_events;
create policy "admins read usage events" on public.usage_events for select to authenticated using (public.is_bban_admin());

-- Public logo bucket; only admins can upload, update or delete files.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('bank-logos','bank-logos',true,2097152,array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set public=true, file_size_limit=2097152, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "public read bank logos" on storage.objects;
create policy "public read bank logos" on storage.objects for select to anon, authenticated using (bucket_id='bank-logos');
drop policy if exists "admins upload bank logos" on storage.objects;
create policy "admins upload bank logos" on storage.objects for insert to authenticated with check (bucket_id='bank-logos' and public.is_bban_admin());
drop policy if exists "admins update bank logos" on storage.objects;
create policy "admins update bank logos" on storage.objects for update to authenticated using (bucket_id='bank-logos' and public.is_bban_admin()) with check (bucket_id='bank-logos' and public.is_bban_admin());
drop policy if exists "admins delete bank logos" on storage.objects;
create policy "admins delete bank logos" on storage.objects for delete to authenticated using (bucket_id='bank-logos' and public.is_bban_admin());

-- Optional initial seed: inserts the current local bank list as UNCONFIRMED.
-- Review every prefix/suffix against an official bank source before changing status to 'ok'.
insert into public.banks (id,name_ar,name_en,prefix,suffix,status,enabled,sort_order) values
('khartoum','بنك الخرطوم – بنكك','Bank of Khartoum – Bankak','040','0001','unk',true,10),
('faisal','بنك فيصل الإسلامي – فوري','Faisal Islamic Bank – Fawry','02','0001','unk',true,20),
('omdurman','بنك أمدرمان الوطني – أوكاش','Omdurman National Bank – OCash','240','00001','unk',true,30),
('nile','بنك النيل – مشرق','Nile Bank – Mashreq','150','000','unk',true,40),
('islamic','البنك الإسلامي السوداني – أمن بلس','Sudanese Islamic Bank – Aman Plus','140','00001','unk',true,50),
('mazare','بنك المزارع التجاري – مصرفك','Farmers Commercial Bank – Masrafak','222','','unk',true,60),
('french','البنك السوداني الفرنسي','Sudanese French Bank','110','00001','unk',true,70),
('agri','البنك الزراعي السوداني','Agricultural Bank of Sudan','03','01001','unk',true,80),
('salam','بنك السلام السوداني','Al Salam Bank Sudan','180','00001','unk',true,90),
('baraka','بنك البركة السوداني','Al Baraka Bank Sudan','070','00001','bad',true,100),
('livestock','بنك الثروة الحيوانية','Animal Resources Bank','090','00001','unk',true,110),
('realestate','البنك العقاري التجاري','Real Estate Commercial Bank','210','00001','unk',true,120),
('industrial','بنك التنمية الصناعية','Industrial Development Bank','130','00001','unk',true,130),
('united','بنك المال المتحد','United Capital Bank','170','00001','unk',true,140),
('cashi','محفظة ماي كاشي – Cashi','MyCashi Wallet – Cashi','070','98','unk',false,150),
('workers','بنك العمال الوطني','National Workers Bank','160','00001','unk',true,160),
('saving','بنك الادخار والتنمية','Savings & Development Bank','120','00001','unk',true,170),
('tadamon','بنك التضامن الإسلامي','Tadamon Islamic Bank','080','00001','unk',true,180),
('gulf','بنك الخليج','Gulf Bank','290','00001','unk',true,190),
('family','بنك الأسرة','Family Bank','300','00001','unk',true,200),
('north','بنك الشمال الإسلامي','Al Shamal Islamic Bank','050','00001','unk',true,210),
('nilain','بنك النيلين','Nilein Bank','060','00001','unk',true,220),
('jordan','البنك السوداني الأردني','Sudanese Jordanian Bank','190','00001','unk',true,230),
('qnb','بنك قطر الوطني – QNB','Qatar National Bank – QNB','230','00001','unk',true,240),
('byblos','بنك بيبلوس إفريقيا','Byblos Bank Africa','250','00001','unk',true,250)
on conflict (id) do nothing;

-- After creating your admin user in Supabase Authentication, grant admin access:
-- replace UUID below with the Auth user's UUID, then run separately:
-- insert into public.admin_users(user_id) values ('00000000-0000-0000-0000-000000000000') on conflict do nothing;
