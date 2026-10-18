import type { ActivePastoralYear, UserContext } from "../../auth/auth-service";
import type { Tables } from "../../types/database.types";
import { getSupabaseClient } from "../../lib/supabase";

type DimeRow = Pick<Tables<"dimes">,
  "id" | "fidele_id" | "annee_pastorale_id" | "montant" | "devise" |
  "observation" | "created_at" | "date_paiement" | "communaute_paiement_id"
>;
type YearRow = Pick<Tables<"annees_pastorales">,"id"|"libelle"|"date_debut"|"date_fin"|"active">;
type PersonRow = Pick<Tables<"fideles">,"id"|"prenom"|"nom">;
type CommunityRow = Pick<Tables<"communautes">,"id"|"nom"|"quartier_id">;
type QuarterRow = Pick<Tables<"quartiers">,"id"|"nom">;
type DimeSeries = { label:string; values:(number|null)[]; color:string };

const PALETTE=["#177A55","#327BC2","#D18B32","#8066AE","#C25C64","#369DA0","#73833E","#8A6A54"];

function escapeHtml(value:unknown):string{
  const map:Record<string,string>={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
  return String(value??"").replace(/[&<>"']/g,(character)=>map[character]??character);
}
function safeCount(value:number):string{
  return value>0&&value<5?"Masqué (<5)":value.toLocaleString("fr-CD");
}
function money(value:number,currency:"USD"|"FC"):string{
  const formatted=value.toLocaleString("fr-CD",{minimumFractionDigits:0,maximumFractionDigits:2});
  return currency==="USD"?formatted+" $":formatted+" FC";
}
function dateForInput(date:Date):string{
  return String(date.getFullYear())+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
}
function formatDate(dateValue:string|null,withTime=false):string{
  if(!dateValue)return "Date inconnue";
  const date=new Date(dateValue);
  if(Number.isNaN(date.getTime()))return "Date invalide";
  return new Intl.DateTimeFormat("fr-CD",withTime
    ?{dateStyle:"medium",timeStyle:"short",timeZone:"Africa/Kinshasa"}
    :{dateStyle:"medium",timeZone:"Africa/Kinshasa"}).format(date);
}
function dateMonthKey(dateValue:string):string{
  return dateValue.slice(0,7);
}
function monthLabel(year:number,month:number):string{
  return new Intl.DateTimeFormat("fr-CD",{month:"short",timeZone:"UTC"})
    .format(new Date(Date.UTC(year,month-1,1))).replace(".","");
}
function monthsForYear(year:YearRow):{key:string;label:string}[]{
  const startParts=year.date_debut.split("-").map(Number);
  const endParts=year.date_fin.split("-").map(Number);
  let y=startParts[0],m=startParts[1];
  const endIndex=endParts[0]*12+endParts[1]-1;
  const months:{key:string;label:string}[]=[];
  while(y*12+m-1<=endIndex&&months.length<24){
    months.push({key:String(y)+"-"+String(m).padStart(2,"0"),label:monthLabel(y,m)});
    m++;
    if(m>12){m=1;y++;}
  }
  return months;
}
function tally(rows:DimeRow[],currency:"USD"|"FC"):number{
  return rows.filter((row)=>row.devise===currency).reduce((sum,row)=>sum+Number(row.montant),0);
}
function maskContributors(values:number[]):Set<number>{
  const hidden=new Set<number>();
  values.forEach((value,index)=>{if(value>0&&value<5)hidden.add(index);});
  if(hidden.size===1){
    const secondary=values.map((value,index)=>({value,index}))
      .filter((item)=>!hidden.has(item.index)&&item.value>0)
      .sort((a,b)=>a.value-b.value)[0];
    if(secondary)hidden.add(secondary.index);
  }
  return hidden;
}
function renderLineChart(node:HTMLElement,labels:string[],series:DimeSeries[],emptyMessage:string):void{
  const width=740,height=270,left=46,right=18,top=18,bottom=40;
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const plotted=series.flatMap((item)=>item.values.filter((value):value is number=>value!==null));
  if(!plotted.length||plotted.every((value)=>value===0)){
    node.innerHTML='<div class="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-5 text-center"><p class="text-sm font-medium text-slate-600">Pas encore de courbe exploitable</p><p class="mt-2 max-w-xl text-xs leading-5 text-slate-400">'+escapeHtml(emptyMessage)+'</p></div>';
    return;
  }
  const max=Math.max(1,...plotted);
  const x=(index:number)=>left+(labels.length<=1?plotWidth/2:index*plotWidth/(labels.length-1));
  const y=(value:number)=>top+plotHeight-(value/max)*plotHeight;
  const grid=[0,0.25,0.5,0.75,1].map((ratio)=>{
    const yy=top+plotHeight-ratio*plotHeight;
    return '<line x1="'+left+'" y1="'+yy+'" x2="'+(width-right)+'" y2="'+yy+'" stroke="#E8EDF2" stroke-width="1"/><text x="'+(left-8)+'" y="'+(yy+4)+'" text-anchor="end" fill="#94A3B8" font-size="10">'+Math.round(max*ratio).toLocaleString("fr-CD")+'</text>';
  }).join("");
  const lines=series.map((item,index)=>{
    const segments:string[]=[];
    let segment:string[]=[];
    item.values.forEach((value,position)=>{
      if(value===null){
        if(segment.length){segments.push(segment.join(" "));segment=[];}
      }else{
        segment.push(x(position)+","+y(value));
      }
    });
    if(segment.length)segments.push(segment.join(" "));
    const polylines=segments.map((points)=>'<polyline points="'+points+'" fill="none" stroke="'+item.color+'" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>').join("");
    const dots=item.values.map((value,position)=>value===null?"":'<circle cx="'+x(position)+'" cy="'+y(value)+'" r="3.3" fill="'+item.color+'"/>').join("");
    return polylines+dots;
  }).join("");
  const xLabels=labels.map((label,index)=>'<text x="'+x(index)+'" y="'+(height-12)+'" text-anchor="middle" fill="#64748B" font-size="10">'+escapeHtml(label)+'</text>').join("");
  const legend=series.map((item)=>'<span class="inline-flex items-center gap-1.5 text-xs text-slate-500"><i class="inline-block h-2 w-2 rounded-full" style="background:'+item.color+'"></i>'+escapeHtml(item.label)+'</span>').join("");
  node.innerHTML='<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Courbes mensuelles par quartier" class="w-full overflow-visible">'+grid+lines+xLabels+'</svg><div class="mt-3 flex flex-wrap gap-x-4 gap-y-2">'+legend+'</div><p class="mt-2 text-xs leading-5 text-slate-400">Les points masqués correspondent aux groupes de moins de cinq contributeurs. Les ruptures de ligne sont volontaires.</p>';
}
function renderBars(node:HTMLElement,items:{label:string;value:number;payers:number}[],currency:"USD"|"FC"):void{
  const hidden=maskContributors(items.map((item)=>item.payers));
  const visibleMax=Math.max(1,...items.filter((_,index)=>!hidden.has(index)).map((item)=>item.value));
  if(!items.length){
    node.innerHTML='<p class="text-sm text-slate-400">Aucune donnée disponible.</p>';
    return;
  }
  node.innerHTML=items.slice().sort((a,b)=>b.value-a.value).map((item)=>{
    const index=items.indexOf(item);
    const masked=hidden.has(index);
    const width=masked?0:Math.max(0,Math.min(100,item.value/visibleMax*100));
    const label=masked?"Masqué (<5)":money(item.value,currency);
    return '<div class="space-y-1.5"><div class="flex items-center justify-between gap-3 text-xs"><span class="min-w-0 truncate text-slate-700">'+escapeHtml(item.label)+'</span><span class="shrink-0 text-slate-500">'+label+'</span></div><div class="h-2 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-[var(--enoria-green)]" style="width:'+width+'%"></div></div></div>';
  }).join("");
}
function metric(label:string,value:string,detail:string):string{
  return '<div class="rounded-xl bg-slate-50 p-3"><p class="text-xs text-slate-500">'+escapeHtml(label)+'</p><p class="mt-1 text-lg font-semibold text-slate-900">'+escapeHtml(value)+'</p><p class="mt-1 text-xs text-slate-400">'+escapeHtml(detail)+'</p></div>';
}
function aggregateRows(rows:DimeRow[],communityMap:Map<string,CommunityRow>,quarterMap:Map<string,QuarterRow>,currency:"USD"|"FC"): {label:string;value:number;payers:number}[]{
  const grouped=new Map<string,{label:string;value:number;payers:Set<string>}>();
  for(const row of rows.filter((item)=>item.devise===currency)){
    const community=row.communaute_paiement_id?communityMap.get(row.communaute_paiement_id):undefined;
    const quarter=community?quarterMap.get(community.quartier_id):undefined;
    const key=quarter?.id??"__unknown__";
    const label=quarter?.nom??"Territoire à vérifier";
    const item=grouped.get(key)??{label,value:0,payers:new Set<string>()};
    item.value+=Number(row.montant);
    item.payers.add(row.fidele_id);
    grouped.set(key,item);
  }
  return [...grouped.values()].map((item)=>({label:item.label,value:item.value,payers:item.payers.size}));
}
function downloadCsv(rows:unknown[][],filename:string):void{
  const cell=(value:unknown)=>'"'+String(value??"").replace(/"/g,'""')+'"';
  const content="\uFEFF"+rows.map((row)=>row.map(cell).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url;
  link.download=filename;
  link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}

export async function mountDimesPage(container:HTMLElement,context:UserContext,activeYear:ActivePastoralYear|null):Promise<void>{
  if(!context.roles.some((role)=>role==="secretaire"||role==="cure")){
    container.innerHTML='<section class="page-card p-6 text-sm text-slate-600">Ce module de suivi financier est réservé à la secrétaire et au curé.</section>';
    return;
  }
  const db=getSupabaseClient();
  const parishId=context.assignments[0].paroisse_id;
  const yearSelect=container.querySelector<HTMLSelectElement>("#dimes-year-select")!;
  const currencySelect=container.querySelector<HTMLSelectElement>("#dimes-currency-select")!;
  const feedback=container.querySelector<HTMLElement>("#dimes-feedback")!;
  const recentRowsNode=container.querySelector<HTMLElement>("#dimes-recent-rows")!;
  const recentCountNode=container.querySelector<HTMLElement>("#dimes-recent-count")!;
  const exportButton=container.querySelector<HTMLButtonElement>("#dimes-export")!;
  let exportRows:unknown[][]=[];
  let loadingSequence=0;

  const [yearsResult,communitiesResult,quartersResult]=await Promise.all([
    db.from("annees_pastorales").select("id,libelle,date_debut,date_fin,active").eq("paroisse_id",parishId).order("date_debut",{ascending:false}),
    db.from("communautes").select("id,nom,quartier_id").eq("paroisse_id",parishId).order("nom"),
    db.from("quartiers").select("id,nom").eq("paroisse_id",parishId).order("nom")
  ]);
  if(yearsResult.error)throw yearsResult.error;
  if(communitiesResult.error)throw communitiesResult.error;
  if(quartersResult.error)throw quartersResult.error;
  const years:YearRow[]=yearsResult.data??[];
  const communities:CommunityRow[]=communitiesResult.data??[];
  const quarters:QuarterRow[]=quartersResult.data??[];
  const communityMap=new Map(communities.map((item)=>[item.id,item]));
  const quarterMap=new Map(quarters.map((item)=>[item.id,item]));
  const yearMap=new Map(years.map((item)=>[item.id,item.libelle]));
  yearSelect.innerHTML=years.map((item)=>'<option value="'+escapeHtml(item.id)+'">'+escapeHtml(item.libelle)+(item.active?" · active":"")+'</option>').join("")||'<option value="">Aucune année pastorale</option>';
  yearSelect.value=years.some((item)=>item.id===activeYear?.id)?activeYear!.id:years.find((item)=>item.active)?.id??years[0]?.id??"";

  async function fetchYearDimes(yearId:string):Promise<DimeRow[]>{
    const resultRows:DimeRow[]=[];
    let offset=0;
    while(true){
      const {data,error}=await db.from("dimes")
        .select("id,fidele_id,annee_pastorale_id,montant,devise,observation,created_at,date_paiement,communaute_paiement_id")
        .eq("annee_pastorale_id",yearId).order("created_at",{ascending:false})
        .range(offset,offset+499);
      if(error)throw error;
      const batch=data??[];
      resultRows.push(...batch);
      if(batch.length<500)break;
      offset+=500;
    }
    return resultRows;
  }
  async function fetchLatestDimes():Promise<DimeRow[]>{
    if(!years.length)return [];
    const {data,error}=await db.from("dimes")
      .select("id,fidele_id,annee_pastorale_id,montant,devise,observation,created_at,date_paiement,communaute_paiement_id")
      .in("annee_pastorale_id",years.map((item)=>item.id))
      .order("created_at",{ascending:false}).limit(15);
    if(error)throw error;
    return data??[];
  }
  async function fetchPeople(ids:string[]):Promise<Map<string,PersonRow>>{
    const result=new Map<string,PersonRow>();
    for(let offset=0;offset<ids.length;offset+=500){
      const {data,error}=await db.from("fideles").select("id,prenom,nom").in("id",ids.slice(offset,offset+500));
      if(error)throw error;
      for(const item of data??[])result.set(item.id,item);
    }
    return result;
  }

  function renderRecent(rows:DimeRow[],people:Map<string,PersonRow>):void{
    if(!rows.length){
      recentRowsNode.innerHTML='<tr><td colspan="6" class="px-3 py-10 text-center text-sm text-slate-400">Aucun paiement enregistré.</td></tr>';
      recentCountNode.textContent="0 paiement";
      return;
    }
    const sorted=rows.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,15);
    recentRowsNode.innerHTML=sorted.map((row)=>{
      const person=people.get(row.fidele_id);
      const community=row.communaute_paiement_id?communityMap.get(row.communaute_paiement_id):undefined;
      const quarter=community?quarterMap.get(community.quartier_id):undefined;
      const territory=quarter
        ?escapeHtml(quarter.nom)+" / "+escapeHtml(community?.nom??"")
        :'<span class="text-amber-700">Territoire à vérifier</span>';
      const paidDate=row.date_paiement
        ?'<span>'+escapeHtml(formatDate(row.date_paiement))+'</span>'
        :'<span class="text-amber-700">Date inconnue</span><span class="mt-1 block text-[11px] text-slate-400">Saisie le '+escapeHtml(formatDate(row.created_at,true))+'</span>';
      return '<tr class="border-b border-slate-100 last:border-0"><td class="px-3 py-3 font-medium text-slate-800">'+escapeHtml(person?person.prenom+" "+person.nom:"Fidèle non visible")+'</td><td class="px-3 py-3">'+territory+'</td><td class="px-3 py-3 text-right font-medium tabular-nums text-slate-800">'+escapeHtml(money(Number(row.montant),row.devise))+'</td><td class="px-3 py-3">'+escapeHtml(row.devise)+'</td><td class="px-3 py-3 text-xs">'+paidDate+'</td><td class="px-3 py-3 text-xs text-slate-500">'+escapeHtml(yearMap.get(row.annee_pastorale_id)??"Année inconnue")+'</td></tr>';
    }).join("");
    recentCountNode.textContent=String(sorted.length)+" paiement(s)";
  }

  function render():void{
    const sequence=++loadingSequence;
    void load(sequence);
  }
  async function load(sequence:number):Promise<void>{
    feedback.className="hidden";
    recentRowsNode.innerHTML='<tr><td colspan="6" class="px-3 py-10 text-center text-sm text-slate-400">Chargement…</td></tr>';
    const selectedYear=years.find((item)=>item.id===yearSelect.value);
    if(!selectedYear){
      feedback.textContent="Configure au moins une année pastorale avant de consulter les indicateurs.";
      feedback.className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800";
      recentRowsNode.innerHTML='<tr><td colspan="6" class="px-3 py-10 text-center text-sm text-slate-400">Aucune année pastorale disponible.</td></tr>';
      return;
    }
    const currency=currencySelect.value==="FC"?"FC":"USD";
    const [yearDimes,latestDimes]=await Promise.all([
      fetchYearDimes(selectedYear.id),
      fetchLatestDimes()
    ]);
    if(sequence!==loadingSequence)return;
    const ids=[...new Set([...yearDimes,...latestDimes].map((item)=>item.fidele_id))];
    const people=await fetchPeople(ids);
    if(sequence!==loadingSequence)return;
    renderRecent(latestDimes,people);

    const totalUsd=tally(yearDimes,"USD"),totalFc=tally(yearDimes,"FC");
    const distinctPayers=new Set(yearDimes.map((item)=>item.fidele_id)).size;
    const usdPayers=new Set(yearDimes.filter((item)=>item.devise==="USD").map((item)=>item.fidele_id)).size;
    const fcPayers=new Set(yearDimes.filter((item)=>item.devise==="FC").map((item)=>item.fidele_id)).size;
    const undated=yearDimes.filter((item)=>!item.date_paiement).length;
    const dated=yearDimes.filter((item)=>!!item.date_paiement).length;
    container.querySelector<HTMLElement>("#dimes-total-usd")!.textContent=usdPayers>0&&usdPayers<5?"Masqué (<5)":money(totalUsd,"USD");
    container.querySelector<HTMLElement>("#dimes-total-fc")!.textContent=fcPayers>0&&fcPayers<5?"Masqué (<5)":money(totalFc,"FC");
    container.querySelector<HTMLElement>("#dimes-contributions")!.textContent=safeCount(yearDimes.length);
    container.querySelector<HTMLElement>("#dimes-payers")!.textContent=safeCount(distinctPayers);
    container.querySelector<HTMLElement>("#dimes-undated")!.textContent=safeCount(undated);

    const months=monthsForYear(selectedYear);
    const monthIndex=new Map(months.map((item,index)=>[item.key,index]));
    const inPeriodRows:DimeRow[]=[];
    let outsideDateRange=0;
    for(const row of yearDimes){
      if(!row.date_paiement)continue;
      if(row.date_paiement<selectedYear.date_debut||row.date_paiement>selectedYear.date_fin){
        outsideDateRange++;
        continue;
      }
      if(monthIndex.has(dateMonthKey(row.date_paiement)))inPeriodRows.push(row);
    }
    const wardKeys=[...quarters.map((item)=>item.id)];
    if(yearDimes.some((row)=>!row.communaute_paiement_id||!communityMap.has(row.communaute_paiement_id)))wardKeys.push("__unknown__");
    const wardLabel=(key:string)=>key==="__unknown__"?"Territoire à vérifier":quarterMap.get(key)?.nom??"Quartier inconnu";
    const getWardKey=(row:DimeRow):string=>{
      if(!row.communaute_paiement_id)return "__unknown__";
      const community=communityMap.get(row.communaute_paiement_id);
      return community?community.quartier_id:"__unknown__";
    };

    const amountGrid=wardKeys.map((key)=>({key,label:wardLabel(key),values:Array(months.length).fill(0) as number[],payers:Array.from({length:months.length},()=>new Set<string>())}));
    const payerGrid=wardKeys.map((key)=>({key,label:wardLabel(key),values:Array(months.length).fill(0) as number[],payers:Array.from({length:months.length},()=>new Set<string>())}));
    const amountByWard=new Map(amountGrid.map((item)=>[item.key,item]));
    const payerByWard=new Map(payerGrid.map((item)=>[item.key,item]));
    const monthlyTotals=Array(months.length).fill(0) as number[];
    const monthlyPayers=Array.from({length:months.length},()=>new Set<string>());
    const monthlyCurrencyPayers=Array.from({length:months.length},()=>new Set<string>());
    for(const row of inPeriodRows){
      const month=monthIndex.get(dateMonthKey(row.date_paiement!));
      if(month===undefined)continue;
      monthlyPayers[month].add(row.fidele_id);
      if(row.devise===currency){
        monthlyTotals[month]+=Number(row.montant);
        monthlyCurrencyPayers[month].add(row.fidele_id);
      }
      const key=getWardKey(row);
      const amountGroup=amountByWard.get(key);
      const payerGroup=payerByWard.get(key);
      if(amountGroup&&row.devise===currency){
        amountGroup.values[month]+=Number(row.montant);
        amountGroup.payers[month].add(row.fidele_id);
      }
      if(payerGroup){
        payerGroup.payers[month].add(row.fidele_id);
        payerGroup.values[month]=payerGroup.payers[month].size;
      }
    }
    const currencyLabel=currency==="USD"?"USD":"FC";
    container.querySelector<HTMLElement>("#dimes-monthly-subtitle")!.textContent="Montants mensuels en "+currencyLabel+" · date réelle du versement";
    const monthLabels=months.map((item)=>item.label);
    const makeMaskedSeries=(grid:typeof amountGrid):DimeSeries[]=>{
      const hiddenByMonth=months.map((_,month)=>{
        const values=grid.map((item)=>item.payers[month].size);
        return maskContributors(values);
      });
      return grid.map((item,index)=>({
        label:item.label,
        color:PALETTE[index%PALETTE.length],
        values:item.values.map((value,month)=>hiddenByMonth[month].has(index)?null:value)
      })).filter((item,index)=>grid[index].payers.some((payers)=>payers.size>0));
    };
    const amountSeries=makeMaskedSeries(amountGrid);
    const payerSeries=makeMaskedSeries(payerGrid);
    renderLineChart(
      container.querySelector<HTMLElement>("#dimes-monthly-chart")!,
      monthLabels,amountSeries,
      "Les anciennes dîmes n'ont pas de date effective vérifiée. Renseigne la date dans la fiche du fidèle pour que le versement apparaisse dans le mois concerné."
    );
    renderLineChart(
      container.querySelector<HTMLElement>("#dimes-payers-chart")!,
      monthLabels,payerSeries,
      "Aucun versement avec date effective exploitable pour cette période. Les paiements non datés sont conservés dans les totaux annuels, mais exclus de ce graphique."
    );

    const comparison=aggregateRows(yearDimes,communityMap,quarterMap,currency);
    // Include neighborhoods with no payment so comparisons stay structurally consistent.
    for(const quarter of quarters){
      if(!comparison.some((item)=>item.label===quarter.nom))comparison.push({label:quarter.nom,value:0,payers:0});
    }
    renderBars(container.querySelector<HTMLElement>("#dimes-quarter-chart")!,comparison,currency);
    container.querySelector<HTMLElement>("#dimes-comparison-unit")!.textContent="Devise : "+currencyLabel;
    container.querySelector<HTMLElement>("#dimes-data-note")!.textContent=
      undated.toLocaleString("fr-CD")+" contribution(s) sur "+yearDimes.length+" ne possèdent pas de date effective vérifiée. Les totaux annuels les incluent, mais pas les courbes mensuelles. "+
      dated.toLocaleString("fr-CD")+" versement(s) sont datés. "+
      (outsideDateRange?outsideDateRange.toLocaleString("fr-CD")+" date(s) sortent des limites de l'année pastorale choisie et sont exclues des courbes. ":"")+
      "La comparaison par quartier utilise la communauté enregistrée au moment du versement ; les anciens versements sans instantané territorial restent dans « Territoire à vérifier ». Les montants USD et FC ne sont jamais additionnés entre eux.";

    const maskedTotalByCurrency=(currencyValue:"USD"|"FC")=>{
      const contributors=new Set(yearDimes.filter((row)=>row.devise===currencyValue).map((row)=>row.fidele_id)).size;
      return contributors>0&&contributors<5?"Masqué (<5)":money(tally(yearDimes,currencyValue),currencyValue);
    };
    const exportComparison=aggregateRows(yearDimes,communityMap,quarterMap,currency);
    const hiddenComparison=maskContributors(exportComparison.map((item)=>item.payers));
    exportRows=[
      ["Rapport","Synthèse des dîmes"],
      ["Année pastorale",selectedYear.libelle],
      ["Devise analysée",currency],
      ["Total USD",maskedTotalByCurrency("USD")],
      ["Total FC",maskedTotalByCurrency("FC")],
      ["Contributions enregistrées",safeCount(yearDimes.length)],
      ["Contributeurs distincts",safeCount(distinctPayers)],
      ["Contributions sans date effective",safeCount(undated)],
      ["Versements datés hors année pastorale",safeCount(outsideDateRange)],
      [],
      ["Collecte par quartier","Montant "+currency,"Contributeurs"],
      ...exportComparison.map((item,index)=>[
        item.label,
        hiddenComparison.has(index)?"Masqué (<5)":money(item.value,currency),
        hiddenComparison.has(index)?"Masqué (<5)":item.payers
      ]),
      [],
      ["Évolution mensuelle","Mois","Montant "+currency,"Contributeurs avec date"],
      ...months.map((month,index)=>[
        month.label,
        month.key,
        monthlyCurrencyPayers[index].size>0&&monthlyCurrencyPayers[index].size<5?"Masqué (<5)":money(monthlyTotals[index],currency),
        monthlyCurrencyPayers[index].size>0&&monthlyCurrencyPayers[index].size<5?"Masqué (<5)":monthlyCurrencyPayers[index].size
      ]),
      [],
      ["Méthode","Les courbes mensuelles n'utilisent que date_paiement, jamais created_at."],
      ["Confidentialité","Les groupes de 1 à 4 contributeurs sont masqués dans les comparaisons."]
    ];
    // Rebuild monthly export safely by masking each month and one complementary month if needed.
    const monthlyHidden=maskContributors(monthlyCurrencyPayers.map((set)=>set.size));
    for(let index=0;index<months.length;index++){
      const rowIndex=exportRows.findIndex((row)=>row[0]==="Évolution mensuelle") + 1 + index;
      if(rowIndex>0&&rowIndex<exportRows.length&&monthlyHidden.has(index)){
        exportRows[rowIndex][2]="Masqué (<5)";
        exportRows[rowIndex][3]="Masqué (<5)";
      }
    }
  }

  yearSelect.addEventListener("change",render);
  currencySelect.addEventListener("change",render);
  exportButton.addEventListener("click",()=>{
    if(!exportRows.length)return;
    const selected=years.find((item)=>item.id===yearSelect.value);
    downloadCsv(exportRows,"enoria-dimes-statistiques-"+(selected?.libelle??"parish")+".csv");
  });
  if(!years.length){
    feedback.textContent="Aucune année pastorale n'est configurée pour cette paroisse.";
    feedback.className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800";
    recentRowsNode.innerHTML='<tr><td colspan="6" class="px-3 py-10 text-center text-sm text-slate-400">Aucune année disponible.</td></tr>';
    return;
  }
  render();
}
