-- Gestion encadrée des profils des utilisateurs affectés à une paroisse.
-- La secrétaire et le curé peuvent lire les profils de leur paroisse
-- et mettre à jour uniquement le nom complet et le téléphone.

drop policy if exists utilisateurs_paroisse_read on public.utilisateurs;
create policy utilisateurs_paroisse_read on public.utilisateurs
for select to authenticated
using (
  exists (
    select 1 from public.affectations_utilisateurs a
    where a.utilisateur_id = utilisateurs.id
      and public.a_role(a.paroisse_id, array['secretaire','cure']::public.role_enoria[])
  )
);

drop policy if exists utilisateurs_paroisse_update on public.utilisateurs;
create policy utilisateurs_paroisse_update on public.utilisateurs
for update to authenticated
using (
  exists (
    select 1 from public.affectations_utilisateurs a
    where a.utilisateur_id = utilisateurs.id
      and public.a_role(a.paroisse_id, array['secretaire','cure']::public.role_enoria[])
  )
)
with check (
  exists (
    select 1 from public.affectations_utilisateurs a
    where a.utilisateur_id = utilisateurs.id
      and public.a_role(a.paroisse_id, array['secretaire','cure']::public.role_enoria[])
  )
);

revoke update on public.utilisateurs from authenticated;
grant update (nom_complet, telephone) on public.utilisateurs to authenticated;
