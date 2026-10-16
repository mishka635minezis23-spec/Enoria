import { getSupabaseClient } from "../../lib/supabase";
import { navigateToFaithful } from "../../router";

const PAGE_SIZE = 20;

function escape(value: unknown): string {
  const map: Record<string,string> = { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (c) => map[c] ?? c);
}
function cleanSearch(value: string): string {
  return value.normalize("NFC").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().slice(0,80);
}
function readParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.split("?")[1] ?? "");
}
function writeParams(params: URLSearchParams): void {
  const query = params.toString();
  const hash = `#/sacrements${query ? `?${query}` : ""}`;
  window.history.replaceState(null,"",`${window.location.pathname}${window.location.search}${hash}`);
}

export function mountSacramentsPage(container: HTMLElement): void {
  const form = container.querySelector<HTMLFormElement>("#sacrament-search-form")!;
  const search = container.querySelector<HTMLInputElement>("#sacrament-search")!;
  const results = container.querySelector<HTMLElement>("#sacrament-search-results")!;
  const feedback = container.querySelector<HTMLElement>("#sacrament-search-feedback")!;
  const count = container.querySelector<HTMLElement>("#sacrament-search-count")!;
  const pageLabel = container.querySelector<HTMLElement>("#sacrament-page")!;
  const previous = container.querySelector<HTMLButtonElement>("#sacrament-prev")!;
  const next = container.querySelector<HTMLButtonElement>("#sacrament-next")!;
  const initial = readParams();
  search.value = initial.get("q") ?? "";
  let sequence = 0;

  async function load(): Promise<void> {
    const currentSequence = ++sequence;
    const params = readParams();
    const page = Math.max(1, Number(params.get("page") ?? "1"));
    const term = cleanSearch(params.get("q") ?? "");
    const from = (page - 1) * PAGE_SIZE;
    feedback.classList.add("hidden");
    results.innerHTML = '<p class="py-8 text-center text-sm text-slate-400">Chargement…</p>';
    previous.disabled = true;
    next.disabled = true;
    pageLabel.textContent = `Page ${page}`;

    try {
      let query = getSupabaseClient().from("fideles")
        .select("id,prenom,nom,sexe,statut", {count:"exact"})
        .order("nom").order("prenom").range(from,from+PAGE_SIZE-1);
      if (term) query = query.or(`prenom.ilike.%${term}%,nom.ilike.%${term}%`);
      const {data,error,count:total} = await query;
      if (currentSequence !== sequence) return;
      if (error) throw error;
      const rows = data ?? [];
      results.innerHTML = rows.length ? rows.map((item) => `
        <article class="flex flex-wrap items-center justify-between gap-3 py-4">
          <div class="min-w-0"><p class="truncate text-sm font-semibold text-slate-800">${escape(item.prenom)} ${escape(item.nom)}</p><p class="mt-1 text-xs text-slate-500">${item.sexe === "masculin" ? "Masculin" : "Féminin"} · ${item.statut === "decede" ? "Décédé" : "Vivant"}</p></div>
          <button type="button" data-open-sacrament-fidele="${escape(item.id)}" class="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50">Ouvrir le livret</button>
        </article>`).join("") : '<p class="py-8 text-center text-sm text-slate-400">Aucun fidèle trouvé dans les dossiers accessibles.</p>';
      count.textContent = `${(total ?? 0).toLocaleString("fr-CD")} fidèle(s)`;
      pageLabel.textContent = `Page ${page}`;
      previous.disabled = page <= 1;
      next.disabled = from + rows.length >= (total ?? 0);
    } catch (error) {
      if (currentSequence !== sequence) return;
      results.innerHTML = '<p class="py-8 text-center text-sm text-rose-600">La recherche est indisponible.</p>';
      feedback.textContent = error instanceof Error ? error.message : "Erreur de lecture.";
      feedback.className = "mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700";
      count.textContent = "Recherche indisponible";
    }
  }

  form.addEventListener("submit",(event)=>{
    event.preventDefault();
    const params = new URLSearchParams();
    const term = cleanSearch(search.value);
    if(term) params.set("q",term);
    writeParams(params);
    void load();
  });
  previous.addEventListener("click",()=>{
    const params=readParams();
    params.set("page",String(Math.max(1,Number(params.get("page")??"1")-1)));
    writeParams(params);
    void load();
  });
  next.addEventListener("click",()=>{
    const params=readParams();
    params.set("page",String(Number(params.get("page")??"1")+1));
    writeParams(params);
    void load();
  });
  container.addEventListener("click",(event)=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>("[data-open-sacrament-fidele]");
    if(button?.dataset.openSacramentFidele) navigateToFaithful(button.dataset.openSacramentFidele);
  });
  void load();
}
