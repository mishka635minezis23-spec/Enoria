alter table public.paroisses drop constraint if exists paroisses_theme_colors_check;
alter table public.paroisses add constraint paroisses_theme_colors_check check (
  jsonb_typeof(theme) = 'object'
  and theme ?& array['primary','secondary','primarySoft','background','surface','text','textMuted','border']
  and jsonb_typeof(theme->'primary') = 'string' and coalesce(theme->>'primary' ~ '^#[0-9A-Fa-f]{6}$', false)
  and jsonb_typeof(theme->'secondary') = 'string' and coalesce(theme->>'secondary' ~ '^#[0-9A-Fa-f]{6}$', false)
  and jsonb_typeof(theme->'primarySoft') = 'string' and coalesce(theme->>'primarySoft' ~ '^#[0-9A-Fa-f]{6}$', false)
  and jsonb_typeof(theme->'background') = 'string' and coalesce(theme->>'background' ~ '^#[0-9A-Fa-f]{6}$', false)
  and jsonb_typeof(theme->'surface') = 'string' and coalesce(theme->>'surface' ~ '^#[0-9A-Fa-f]{6}$', false)
  and jsonb_typeof(theme->'text') = 'string' and coalesce(theme->>'text' ~ '^#[0-9A-Fa-f]{6}$', false)
  and jsonb_typeof(theme->'textMuted') = 'string' and coalesce(theme->>'textMuted' ~ '^#[0-9A-Fa-f]{6}$', false)
  and jsonb_typeof(theme->'border') = 'string' and coalesce(theme->>'border' ~ '^#[0-9A-Fa-f]{6}$', false)
);

drop policy if exists paroisses_theme_update on public.paroisses;
create policy paroisses_theme_update on public.paroisses
for update to authenticated
using (
  exists (
    select 1
    from public.affectations_utilisateurs a
    join public.utilisateurs u on u.id = a.utilisateur_id and u.actif
    where a.utilisateur_id = (select auth.uid())
      and a.paroisse_id = paroisses.id
      and a.active
      and a.role = any(array['secretaire','cure']::public.role_enoria[])
      and a.date_debut <= now()
      and (a.date_fin is null or a.date_fin >= now())
  )
)
with check (
  exists (
    select 1
    from public.affectations_utilisateurs a
    join public.utilisateurs u on u.id = a.utilisateur_id and u.actif
    where a.utilisateur_id = (select auth.uid())
      and a.paroisse_id = paroisses.id
      and a.active
      and a.role = any(array['secretaire','cure']::public.role_enoria[])
      and a.date_debut <= now()
      and (a.date_fin is null or a.date_fin >= now())
  )
);
