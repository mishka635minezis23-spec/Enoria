import type { ActivePastoralYear, UserContext } from "../../auth/auth-service";
import { getSupabaseClient } from "../../lib/supabase";

const htmlEscapes: Record<string, string> = { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" };
const safe = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => htmlEscapes[c] ?? c);

function renderBars(node: HTMLElement, items: { label: string; value: number }[]): void {
  const max = Math.max(1, ...items.map((item) => item.value));
  node.innerHTML = items.length ? items.map((item) => {
    const width = Math.max(0, Math.min(100, Math.round(item.value / max * 100)));
    return `<div class="space-y-1.5"><div class="flex justify-between gap-3 text-xs"><span class="truncate text-slate-700">${safe(item.label)}</span><span class="text-slate-500">${item.value.toLocaleString("fr-CD")}</span></div><div class="h-2 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-[var(--enoria-green)]" style="width:${width}%"></div></div></div>`;
  }).join("") : '<p class="text-sm text-slate-400">Aucune donnée accessible.</p>';
}

export async function mountDashboard(container: HTMLElement, context: UserContext, year: ActivePastoralYear | null): Promise<void> {
  const feedback = container.querySelector<HTMLElement>("#dashboard-feedback");
  const yearNode = container.querySelector<HTMLElement>("#dashboard-year");
  const sacNode = container.querySelector<HTMLElement>("#chart-sacraments");
  const communityNode = container.querySelector<HTMLElement>("#chart-communities");
  if (!feedback || !yearNode || !sacNode || !communityNode) return;
  yearNode.textContent = year ? `Année pastorale : ${year.libelle}` : "Aucune année pastorale active.";
  try {
    const db = getSupabaseClient();
    const parishId = context.assignments[0].paroisse_id;
    const [faithful, communities] = await Promise.all([
      db.from("stats_fideles_par_communaute").select("communaute_id,fideles_actifs,fideles_decedes").eq("paroisse_id", parishId),
      db.from("communautes").select("id,nom").order("nom")
    ]);
    if (faithful.error) throw faithful.error;
    if (communities.error) throw communities.error;
    const rows = faithful.data ?? [];
    const living = rows.reduce((sum, row) => sum + (row.fideles_actifs ?? 0), 0);
    const deceased = rows.reduce((sum, row) => sum + (row.fideles_decedes ?? 0), 0);
    container.querySelector("#stat-faithful-active")!.textContent = living.toLocaleString("fr-CD");
    container.querySelector("#stat-faithful-deceased")!.textContent = deceased.toLocaleString("fr-CD");
    const names = new Map(communities.data.map((item) => [item.id, item.nom]));
    renderBars(communityNode, rows.map((row) => ({
      label: names.get(row.communaute_id ?? "") ?? "Communauté",
      value: (row.fideles_actifs ?? 0) + (row.fideles_decedes ?? 0)
    })).sort((a,b) => b.value-a.value));

    if (!year) {
      container.querySelector("#stat-sacraments")!.textContent = "—";
      container.querySelector("#stat-tithes")!.textContent = "—";
      sacNode.textContent = "Configure une année pastorale active pour voir les sacrements.";
      return;
    }
    const { data: sacraments, error: sacError } = await db.from("stats_sacrements_par_annee")
      .select("type,total").eq("paroisse_id", parishId).eq("annee_pastorale_id", year.id);
    if (sacError) throw sacError;
    const sums = new Map<string, number>();
    for (const row of sacraments ?? []) sums.set(row.type ?? "autre", (sums.get(row.type ?? "autre") ?? 0) + (row.total ?? 0));
    const labels: Record<string,string> = { bapteme:"Baptêmes", eucharistie:"Eucharisties", confirmation:"Confirmations" };
    const items = [...sums].map(([type,value]) => ({label:labels[type] ?? type,value}));
    container.querySelector("#stat-sacraments")!.textContent = items.reduce((sum,item)=>sum+item.value,0).toLocaleString("fr-CD");
    renderBars(sacNode,items);

    if (context.roles.some((role)=>role==="secretaire" || role==="cure")) {
      const {data,error} = await db.from("dimes").select("montant,devise").eq("annee_pastorale_id",year.id);
      if (error) throw error;
      const currencies = new Map<string,number>();
      for (const row of data ?? []) currencies.set(row.devise,(currencies.get(row.devise) ?? 0)+row.montant);
      container.querySelector("#stat-tithes")!.textContent = [...currencies].map(([currency,value])=>`${value.toLocaleString("fr-CD",{maximumFractionDigits:2})} ${currency}`).join(" · ") || "0";
    } else {
      container.querySelector("#stat-tithes")!.textContent = "Réservé";
    }
  } catch (error) {
    feedback.textContent = error instanceof Error ? error.message : "Impossible de charger les statistiques.";
    feedback.className = "rounded-lg bg-rose-50 p-3 text-sm text-rose-700";
  }
}
