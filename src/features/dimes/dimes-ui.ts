import type { ActivePastoralYear, UserContext } from "../../auth/auth-service";
import { getSupabaseClient } from "../../lib/supabase";

const esc = (value: unknown) => {
  const map: Record<string,string> = { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" };
  return String(value ?? "").replace(/[&<>"']/g,(c)=>map[c]??c);
};
const clean = (value: string) => value.normalize("NFC").replace(/[^\p{L}\p{N}\s-]/gu,"").trim().slice(0,80);

export async function mountDimesPage(container: HTMLElement, context: UserContext, year: ActivePastoralYear | null): Promise<void> {
  if (!context.roles.some((role)=>role==="secretaire" || role==="cure")) {
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
  let editingId:string|null=null;
  let searchSequence=0;
  let suggestionTimer:number|undefined;

  if (!year) {
    yearNode.textContent="Aucune année pastorale active.";
    feedback.textContent="Configure une année pastorale active avant d'enregistrer une dîme.";
    feedback.className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800";
    form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>("input,select,button").forEach((item)=>item.disabled=true);
    return;
  }
  const activeYear=year;
  yearNode.textContent=`Année pastorale : ${activeYear.libelle}`;

  function showFeedback(message:string,kind:"success"|"error"|"warning"="success"):void {
    feedback.textContent=message;
    feedback.className=kind==="error"?"rounded-lg bg-rose-50 p-3 text-sm text-rose-700":kind==="warning"?"rounded-lg bg-amber-50 p-3 text-sm text-amber-800":"rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800";
  }
  function resetForm():void {
    editingId=null; selectedId.value=""; selectedNode.textContent=""; selectedNode.classList.add("hidden");
    amount.value=""; observation.value=""; search.value=""; currency.value="USD";
    submit.textContent="Enregistrer la dîme";
    const cancel=container.querySelector<HTMLButtonElement>("#dime-cancel-edit");
    cancel?.classList.add("hidden");
    searchResults.classList.add("hidden");
  }
  async function loadDimes():Promise<void> {
    rowsNode.innerHTML='<tr><td colspan="6" class="px-3 py-10 text-center text-sm text-slate-400">Chargement…</td></tr>';
    try {
      const [listResult,totalResult]=await Promise.all([
        db.from("dimes").select("id,fidele_id,montant,devise,observation,created_at",{count:"exact"}).eq("annee_pastorale_id",activeYear.id).order("created_at",{ascending:false}).range(0,99),
        db.from("dimes").select("montant,devise").eq("annee_pastorale_id",activeYear.id)
      ]);
      if(listResult.error)throw listResult.error;
      if(totalResult.error)throw totalResult.error;
      const entries=listResult.data??[];
      const ids=[...new Set(entries.map((item)=>item.fidele_id))];
      const names=new Map<string,string>();
      if(ids.length) {
        const people=await db.from("fideles").select("id,prenom,nom").in("id",ids);
        if(people.error)throw people.error;
        for(const person of people.data??[])names.set(person.id,`${person.prenom} ${person.nom}`);
      }
      rowsNode.innerHTML=entries.length?entries.map((item)=>`
        <tr class="border-b border-slate-100 last:border-0">
          <td class="px-3 py-3 font-medium text-slate-800">${esc(names.get(item.fidele_id)??"Fidèle non visible")}</td>
          <td class="px-3 py-3 tabular-nums">${item.montant.toLocaleString("fr-CD",{maximumFractionDigits:2})}</td>
          <td class="px-3 py-3">${esc(item.devise)}</td><td class="px-3 py-3 text-slate-500">${esc(item.observation??"—")}</td>
          <td class="px-3 py-3 text-xs text-slate-500">${new Intl.DateTimeFormat("fr-CD",{dateStyle:"medium"}).format(new Date(item.created_at))}</td>
          <td class="px-3 py-3"><div class="flex gap-2"><button type="button" data-edit-dime="${esc(item.id)}" class="text-xs font-semibold text-emerald-700 hover:underline">Modifier</button><button type="button" data-delete-dime="${esc(item.id)}" class="text-xs font-semibold text-rose-600 hover:underline">Supprimer</button></div></td>
        </tr>`).join(""):'<tr><td colspan="6" class="px-3 py-10 text-center text-sm text-slate-400">Aucune dîme enregistrée pour cette année.</td></tr>';
      countNode.textContent=`${(listResult.count??0).toLocaleString("fr-CD")} contribution(s) · 100 dernières affichées au maximum`;
      const totals=new Map<string,number>();
      for(const item of totalResult.data??[])totals.set(item.devise,(totals.get(item.devise)??0)+item.montant);
      container.querySelector<HTMLElement>("#dimes-total-usd")!.textContent=(totals.get("USD")??0).toLocaleString("fr-CD",{maximumFractionDigits:2});
      container.querySelector<HTMLElement>("#dimes-total-fc")!.textContent=(totals.get("FC")??0).toLocaleString("fr-CD",{maximumFractionDigits:2});
    } catch(error) {
      rowsNode.innerHTML='<tr><td colspan="6" class="px-3 py-10 text-center text-sm text-rose-600">Impossible de charger les dîmes.</td></tr>';
      showFeedback(error instanceof Error?error.message:"Erreur de lecture.","error");
    }
  }
  async function searchFaithful():Promise<void> {
    const sequence=++searchSequence;
    const term=clean(search.value);
    selectedId.value=""; selectedNode.textContent=""; selectedNode.classList.add("hidden");
    if(!term){searchResults.classList.add("hidden");return;}
    searchResults.classList.remove("hidden");
    searchResults.innerHTML='<p class="py-3 text-sm text-slate-400">Recherche…</p>';
    const tokens=term.split(/\s+/).filter(Boolean);
    const expression=tokens.map((part)=>`prenom.ilike.%${part}%,nom.ilike.%${part}%`).join(",");
    const {data,error}=await db.from("fideles").select("id,prenom,nom").or(expression).order("nom").limit(10);
    if(sequence!==searchSequence)return;
    if(error){searchResults.innerHTML='<p class="py-3 text-sm text-rose-600">Recherche impossible.</p>';showFeedback(error.message,"error");return;}
    searchResults.innerHTML=(data??[]).map((person)=>`
      <button type="button" data-select-dime-fidele="${esc(person.id)}" data-person-name="${esc(person.prenom)} ${esc(person.nom)}" class="block w-full py-3 text-left text-sm text-slate-700 hover:text-emerald-800">${esc(person.prenom)} ${esc(person.nom)}</button>`).join("")||'<p class="py-3 text-sm text-slate-400">Aucun fidèle trouvé.</p>';
  }
  search.addEventListener("input",()=>{
    if(suggestionTimer!==undefined)window.clearTimeout(suggestionTimer);
    suggestionTimer=window.setTimeout(()=>void searchFaithful(),180);
  });
  search.addEventListener("keydown",(event)=>{if(event.key==="Enter"){event.preventDefault();void searchFaithful();}});
  container.querySelector<HTMLButtonElement>("#dime-search-button")!.addEventListener("click",()=>void searchFaithful());
  container.querySelector<HTMLButtonElement>("#dime-cancel-edit")?.addEventListener("click",resetForm);
  container.addEventListener("click",async(event)=>{
    const target=event.target as HTMLElement;
    const choose=target.closest<HTMLButtonElement>("[data-select-dime-fidele]");
    if(choose?.dataset.selectDimeFidele){
      selectedId.value=choose.dataset.selectDimeFidele;selectedNode.textContent=`Fidèle sélectionné : ${choose.dataset.personName??""}`;
      selectedNode.classList.remove("hidden");searchResults.classList.add("hidden");return;
    }
    const edit=target.closest<HTMLButtonElement>("[data-edit-dime]");
    if(edit?.dataset.editDime){
      const {data,error}=await db.from("dimes").select("id,fidele_id,montant,devise,observation").eq("id",edit.dataset.editDime).eq("annee_pastorale_id",activeYear.id).single();
      if(error||!data){showFeedback(error?.message??"Dîme introuvable.","error");return;}
      const person=await db.from("fideles").select("prenom,nom").eq("id",data.fidele_id).single();
      if(person.error){showFeedback(person.error.message,"error");return;}
      editingId=data.id;selectedId.value=data.fidele_id;selectedNode.textContent=`Modification : ${person.data.prenom} ${person.data.nom}`;
      selectedNode.classList.remove("hidden");amount.value=String(data.montant);currency.value=data.devise;observation.value=data.observation??"";
      submit.textContent="Enregistrer les modifications";container.querySelector<HTMLButtonElement>("#dime-cancel-edit")?.classList.remove("hidden");
      form.scrollIntoView({behavior:"smooth",block:"center"});return;
    }
    const remove=target.closest<HTMLButtonElement>("[data-delete-dime]");
    if(remove?.dataset.deleteDime){
      if(!window.confirm("Supprimer définitivement cette contribution ?"))return;
      const {error}=await db.from("dimes").delete().eq("id",remove.dataset.deleteDime).eq("annee_pastorale_id",activeYear.id);
      if(error){showFeedback(error.message,"error");return;}
      if(editingId===remove.dataset.deleteDime)resetForm();
      showFeedback("La contribution a été supprimée.");await loadDimes();
    }
  });
  form.addEventListener("submit",async(event)=>{
    event.preventDefault();feedback.className="hidden";
    const amountValue=Number(amount.value);
    if(!selectedId.value){showFeedback("Sélectionne d'abord un fidèle.","warning");return;}
    if(!Number.isFinite(amountValue)||amountValue<0){showFeedback("Le montant doit être un nombre positif ou nul.","warning");return;}
    submit.disabled=true;submit.textContent="Enregistrement…";
    try{
      const payload={fidele_id:selectedId.value,annee_pastorale_id:activeYear.id,montant:amountValue,devise:currency.value as "USD"|"FC",observation:observation.value.trim()||null};
      const result=editingId
        ? await db.from("dimes").update(payload).eq("id",editingId).eq("annee_pastorale_id",activeYear.id)
        : await db.from("dimes").insert({...payload,created_by:context.user.id});
      if(result.error)throw result.error;
      showFeedback(editingId?"La contribution a été modifiée.":"La contribution a été enregistrée.");
      resetForm();await loadDimes();
    }catch(error){showFeedback(error instanceof Error?error.message:"Enregistrement impossible.","error");}
    finally{submit.disabled=false;submit.textContent=editingId?"Enregistrer les modifications":"Enregistrer la dîme";}
  });
  await loadDimes();
}
