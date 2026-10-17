-- Enoria - droits du curé et du secrétaire sur les tables opérationnelles.
-- Toutes les politiques restent limitées à la paroisse de l'affectation active.

drop policy if exists quartiers_admin_manage on public.quartiers;
create policy quartiers_admin_manage on public.quartiers
for all to authenticated
using (public.a_role(paroisse_id, array['secretaire','cure']::public.role_enoria[]))
with check (public.a_role(paroisse_id, array['secretaire','cure']::public.role_enoria[]));

drop policy if exists communautes_admin_manage on public.communautes;
create policy communautes_admin_manage on public.communautes
for all to authenticated
using (public.a_role(paroisse_id, array['secretaire','cure']::public.role_enoria[]))
with check (public.a_role(paroisse_id, array['secretaire','cure']::public.role_enoria[]));

drop policy if exists certificats_admin_manage on public.certificats;
create policy certificats_admin_manage on public.certificats
for all to authenticated
using (
  exists (
    select 1 from public.sacrements s
    where s.id = certificats.sacrement_id
      and s.fidele_id = certificats.fidele_id
      and public.a_role(s.paroisse_id, array['secretaire','cure']::public.role_enoria[])
  )
)
with check (
  exists (
    select 1 from public.sacrements s
    where s.id = certificats.sacrement_id
      and s.fidele_id = certificats.fidele_id
      and public.a_role(s.paroisse_id, array['secretaire','cure']::public.role_enoria[])
  )
);

drop policy if exists fideles_admin_delete on public.fideles;
create policy fideles_admin_delete on public.fideles
for delete to authenticated
using (public.a_role(paroisse_id, array['secretaire','cure']::public.role_enoria[]));

drop policy if exists affectations_secretaire_insert on public.affectations_utilisateurs;
create policy affectations_secretaire_insert on public.affectations_utilisateurs
for insert to authenticated
with check (
  role <> 'cure'::public.role_enoria
  and public.a_role(paroisse_id, array['secretaire']::public.role_enoria[])
);

drop policy if exists affectations_secretaire_update on public.affectations_utilisateurs;
create policy affectations_secretaire_update on public.affectations_utilisateurs
for update to authenticated
using (
  role <> 'cure'::public.role_enoria
  and public.a_role(paroisse_id, array['secretaire']::public.role_enoria[])
)
with check (
  role <> 'cure'::public.role_enoria
  and public.a_role(paroisse_id, array['secretaire']::public.role_enoria[])
);

drop policy if exists affectations_secretaire_delete on public.affectations_utilisateurs;
create policy affectations_secretaire_delete on public.affectations_utilisateurs
for delete to authenticated
using (
  role <> 'cure'::public.role_enoria
  and public.a_role(paroisse_id, array['secretaire']::public.role_enoria[])
);

drop policy if exists historique_actions_admin_insert on public.historique_actions;
create policy historique_actions_admin_insert on public.historique_actions
for insert to authenticated
with check (
  fidele_id is not null
  and exists (
    select 1 from public.fideles f
    where f.id = historique_actions.fidele_id
      and public.a_role(f.paroisse_id, array['secretaire','cure']::public.role_enoria[])
  )
);

grant select, insert, update, delete on public.certificats to authenticated;
grant select, insert, update, delete on public.quartiers to authenticated;
grant select, insert, update, delete on public.communautes to authenticated;
grant select, insert, update, delete on public.fideles to authenticated;
grant select, insert on public.historique_actions to authenticated;
grant select, insert, update, delete on public.affectations_utilisateurs to authenticated;

revoke insert, delete on public.paroisses from authenticated;
revoke update on public.paroisses from authenticated;
grant update (theme) on public.paroisses to authenticated;

revoke insert, delete on public.utilisateurs from authenticated;
