import type { ActivePastoralYear, UserContext } from "../../auth/auth-service";
import { getSupabaseClient } from "../../lib/supabase";

type Community = {id:string;nom:string;quartier_id:string};
type Quartier = {id:string;nom:string};
type AgeBand = {label:string;count:number};

const esc=(value:unknown)=>{
  const map:Record<string,string>={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
  return String(value??"").replace(/[&<>"']/g,(c)=>map[c]??c);
};
function renderBars(node:HTMLElement,items:{label:string;value:number}[]):void{
  const max=Math.max(1,...items.map((x)=>x.value));
  node.innerHTML=items.length?items.map((item)=>{
    const width=Math.max(0,Math.min(100,Math.round(item.value/max*100)));
    return `<div class="space-y-1.5"><div class="flex justify-between gap-3 text-xs"><span class="truncate text-slate-700">${esc(item.label)}</span><span class="text-slate-500">${item.value.toLocaleString("fr-CD")}</span></div><div class="h-2 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-[var(--enoria-green)]" style="width:${width}%"></div></div></div>`;
  }).join(""):'<p class="text-sm text-slate-400">Aucune donnée accessible.</p>';
}
function updateHash(params:URLSearchParams):void{
  const query=params.toString();
  const hash=`#/statistiques${query?`?${query}`:""}`;
  window.history.replaceState(null,"",`${window.location.pathname}${window.location.search}${hash}`);
}
function csvCell(value:unknown):string{
  const text=String(value??"");
  return `"${text.replace(/"/g,'""')}"`;
}

export async function mountStatistics(container:HTMLElement,context:UserContext,activeYear:ActivePastoralYear|null):Promise<void>{
  const yearSelect=container.querySelector<HTMLSelectElement>("#stats-year")!;
  const quartierSelect=container.querySelector<HTMLSelectElement>("#stats-quartier")!;
  const communitySelect=container.querySelector<HTMLSelectElement>("#stats-communaute")!;
  const feedback=container.querySelector<HTMLElement>("#statistics-feedback")!;
  const db=getSupabaseClient();
  const parishId=context.assignments[0].paroisse_id;
  let years:{id:string;libelle:string;date_debut:string;date_fin:string;active:boolean}[]=[];
  let communities:Community[]=[];
  let quartiers:Quartier[]=[];
  let exportRows:(string|number)[][]=[];
  let sequence=0;

  const [yearResult,communityResult,quartierResult]=await Promise.all([
    db.from("annees_pastorales").select("id,libelle,date_debut,date_fin,active").eq("paroisse_id",parishId).order("date_debut",{ascending:false}),
    db.from("communautes").select("id,nom,quartier_id").eq("paroisse_id",parishId).order("nom"),
    db.from("quartiers").select("id,nom").eq("paroisse_id",parishId).order("nom")
  ]);
  if(yearResult.error)throw yearResult.error;
  if(communityResult.error)throw communityResult.error;
  if(quartierResult.error)throw quartierResult.error;
  years=yearResult.data;
  communities=communityResult.data;
  quartiers=quartierResult.data;

  const params=new URLSearchParams(window.location.hash.split("?")[1]??"");
  const initialYear=params.get("annee")??activeYear?.id??years.find((x)=>x.active)?.id??"";
  yearSelect.innerHTML=years.map((item)=>`<option value="${esc(item.id)}">${esc(item.libelle)}${item.active?" · active":""}</option>`).join("")||'<option value="">Aucune année</option>';
  quartierSelect.innerHTML='<option value="">Tous les quartiers</option>'+quartiers.map((x)=>`<option value="${esc(x.id)}">${esc(x.nom)}</option>`).join("");
  yearSelect.value=initialYear;
  quartierSelect.value=params.get("quartier")??"";
  communitySelect.value=params.get("communaute")??"";

  function syncCommunityOptions():void{
    const selected=communitySelect.value;
    communitySelect.innerHTML='<option value="">Toutes les communautés</option>'+communities
      .filter((item)=>!quartierSelect.value||item.quartier_id===quartierSelect.value)
      .map((item)=>`<option value="${esc(item.id)}">${esc(item.nom)}</option>`).join("");
    communitySelect.value=selected;
    if(selected&&![...communitySelect.options].some((x)=>x.value===selected))communitySelect.value="";
  }
  syncCommunityOptions();

  async function load():Promise<void>{
    const current=++sequence;
    feedback.className="hidden";
    const year=years.find((item)=>item.id===yearSelect.value);
    if(!year){
      feedback.textContent="Aucune année pastorale disponible.";
      feedback.className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800";
      return;
    }
    const nextParams=new URLSearchParams({annee:year.id});
    if(quartierSelect.value)nextParams.set("quartier",quartierSelect.value);
    if(communitySelect.value)nextParams.set("communaute",communitySelect.value);
    updateHash(nextParams);

    let allowedCommunityIds=communitySelect.value
      ? [communitySelect.value]
      : quartierSelect.value
        ? communities.filter((x)=>x.quartier_id===quartierSelect.value).map((x)=>x.id)
        : communities.map((x)=>x.id);
    if(communitySelect.value&&quartierSelect.value){
      const selectedCommunity=communities.find((item)=>item.id===communitySelect.value);
      if(!selectedCommunity||selectedCommunity.quartier_id!==quartierSelect.value)allowedCommunityIds=[];
    }
    if(quartierSelect.value&&allowedCommunityIds.length===0){
      renderBars(container.querySelector<HTMLElement>("#stats-sacrament-chart")!,[]);
      renderBars(container.querySelector<HTMLElement>("#stats-age-chart")!,[]);
      renderBars(container.querySelector<HTMLElement>("#stats-community-chart")!,[]);
      container.querySelector("#stats-faithful")!.textContent="0";
      container.querySelector("#stats-sacraments")!.textContent="0";
      container.querySelector("#stats-ages-known")!.textContent="0";
      return;
    }

    try{
      const [faithfulStats,sacramentStats]=await Promise.all([
        db.from("stats_fideles_par_communaute").select("communaute_id,fideles_actifs,fideles_decedes").eq("paroisse_id",parishId),
        db.from("stats_sacrements_par_annee").select("type,total,communaute_historique_id").eq("paroisse_id",parishId).eq("annee_pastorale_id",year.id)
      ]);
      if(faithfulStats.error)throw faithfulStats.error;
      if(sacramentStats.error)throw sacramentStats.error;
      let fRows=faithfulStats.data??[];
      let sRows=sacramentStats.data??[];
      if(quartierSelect.value||communitySelect.value){
        fRows=fRows.filter((row)=>allowedCommunityIds.includes(row.communaute_id??""));
        sRows=sRows.filter((row)=>allowedCommunityIds.includes(row.communaute_historique_id??""));
      }
      const living=fRows.reduce((sum,row)=>sum+(row.fideles_actifs??0),0);
      container.querySelector("#stats-faithful")!.textContent=living.toLocaleString("fr-CD");
      const sacTotals=new Map<string,number>();
      for(const row of sRows)sacTotals.set(row.type??"autre",(sacTotals.get(row.type??"autre")??0)+(row.total??0));
      const typeLabels:Record<string,string>={bapteme:"Baptêmes",eucharistie:"Eucharisties",confirmation:"Confirmations"};
      const sacItems=[...sacTotals].map(([type,value])=>({label:typeLabels[type]??type,value}));
      const sacTotal=sacItems.reduce((sum,item)=>sum+item.value,0);
      container.querySelector("#stats-sacraments")!.textContent=sacTotal.toLocaleString("fr-CD");
      renderBars(container.querySelector<HTMLElement>("#stats-sacrament-chart")!,sacItems);

      const communityNames=new Map(communities.map((x)=>[x.id,x.nom]));
      const communityItems=fRows.map((row)=>({label:communityNames.get(row.communaute_id??"")??"Communauté",value:row.fideles_actifs??0}));
      renderBars(container.querySelector<HTMLElement>("#stats-community-chart")!,communityItems);

      const ageCounts=[0,0,0,0,0,0,0];
      const reference=new Date(year.date_fin);
      const referenceYear=reference.getFullYear();
      let ageKnown=0;
      let offset=0;
      const batch=500;
      while(true){
        let query=db.from("fideles").select("naissance_jour,naissance_mois,naissance_annee,naissance_precision,communaute_id")
          .eq("paroisse_id",parishId).eq("statut","vivant").range(offset,offset+batch-1);
        if(quartierSelect.value||communitySelect.value)query=query.in("communaute_id",allowedCommunityIds);
        const result=await query;
        if(result.error)throw result.error;
        const batchRows=result.data??[];
        for(const person of batchRows){
          if(person.naissance_precision==="inconnue"||!person.naissance_annee)continue;
          let age=referenceYear-person.naissance_annee;
          if(person.naissance_precision==="exacte"&&person.naissance_mois&&person.naissance_jour){
            const birthAfterReference=person.naissance_mois>reference.getMonth()+1||
              (person.naissance_mois===reference.getMonth()+1&&person.naissance_jour>reference.getDate());
            if(birthAfterReference)age--;
          }
          if(age<0)continue;
          ageKnown++;
          const index=age<=5?0:age<=12?1:age<=17?2:age<=25?3:age<=40?4:age<=60?5:6;
          ageCounts[index]++;
        }
        if(batchRows.length<batch)break;
        offset+=batch;
      }
      const ageLabels=["0–5 ans","6–12 ans","13–17 ans","18–25 ans","26–40 ans","41–60 ans","61 ans et +"];
      const ageItems:AgeBand[]=ageLabels.map((label,index)=>({label,count:ageCounts[index]}));
      container.querySelector("#stats-ages-known")!.textContent=ageKnown.toLocaleString("fr-CD");
      renderBars(container.querySelector<HTMLElement>("#stats-age-chart")!,ageItems.map((x)=>({label:x.label,value:x.count})));

      exportRows=[
        ["Indicateur","Valeur"],
        ["Année pastorale",year.libelle],
        ["Fidèles vivants",living],
        ["Sacrements",sacTotal],
        ["Naissances avec année connue",ageKnown],
        ...sacItems.map((x)=>[`Sacrements — ${x.label}`,x.value]),
        ...ageItems.map((x)=>[`Âge — ${x.label}`,x.count]),
        ...communityItems.map((x)=>[`Communauté — ${x.label}`,x.value])
      ];
    }catch(error){
      if(current!==sequence)return;
      feedback.textContent=error instanceof Error?error.message:"Impossible de calculer les statistiques.";
      feedback.className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700";
    }
  }

  yearSelect.addEventListener("change",()=>void load());
  quartierSelect.addEventListener("change",()=>{communitySelect.value="";syncCommunityOptions();void load();});
  communitySelect.addEventListener("change",()=>void load());
  container.querySelector<HTMLButtonElement>("#stats-export")!.addEventListener("click",()=>{
    if(!exportRows.length)return;
    const csv=exportRows.map((row)=>row.map(csvCell).join(";")).join("\r\n");
    const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download=`enoria-statistiques-${yearSelect.selectedOptions[0]?.textContent??"pastorales"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  });
  await load();
}
