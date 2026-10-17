alter table public.paroisses
  add column if not exists theme jsonb not null default '{
    "primary": "#061AAC",
    "secondary": "#33A3F8",
    "primarySoft": "#EAF5FF",
    "background": "#F7F9FC",
    "surface": "#FFFFFF",
    "text": "#282C30",
    "textMuted": "#667085",
    "border": "#E5EAF0"
  }'::jsonb;

alter table public.paroisses
  drop constraint if exists paroisses_theme_colors_check;

alter table public.paroisses
  add constraint paroisses_theme_colors_check check (
    jsonb_typeof(theme) = 'object'
    and theme ?& array['primary','secondary','primarySoft','background','surface','text','textMuted','border']
    and (theme->>'primary') ~ '^#[0-9A-Fa-f]{6}$'
    and (theme->>'secondary') ~ '^#[0-9A-Fa-f]{6}$'
    and (theme->>'primarySoft') ~ '^#[0-9A-Fa-f]{6}$'
    and (theme->>'background') ~ '^#[0-9A-Fa-f]{6}$'
    and (theme->>'surface') ~ '^#[0-9A-Fa-f]{6}$'
    and (theme->>'text') ~ '^#[0-9A-Fa-f]{6}$'
    and (theme->>'textMuted') ~ '^#[0-9A-Fa-f]{6}$'
    and (theme->>'border') ~ '^#[0-9A-Fa-f]{6}$'
  );

drop policy if exists paroisses_theme_update on public.paroisses;
create policy paroisses_theme_update
  on public.paroisses
  for update
  to authenticated
  using (public.a_role(id, array['secretaire','cure']::public.role_enoria[]))
  with check (public.a_role(id, array['secretaire','cure']::public.role_enoria[]));

grant select on public.paroisses to authenticated;
grant update (theme) on public.paroisses to authenticated;
