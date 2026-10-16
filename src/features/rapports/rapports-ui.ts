import type { ActivePastoralYear, UserContext } from "../../auth/auth-service";
import type { Tables } from "../../types/database.types";
import { getSupabaseClient } from "../../lib/supabase";

type FideleRow=Pick<Tables<"fideles">,"id"|"prenom"|"nom"|"sexe"|"statut"|"naissance_jour"|"naissance_mois"|"naissance_annee"|"naissance_precision"|"communaute_id">;
type CommunityRow=Pick<Tables<"communautes">,"id"|"nom"|"quartier_id">;
type QuartierRow=Pick<Tables<"quartiers">,"id"|"nom">;

function csv(value:unknown):string{return `"${String(value??"").replace(/"/g,'""')}"`;}
function partialDate(day:number|null,month:number|null,year:number|null,precision:string):string{
  if(precision==="inconnue")return "Date inconnue";
  if(precision==="annee")return year?String(year):"Année non renseignée";
  if(precision==="mois")return month&&year?new Intl.DateTimeFormat("fr-CD",{month:"long",year:"numeric"}).format(new Date(year,month-1,1)):"Mois/année incomplets";
  if(!day||!month||!year)return "Date incomplète";
  return new Intl.DateTimeFormat("fr-CD",{dateStyle:"medium"}).format(new Date(year,month-1,day));
}
function download(rows:unknown[][],name:string):void{
  const content="\uFEFF"+rows.map((row)=>row.map(csv).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url;
  link.download=name;
  link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function fetchNames(ids:string[]):Promise<Map<string,string>>{
  const names=new Map<string,string>();
  const db=getSupabaseClient();
  for(let i=0;i<ids.length;i+=500){
    const chunk=ids.slice(i,i+500);
    const {data,error}=await db.from("fideles").select("id,prenom,nom").in("id",chunk);
    if(error)throw error;
    for(const row of data)names.set(row.id,`${row.prenom} ${row.nom}`);
  }
  return names;
}
async function fetchCommunities():Promise<{communities:CommunityRow[];quartiers:QuartierRow[]}>{
  const db=getSupabaseClient();
  const [c,q]=await Promise.all([
    db.from("communautes").select("id,nom,quartier_id").order("nom"),
    db.from("quartiers").select("id,nom").order("nom")
  ]);
  if(c.error)throw c.error;
  if(q.error)throw q.error;
  return {communities:c.data,quartiers:q.data};
}
async function exportFideles():Promise<void>{
  const db=getSupabaseClient();
  const rows:FideleRow[]=[];
  let offset=0;
  while(true){
    const {data,error}=await db.from("fideles")
      .select("id,prenom,nom,sexe,statut,naissance_jour,naissance_mois,naissance_annee,naissance_precision,communaute_id")
      .order("nom").range(offset,offset+499);
    if(error)throw error;
    rows.push(...data);
    if(data.length<500)break;
    offset+=500;
  }
  const {communities,quartiers}=await fetchCommunities();
  const communityMap=new Map(communities.map((x)=>[x.id,x]));
  const quartierMap=new Map(quartiers.map((x)=>[x.id,x.nom]));
  const output:unknown[][]=[["Prénom","Nom","Sexe","Naissance","Précision date","Statut","Quartier","Communauté"]];
  for(const row of rows){
    const community=communityMap.get(row.communaute_id);
    output.push([
      row.prenom,row.nom,row.sexe,
      partialDate(row.naissance_jour,row.naissance_mois,row.naissance_annee,row.naissance_precision),
      row.naissance_precision,row.statut,
      community?quartierMap.get(community.quartier_id)??"": "",
      community?.nom??""
    ]);
  }
  download(output,"enoria-registre-fideles.csv");
}
async function exportSacrements(yearId:string):Promise<void>{
  const db=getSupabaseClient();
  const rows:Tables<"sacrements">[]=[];
  let offset=0;
  while(true){
    const {data,error}=await db.from("sacrements").select("*").eq("annee_pastorale_id",yearId).order("annee").range(offset,offset+499);
    if(error)throw error;
    rows.push(...data);
    if(data.length<500)break;
    offset+=500;
  }
  const names=await fetchNames([...new Set(rows.map((x)=>x.fidele_id))]);
  const {communities}=await fetchCommunities();
  const communityMap=new Map(communities.map((x)=>[x.id,x.nom]));
  const output:unknown[][]=[["Fidèle","Sacrement","Date","Précision","Lieu","N° acte","Page","Référence requise","Ministre","Communauté historique"]];
  for(const row of rows)output.push([
    names.get(row.fidele_id)??"Fidèle non visible",row.type,
    partialDate(row.jour,row.mois,row.annee,row.precision),row.precision,row.lieu??"",
    row.numero_acte??"",row.page_registre??"",row.reference_registre_requise?"Oui":"Non",
    row.ministre??"",communityMap.get(row.communaute_historique_id)??""
  ]);
  download(output,`enoria-sacrements-${yearId}.csv`);
}
async function exportMariages(yearId:string):Promise<void>{
  const db=getSupabaseClient();
  const rows:Tables<"evenements_matrimoniaux">[]=[];
  let offset=0;
  while(true){
    const {data,error}=await db.from("evenements_matrimoniaux").select("*").eq("annee_pastorale_id",yearId).order("annee").range(offset,offset+499);
    if(error)throw error;
    rows.push(...data);
    if(data.length<500)break;
    offset+=500;
  }
  const names=await fetchNames([...new Set(rows.map((x)=>x.fidele_id))]);
  const {communities}=await fetchCommunities();
  const communityMap=new Map(communities.map((x)=>[x.id,x.nom]));
  const output:unknown[][]=[["Fidèle","Type d'événement","Conjoint","Date","Précision","Lieu","N° acte","Page","Ministre","Communauté historique"]];
  for(const row of rows)output.push([
    names.get(row.fidele_id)??"Fidèle non visible",row.type,row.conjoint_nom??"",
    partialDate(row.jour,row.mois,row.annee,row.precision),row.precision,row.lieu??"",
    row.numero_acte??"",row.page_registre??"",row.ministre??"",
    communityMap.get(row.communaute_historique_id)??""
  ]);
  download(output,`enoria-evenements-matrimoniaux-${yearId}.csv`);
}
async function exportDimes(yearId:string):Promise<void>{
  const db=getSupabaseClient();
  const rows:Tables<"dimes">[]=[];
  let offset=0;
  while(true){
    const {data,error}=await db.from("dimes").select("*").eq("annee_pastorale_id",yearId).order("created_at").range(offset,offset+499);
    if(error)throw error;
    rows.push(...data);
    if(data.length<500)break;
    offset+=500;
  }
  const names=await fetchNames([...new Set(rows.map((x)=>x.fidele_id))]);
  const output:unknown[][]=[["Fidèle","Montant","Devise","Observation","Enregistrée le"]];
  for(const row of rows)output.push([
    names.get(row.fidele_id)??"Fidèle non visible",row.montant,row.devise,row.observation??"",row.created_at
  ]);
  download(output,`enoria-dimes-${yearId}.csv`);
}

export async function mountReports(container:HTMLElement,context:UserContext,activeYear:ActivePastoralYear|null):Promise<void>{
  if(!context.roles.some((role)=>role==="secretaire"||role==="cure")){
    container.innerHTML='<section class="page-card p-6 text-sm text-slate-600">Les rapports sont réservés à la secrétaire et au curé.</section>';
    return;
  }
  const feedback=container.querySelector<HTMLElement>("#reports-feedback")!;
  const form=container.querySelector<HTMLFormElement>("#report-form")!;
  const type=container.querySelector<HTMLSelectElement>("#report-type")!;
  const year=container.querySelector<HTMLSelectElement>("#report-year")!;
  const db=getSupabaseClient();
  const {data:years,error}=await db.from("annees_pastorales").select("id,libelle,active").eq("paroisse_id",context.assignments[0].paroisse_id).order("libelle",{ascending:false});
  if(error)throw error;
  year.innerHTML=(years??[]).map((item)=>`<option value="${item.id}">${item.libelle}</option>`).join("")||'<option value="">Aucune année</option>';
  year.value=years?.some((item)=>item.id===activeYear?.id)?activeYear!.id:years?.find((item)=>item.active)?.id??years?.[0]?.id??"";
  type.addEventListener("change",()=>{year.disabled=type.value==="fideles";});
  year.disabled=type.value==="fideles";
  form.addEventListener("submit",async(event)=>{
    event.preventDefault();
    feedback.className="hidden";
    if(type.value!=="fideles"&&!year.value){
      feedback.textContent="Sélectionne une année pastorale.";
      feedback.className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800";
      return;
    }
    if(!window.confirm("Ce fichier peut contenir des données personnelles et religieuses. Confirmer l'export sur ce PC protégé ?"))return;
    const button=container.querySelector<HTMLButtonElement>("#report-export")!;
    button.disabled=true;
    button.textContent="Préparation…";
    try{
      if(type.value==="fideles")await exportFideles();
      else if(type.value==="sacrements")await exportSacrements(year.value);
      else if(type.value==="mariages")await exportMariages(year.value);
      else if(type.value==="dimes")await exportDimes(year.value);
      feedback.textContent="Export terminé. Le fichier CSV a été généré par le navigateur.";
      feedback.className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800";
    }catch(error){
      feedback.textContent=error instanceof Error?error.message:"L'export a échoué.";
      feedback.className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700";
    }finally{
      button.disabled=false;
      button.textContent="Générer le fichier CSV";
    }
  });
}
