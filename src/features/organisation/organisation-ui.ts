import type { UserContext } from "../../auth/auth-service";
import { getSupabaseClient } from "../../lib/supabase";

function esc(value: unknown): string {
  const map: Record<string,string> = { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" };
  return String(value ?? "").replace(/[&<>"']/g,(c)=>map[c]??c);
}

export async function mountOrganisation(container: HTMLElement, context: UserContext): Promise<void> {
  const list = container.querySelector<HTMLElement>("#organisation-list");
  const feedback = container.querySelector<HTMLElement>("#organisation-feedback");
  if (!list || !feedback) return;
  try {
    const parishId = context.assignments[0].paroisse_id;
    const db = getSupabaseClient();
    const [quartiers, communities] = await Promise.all([
      db.from("quartiers").select("id,nom").eq("paroisse_id",parishId).order("nom"),
      db.from("communautes").select("id,nom,quartier_id,active").eq("paroisse_id",parishId).order("nom")
    ]);
    if (quartiers.error) throw quartiers.error;
    if (communities.error) throw communities.error;
    const rows = quartiers.data.map((quartier) => {
      const items = communities.data.filter((community)=>community.quartier_id===quartier.id);
      const activeCount = items.filter((community)=>community.active).length;
      const children = items.length ? items.map((community)=>`
        <li class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-3">
          <span class="text-sm text-slate-700">${esc(community.nom)}</span>
          <span class="rounded-full px-2.5 py-1 text-[10px] font-medium ${community.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}">${community.active ? "Active" : "Désactivée"}</span>
        </li>`).join("") : '<li class="border-t border-slate-100 py-3 text-xs text-slate-400">Aucune communauté rattachée.</li>';
      return `
        <article class="page-card overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-3 p-5">
            <div><h2 class="font-semibold text-slate-800">${esc(quartier.nom)}</h2><p class="mt-1 text-xs text-slate-500">${items.length} communauté(s) · ${activeCount} active(s)</p></div>
            <button type="button" disabled class="cursor-not-allowed rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-400" title="Écriture non autorisée par les politiques actuelles">Ajouter une communauté</button>
          </div>
          <ul class="px-5 pb-2">${children}</ul>
        </article>`;
    }).join("");
    list.innerHTML = rows || '<div class="page-card p-8 text-center text-sm text-slate-400">Aucun quartier n’est enregistré.</div>';
  } catch (error) {
    list.innerHTML = '<div class="page-card p-6 text-sm text-rose-700">Impossible de charger l’organisation paroissiale.</div>';
    feedback.textContent = error instanceof Error ? error.message : "Erreur de lecture.";
    feedback.className = "rounded-lg bg-rose-50 p-3 text-sm text-rose-700";
  }
}
