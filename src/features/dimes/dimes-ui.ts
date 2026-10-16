import type { ActivePastoralYear, UserContext } from "../../auth/auth-service";
import { getSupabaseClient } from "../../lib/supabase";

const esc = (value: unknown) => {
  const map: Record<string,string> = { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" };
  return String(value ?? "").replace(/[&<>"']/g,(c)=>map[c]??c);
};
const clean = (value: string) => value.normalize("NFC").replace(/[^\p{L}\p{N}\s-]/gu,"").trim().slice(0,80);

export async function mountDimesPage(container: HTMLElement, context: UserContext, year: ActivePastoralYear | null): Promise<void> {
  const roles = context.roles;
  if (!roles.some((role)=>role==="secretaire" || role==="cure")) {
    container.innerHTML = '<section class="page-card p-6 text-sm text-slate-600">Ce module est réservé à la secrétaire et au curé.</section>';
    return;
  }
  const yearNode=container.querySelector<HTMLElement>("#dimes-year")!;
  const feedback=container.querySelector<HTMLElement>("#dimes-feedback")!;
  const form=container.querySelector<HTMLFormElement>("#dime-form")!;
  const search=container.querySelector<HTMLInputElement>("#dime-search")!;
  const searchResults=container.querySelector<HTMLElement>("#dime-search-results")!;
  const selectedNode=container.querySelector<HTMLElement>("#dime-selected")!;
  const selectedId=container.querySelector<HTMLInputElement>("#dime-fidele-id")!;
  const amount=container.querySelector<HTMLInputElement>("#dime-amount")!;
  const currency=container.querySelector<HTMLSelectElement>("#dime-currency")!;
  const observation=container.querySelector<HTMLInputElement>("#dime-observation")!;
  const submit=container.querySelector<HTMLButtonElement>("#dime-submit")!;
  const rowsNode=container.querySelector<HTMLElement>("#dimes-rows")!;
  const countNode=container.querySelector<HTMLElement>("#dimes-count")!;
  const db=getSupabaseClient();

  if (!year) {
    yearNode.textContent="Aucune année pastorale active.";
    feedback.textContent="Configure une année pastorale active avant d'enregistrer une dîme.";
    feedback.className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800";
    form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>("input,select,button").forEach((item)=>item.disabled=true);
    return;
  }
  yearNode.textContent=`Année pastorale : ${year.libelle}`;

  async function loadDimes(): Promise<void> {
    rowsNode.innerHTML='<tr><td colspan="5" class="px-3 py-10 text-center text-sm text-slate-400">Chargement…</td></tr>';
    try {
      const [listResult,totalResult]=await Promise.all([
        db.from("dimes").select("id,fidele_id,montant,devise,observation,created_at",{count:"exact"}).eq("annee_pastorale_id",year.id).order("created_at",{ascending:false}).range(0,49),
        db.from("dimes").select("montant,devise").eq("annee_pastorale_id",year.id)
      ]);
      if(listResult.error) throw listResult.error;
      if(totalResult.error) throw totalResult.error;
      const entries=listResult.data??[];
      const ids=[...new Set(entries.map((item)=>item.fidele_id))];
      const names=new Map<string,string>();
      if(ids.length) {
        const people=await db.from("fideles").select("id,prenom,nom").in("id",ids);
        if(people.error) throw people.error;
        for(const person of people.data) names.set(person.id,`${person.prenom} ${person.nom}`);
      }
      rowsNode.innerHTML=entries.length?entries.map((item)=>`
        <tr class="border-b border-slate-100 last:border-0"><td class="px-3 py-3 font-medium text-slate-800">${esc(names.get(item.fidele_id)??"Fidèle non visible")}</td><td class="px-3 py-3 tabular-nums">${item.montant.toLocaleString("fr-CD",{maximumFractionDigits:2})}</td><td class="px-3 py-3">${esc(item.devise)}</td><td class="px-3 py-3 text-slate-500">${esc(item.observation??"—")}</td><td class="px-3 py-3 text-xs text-slate-500">${new Intl.DateTimeFormat("fr-CD",{dateStyle:"medium"}).format(new Date(item.created_at))}</td></tr>`).join(""):'<tr><td colspan="5" class="px-3 py-10 text-center text-sm text-slate-400">Aucune dîme enregistrée pour cette année.</td></tr>';
      countNode.textContent=`${(listResult.count??0).toLocaleString("fr-CD")} contribution(s) · 50 dernières affichées au maximum`;
      const totals=new Map<string,number>();
      for(const item of totalResult.data??[]) totals.set(item.devise,(totals.get(item.devise)??0)+item.montant);
      container.querySelector<HTMLElement>("#dimes-total-usd")!.textContent=(totals.get("USD")??0).toLocaleString("fr-CD",{maximumFractionDigits:2});
      container.querySelector<HTMLElement>("#dimes-total-fc")!.textContent=(totals.get("FC")??0).toLocaleString("fr-CD",{maximumFractionDigits:2});
    } catch(error) {
      rowsNode.innerHTML='<tr><td colspan="5" class="px-3 py-10 text-center text-sm text-rose-600">Impossible de charger les dîmes.</td></tr>';
      feedback.textContent=error instanceof Error?error.message:"Erreur de lecture.";
      feedback.className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700";
    }
  }

  async function searchFaithful(): Promise<void> {
    const term=clean(search.value);
    if(!term) {
      feedback.textContent="Saisis un nom ou un prénom pour rechercher.";
      feedback.className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800";
      return;
    }
    searchResults.classList.remove("hidden");
    searchResults.innerHTML='<p class="py-3 text-sm text-slate-400">Recherche…</p>';
    const {data,error}=await db.from("fideles").select("id,prenom,nom").or(`prenom.ilike.%${term}%,nom.ilike.%${term}%`).order("nom").limit(10);
    if(error) {
      searchResults.innerHTML='<p class="py-3 text-sm text-rose-600">Recherche impossible.</p>';
      feedback.textContent=error.message;
      feedback.className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700";
      return;
    }
    searchResults.innerHTML=(data??[]).map((person)=>`
      <button type="button" data-select-dime-fidele="${esc(person.id)}" data-person-name="${esc(person.prenom)} ${esc(person.nom)}" class="block w-full py-3 text-left text-sm text-slate-700 hover:text-emerald-800">${esc(person.prenom)} ${esc(person.nom)}</button>`).join("")||'<p class="py-3 text-sm text-slate-400">Aucun fidèle trouvé.</p>';
  }

  container.querySelector<HTMLButtonElement>("#dime-search-button")!.addEventListener("click",()=>void searchFaithful());
  search.addEventListener("keydown",(event)=>{if(event.key==="Enter"){event.preventDefault();void searchFaithful();}});
  container.addEventListener("click",(event)=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>("[data-select-dime-fidele]");
    if(!button?.dataset.selectDimeFidele)return;
    selectedId.value=button.dataset.selectDimeFidele;
    selectedNode.textContent=`Fidèle sélectionné : ${button.dataset.personName??""}`;
    selectedNode.classList.remove("hidden");
    searchResults.classList.add("hidden");
  });

  form.addEventListener("submit",async(event)=>{
    event.preventDefault();
    feedback.className="hidden";
    const amountValue=Number(amount.value);
    if(!selectedId.value) {
      feedback.textContent="Sélectionne d'abord un fidèle.";
      feedback.className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800";
      return;
    }
    if(!Number.isFinite(amountValue)||amountValue<0) {
      feedback.textContent="Le montant doit être un nombre positif ou nul.";
      feedback.className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800";
      return;
    }
    submit.disabled=true;
    submit.textContent="Enregistrement…";
    try {
      const {error}=await db.from("dimes").upsert({
        fidele_id:selectedId.value,
        annee_pastorale_id:year.id,
        montant:amountValue,
        devise:currency.value as "USD"|"FC",
        observation:observation.value.trim()||null
      },{onConflict:"fidele_id,annee_pastorale_id"});
      if(error)throw error;
      feedback.textContent="Dîme enregistrée. Si une ligne existait déjà pour ce fidèle et cette année, elle a été mise à jour.";
      feedback.className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800";
      selectedId.value="";
      selectedNode.textContent="";
      selectedNode.classList.add("hidden");
      amount.value="";
      observation.value="";
      search.value="";
      await loadDimes();
    } catch(error) {
      feedback.textContent=error instanceof Error?error.message:"Enregistrement impossible.";
      feedback.className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700";
    } finally {
      submit.disabled=false;
      submit.textContent="Enregistrer la dîme";
    }
  });

  await loadDimes();
}
