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


type AnnualFaithfulRow = Pick<Tables<"fideles">,"id"|"prenom"|"nom"|"sexe"|"naissance_jour"|"naissance_mois"|"naissance_annee"|"naissance_precision">;
type AnnualEvent = {kind:"Baptêmes"|"Premières communions"|"Confirmations"|"Mariages";fideleId:string;day:number|null;month:number|null;year:number|null;precision:string};
const AGE_BANDS:{label:string;test:(age:number)=>boolean}[]=[
  {label:"Moins de 1 an",test:(age)=>age<1},
  {label:"1–5 ans",test:(age)=>age>=1&&age<=5},
  {label:"6–12 ans",test:(age)=>age>=6&&age<=12},
  {label:"13–17 ans",test:(age)=>age>=13&&age<=17},
  {label:"18–25 ans",test:(age)=>age>=18&&age<=25},
  {label:"26–40 ans",test:(age)=>age>=26&&age<=40},
  {label:"41 ans et plus",test:(age)=>age>=41}
];
function maskSmallCounts(values:number[]):(number|string)[]{
  const masked=new Set<number>();
  values.forEach((value,index)=>{if(value>0&&value<5)masked.add(index);});
  if(masked.size===1){
    const secondary=values.map((value,index)=>({value,index}))
      .filter((item)=>!masked.has(item.index)&&item.value>0)
      .sort((a,b)=>a.value-b.value)[0];
    if(secondary)masked.add(secondary.index);
  }
  return values.map((value,index)=>masked.has(index)?"Masqué (<5)":value);
}
async function fetchAnnualFaithfulRows(ids:string[]):Promise<Map<string,AnnualFaithfulRow>>{
  const db=getSupabaseClient();
  const people=new Map<string,AnnualFaithfulRow>();
  for(let index=0;index<ids.length;index+=500){
    const chunk=ids.slice(index,index+500);
    const {data,error}=await db.from("fideles")
      .select("id,prenom,nom,sexe,naissance_jour,naissance_mois,naissance_annee,naissance_precision")
      .in("id",chunk);
    if(error)throw error;
    for(const person of data??[])people.set(person.id,person);
  }
  return people;
}
function ageAtExactCelebration(person:AnnualFaithfulRow|undefined,event:AnnualEvent):number|null{
  if(!person||person.naissance_precision!=="exacte"||event.precision!=="exacte")return null;
  const birth=[person.naissance_jour,person.naissance_mois,person.naissance_annee];
  const celebration=[event.day,event.month,event.year];
  if(birth.some((part)=>part===null)||celebration.some((part)=>part===null))return null;
  const [birthDay,birthMonth,birthYear]=birth as number[];
  const [eventDay,eventMonth,eventYear]=celebration as number[];
  const birthDate=new Date(birthYear,birthMonth-1,birthDay);
  const eventDate=new Date(eventYear,eventMonth-1,eventDay);
  if(birthDate.getFullYear()!==birthYear||birthDate.getMonth()!==birthMonth-1||birthDate.getDate()!==birthDay)return null;
  if(eventDate.getFullYear()!==eventYear||eventDate.getMonth()!==eventMonth-1||eventDate.getDate()!==eventDay||eventDate<birthDate)return null;
  let age=eventYear-birthYear;
  if(eventMonth<birthMonth||(eventMonth===birthMonth&&eventDay<birthDay))age--;
  return age>=0?age:null;
}
async function fetchByCalendarYear(parishId:string,calendarYear:number,type:"bapteme"|"eucharistie"|"confirmation"):Promise<Tables<"sacrements">[]>{
  const db=getSupabaseClient();
  const rows:Tables<"sacrements">[]=[];
  let offset=0;
  while(true){
    const {data,error}=await db.from("sacrements").select("*")
      .eq("paroisse_id",parishId).eq("annee",calendarYear).eq("type",type)
      .order("mois").order("jour").range(offset,offset+499);
    if(error)throw error;
    rows.push(...(data??[]));
    if((data??[]).length<500)break;
    offset+=500;
  }
  return rows;
}
async function fetchMarriagesByCalendarYear(parishId:string,calendarYear:number):Promise<Tables<"evenements_matrimoniaux">[]>{
  const db=getSupabaseClient();
  const rows:Tables<"evenements_matrimoniaux">[]=[];
  let offset=0;
  while(true){
    const {data,error}=await db.from("evenements_matrimoniaux").select("*")
      .eq("paroisse_id",parishId).eq("annee",calendarYear).eq("type","novas_nuptias")
      .order("mois").order("jour").range(offset,offset+499);
    if(error)throw error;
    rows.push(...(data??[]));
    if((data??[]).length<500)break;
    offset+=500;
  }
  return rows;
}
async function exportAnnualBishopReport(parishId:string,calendarYear:number):Promise<void>{
  const db=getSupabaseClient();
  const [baptisms,eucharists,confirmations,marriages,parishResult]=await Promise.all([
    fetchByCalendarYear(parishId,calendarYear,"bapteme"),
    fetchByCalendarYear(parishId,calendarYear,"eucharistie"),
    fetchByCalendarYear(parishId,calendarYear,"confirmation"),
    fetchMarriagesByCalendarYear(parishId,calendarYear),
    db.from("paroisses").select("nom").eq("id",parishId).maybeSingle()
  ]);
  if(parishResult.error)throw parishResult.error;
  const events:AnnualEvent[]=[
    ...baptisms.map((row)=>({kind:"Baptêmes" as const,fideleId:row.fidele_id,day:row.jour,month:row.mois,year:row.annee,precision:row.precision})),
    ...eucharists.map((row)=>({kind:"Premières communions" as const,fideleId:row.fidele_id,day:row.jour,month:row.mois,year:row.annee,precision:row.precision})),
    ...confirmations.map((row)=>({kind:"Confirmations" as const,fideleId:row.fidele_id,day:row.jour,month:row.mois,year:row.annee,precision:row.precision})),
    ...marriages.map((row)=>({kind:"Mariages" as const,fideleId:row.fidele_id,day:row.jour,month:row.mois,year:row.annee,precision:row.precision}))
  ];
  const people=await fetchAnnualFaithfulRows([...new Set(events.map((event)=>event.fideleId))]);
  const kinds:AnnualEvent["kind"][]=["Baptêmes","Premières communions","Confirmations","Mariages"];
  const eventsByKind=new Map(kinds.map((kind)=>[kind,events.filter((event)=>event.kind===kind)]));
  const safeTypeCounts=maskSmallCounts(kinds.map((kind)=>eventsByKind.get(kind)!.length));
  const output:unknown[][]=[
    ["ENORIA — RAPPORT ANNUEL PAROISSIAL"],
    ["Paroisse",parishResult.data?.nom??"Paroisse"],
    ["Année civile",calendarYear],
    ["Périmètre","Actes accessibles au compte connecté ; mariages = novas nuptias uniquement"],
    [],
    ["CÉLÉBRATIONS","NOMBRE D'ACTES"],
    ...kinds.map((kind,index)=>[kind,safeTypeCounts[index]]),
    [],
    ["RÉPARTITION PAR SEXE","MASCULIN","FÉMININ","NON ATTRIBUÉ"]
  ];
  for(const kind of kinds){
    const group=eventsByKind.get(kind)!;
    const genderValues=[
      group.filter((event)=>people.get(event.fideleId)?.sexe==="masculin").length,
      group.filter((event)=>people.get(event.fideleId)?.sexe==="feminin").length,
      group.filter((event)=>!people.has(event.fideleId)).length
    ];
    output.push([kind,...maskSmallCounts(genderValues)]);
  }
  output.push([],["RÉPARTITION PAR ÂGE À LA CÉLÉBRATION","MOINS DE 1 AN","1–5 ANS","6–12 ANS","13–17 ANS","18–25 ANS","26–40 ANS","41 ANS ET PLUS","ÂGE NON CALCULABLE"]);
  for(const kind of kinds){
    const group=eventsByKind.get(kind)!;
    const bandCounts=Array.from({length:AGE_BANDS.length+1},()=>0);
    for(const event of group){
      const age=ageAtExactCelebration(people.get(event.fideleId),event);
      const index=age===null?AGE_BANDS.length:AGE_BANDS.findIndex((band)=>band.test(age));
      bandCounts[index<0?AGE_BANDS.length:index]++;
    }
    output.push([kind,...maskSmallCounts(bandCounts)]);
  }
  output.push(
    [],
    ["MÉTHODE"],
    ["Les âges sont calculés uniquement lorsque la naissance et la célébration possèdent toutes deux une date exacte et cohérente."],
    ["Les effectifs positifs inférieurs à 5 sont masqués ; une cellule complémentaire est également masquée lorsqu'une soustraction permettrait de retrouver le petit effectif."],
    ["Ce rapport ne contient aucune liste nominative."]
  );
  download(output,"enoria-rapport-annuel-eveche-"+calendarYear+".csv");
}
async function exportBaptismRegister(parishId:string,calendarYear:number):Promise<void>{
  const db=getSupabaseClient();
  const records:Tables<"sacrements">[]=[];
  let offset=0;
  while(true){
    const {data,error}=await db.from("sacrements").select("*")
      .eq("paroisse_id",parishId).eq("type","bapteme").eq("annee",calendarYear)
      .order("annee").order("mois").order("jour").range(offset,offset+499);
    if(error)throw error;
    records.push(...(data??[]));
    if((data??[]).length<500)break;
    offset+=500;
  }
  const people=await fetchAnnualFaithfulRows([...new Set(records.map((row)=>row.fidele_id))]);
  records.sort((a,b)=>{
    const dateA=(a.annee??0)*10000+(a.mois??0)*100+(a.jour??0);
    const dateB=(b.annee??0)*10000+(b.mois??0)*100+(b.jour??0);
    if(dateA!==dateB)return dateA-dateB;
    const personA=people.get(a.fidele_id);
    const personB=people.get(b.fidele_id);
    return ((personA?.nom??"")+" "+(personA?.prenom??"")).localeCompare((personB?.nom??"")+" "+(personB?.prenom??""),"fr");
  });
  const output:unknown[][]=[["N°","Fidèle","Sexe","Date de naissance","Date du baptême","Précision","Lieu","Ministre","Parrain","Marraine","N° d'acte","Page du registre"]];
  records.forEach((record,index)=>{
    const person=people.get(record.fidele_id);
    output.push([
      index+1,
      person?person.prenom+" "+person.nom:"Fiche non accessible",
      person?.sexe??"",
      person?partialDate(person.naissance_jour,person.naissance_mois,person.naissance_annee,person.naissance_precision):"",
      partialDate(record.jour,record.mois,record.annee,record.precision),
      record.precision,
      record.lieu??"",
      record.ministre??"",
      record.parrain??"",
      record.marraine??"",
      record.numero_acte??"",
      record.page_registre??""
    ]);
  });
  if(records.length===0)output.push(["Aucun baptême enregistré pour cette année."]);
  download(output,"enoria-registre-baptemes-"+calendarYear+".csv");
}



type ReportFaithful = Pick<Tables<"fideles">,"id"|"prenom"|"nom"|"sexe"|"statut"|"naissance_jour"|"naissance_mois"|"naissance_annee"|"naissance_precision"|"communaute_id">;
type ReportSacrament = Pick<Tables<"sacrements">,"fidele_id"|"type"|"annee_pastorale_id"|"jour"|"mois"|"annee"|"precision"|"communaute_historique_id"|"reference_registre_requise"|"numero_acte"|"page_registre">;
type ReportMarriage = Pick<Tables<"evenements_matrimoniaux">,"fidele_id"|"type"|"annee_pastorale_id"|"jour"|"mois"|"annee"|"precision"|"communaute_historique_id"|"numero_acte"|"page_registre">;
type ReportDime = Pick<Tables<"dimes">,"fidele_id"|"annee_pastorale_id"|"montant"|"devise">;
type ReportSignature = Pick<Tables<"signatures">,"fidele_id"|"annee_pastorale_id"|"signee">;
type ReportCertificate = Pick<Tables<"certificats">,"statut"|"date_demande"|"date_validation"|"date_emission"|"annee_pastorale_id">;
type ReportCommunity = Pick<Tables<"communautes">,"id"|"nom"|"quartier_id">;
type ReportQuartier = Pick<Tables<"quartiers">,"id"|"nom">;
type ReportPastoralYear = Pick<Tables<"annees_pastorales">,"id"|"libelle"|"date_debut"|"date_fin"|"active">;

function reportEsc(value:unknown):string{
  const map:Record<string,string>={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
  return String(value??"").replace(/[&<>"']/g,(char)=>map[char]??char);
}
async function fetchReportPages<T>(load:(from:number,to:number)=>Promise<{data:T[]|null;error:unknown}>):Promise<T[]>{
  const rows:T[]=[];
  let offset=0;
  while(true){
    const result=await load(offset,offset+499);
    if(result.error)throw result.error;
    const page=result.data??[];
    rows.push(...page);
    if(page.length<500)break;
    offset+=500;
  }
  return rows;
}
function reportMask(values:number[]):(number|string)[]{
  const hidden=new Set<number>();
  values.forEach((value,index)=>{if(value>0&&value<5)hidden.add(index);});
  if(hidden.size===1){
    const secondary=values.map((value,index)=>({value,index}))
      .filter((item)=>!hidden.has(item.index)&&item.value>0)
      .sort((a,b)=>a.value-b.value)[0];
    if(secondary)hidden.add(secondary.index);
  }
  return values.map((value,index)=>hidden.has(index)?"Masqué (<5)":value);
}
function reportNumber(value:number):string{
  return value>0&&value<5?"Masqué (<5)":value.toLocaleString("fr-CD");
}
function reportBarList(node:HTMLElement,items:{label:string;value:number;detail?:string;masked?:boolean}[]):void{
  const safe=reportMask(items.map((item)=>item.value));
  const visible=items.map((item,index)=>({item,value:item.masked?"Masqué (<5)":safe[index]}));
  const max=Math.max(1,...visible.filter((x)=>typeof x.value==="number").map((x)=>x.item.value));
  node.innerHTML=items.length?visible.map(({item,value})=>{
    const masked=typeof value==="string";
    const width=masked?0:Math.max(0,Math.min(100,item.value/max*100));
    return '<div class="space-y-1.5"><div class="flex items-center justify-between gap-3 text-xs"><span class="min-w-0 truncate text-slate-700">'+reportEsc(item.label)+'</span><span class="shrink-0 text-slate-500">'+(masked?value:item.value.toLocaleString("fr-CD"))+(item.detail?' · '+reportEsc(item.detail):'')+'</span></div><div class="h-2 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-[var(--enoria-green)]" style="width:'+width+'%"></div></div></div>';
  }).join(""):'<p class="text-sm text-slate-400">Aucune donnée disponible.</p>';
}
function reportLineChart(node:HTMLElement,labels:string[],series:{name:string;values:number[]}[]):void{
  const width=720,height=250,left=42,right=16,top=18,bottom=38;
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const maskedSeries=series.map((item)=>{
    const hidden=new Set<number>();
    item.values.forEach((value,index)=>{if(value>0&&value<5)hidden.add(index);});
    if(hidden.size===1){
      const secondary=item.values.map((value,index)=>({value,index}))
        .filter((point)=>!hidden.has(point.index)&&point.value>0)
        .sort((a,b)=>a.value-b.value)[0];
      if(secondary)hidden.add(secondary.index);
    }
    return item.values.map((value,index)=>hidden.has(index)?0:value);
  });
  const visible=maskedSeries.flatMap((values)=>values.filter((value)=>value>=5));
  const max=Math.max(5,...visible);
  const x=(index:number)=>left+(labels.length<=1?plotWidth/2:index*plotWidth/(labels.length-1));
  const y=(value:number)=>top+plotHeight-(value/max)*plotHeight;
  const colors=["#187A55","#367BC4","#D28B36","#8B6AB0"];
  const grid=[0,0.25,0.5,0.75,1].map((ratio)=>{
    const yy=top+plotHeight-ratio*plotHeight;
    return '<line x1="'+left+'" y1="'+yy+'" x2="'+(width-right)+'" y2="'+yy+'" stroke="#E8EDF2" stroke-width="1"/><text x="'+(left-8)+'" y="'+(yy+4)+'" text-anchor="end" fill="#94A3B8" font-size="10">'+Math.round(max*ratio)+'</text>';
  }).join("");
  const seriesSvg=maskedSeries.map((values,index)=>{
    const points=values.map((value,position)=>({value,position})).filter((point)=>point.value>=5);
    const segments:string[]=[];
    let current:string[]=[];
    let previous=-2;
    for(const point of points){
      if(point.position!==previous+1&&current.length){segments.push(current.join(" "));current=[];}
      current.push(x(point.position)+","+y(point.value));
      previous=point.position;
    }
    if(current.length)segments.push(current.join(" "));
    const lines=segments.map((segment)=>'<polyline points="'+segment+'" fill="none" stroke="'+colors[index%colors.length]+'" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>').join("");
    const dots=points.map((point)=>'<circle cx="'+x(point.position)+'" cy="'+y(point.value)+'" r="3.5" fill="'+colors[index%colors.length]+'"/>').join("");
    return lines+dots;
  }).join("");
  const xLabels=labels.map((label,index)=>'<text x="'+x(index)+'" y="'+(height-12)+'" text-anchor="middle" fill="#64748B" font-size="10">'+reportEsc(label)+'</text>').join("");
  const legend=series.map((item,index)=>'<span class="inline-flex items-center gap-1.5 text-xs text-slate-500"><i class="inline-block h-2 w-2 rounded-full" style="background:'+colors[index%colors.length]+'"></i>'+reportEsc(item.name)+'</span>').join("");
  const hasPoints=maskedSeries.some((values)=>values.some((value)=>value>=5));
  node.innerHTML='<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Graphique linéaire" class="w-full overflow-visible">'+grid+seriesSvg+xLabels+'</svg><div class="mt-3 flex flex-wrap gap-x-4 gap-y-2">'+legend+'</div>'+(hasPoints?'':'<p class="mt-2 text-xs text-slate-400">Aucun point affichable : les valeurs sont nulles ou masquées car inférieures à cinq.</p>');
}
function reportMetricCard(label:string,value:string,sub:string):string{
  return '<div class="rounded-xl bg-slate-50 p-3"><p class="text-xs text-slate-500">'+reportEsc(label)+'</p><p class="mt-1 text-xl font-semibold text-slate-900">'+reportEsc(value)+'</p><p class="mt-1 text-xs text-slate-400">'+reportEsc(sub)+'</p></div>';
}
function reportAgeAtEnd(person:ReportFaithful,reference:Date):number|null{
  if(!person.naissance_annee||person.naissance_precision==="inconnue")return null;
  let age=reference.getFullYear()-person.naissance_annee;
  if(person.naissance_precision==="exacte"&&person.naissance_mois&&person.naissance_jour){
    if(person.naissance_mois>reference.getMonth()+1||(person.naissance_mois===reference.getMonth()+1&&person.naissance_jour>reference.getDate()))age--;
  }else if(person.naissance_precision==="mois"&&person.naissance_mois&&person.naissance_mois>reference.getMonth()+1){
    age--;
  }
  return age>=0?age:null;
}
function reportMonthLabel(month:number):string{
  return new Intl.DateTimeFormat("fr-CD",{month:"short"}).format(new Date(2020,month-1,1)).replace(".","");
}
function reportCsvDownload(rows:unknown[][],filename:string):void{
  const content="\uFEFF"+rows.map((row)=>row.map(csv).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url;
  link.download=filename;
  link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}

async function mountPastoralAnalytics(container:HTMLElement,context:UserContext,activeYear:ActivePastoralYear|null):Promise<void>{
  const db=getSupabaseClient();
  const parishId=context.assignments[0].paroisse_id;
  const isClergyOrSecretary=context.roles.some((role)=>role==="cure"||role==="secretaire");
  const assignedCommunity=context.assignments.find((item)=>item.active&&item.communaute_id)?.communaute_id??null;
  const yearSelect=container.querySelector<HTMLSelectElement>("#analytics-year")!;
  const quartierSelect=container.querySelector<HTMLSelectElement>("#analytics-quartier")!;
  const communitySelect=container.querySelector<HTMLSelectElement>("#analytics-community")!;
  const feedback=container.querySelector<HTMLElement>("#reports-feedback")!;
  const refresh=container.querySelector<HTMLButtonElement>("#analytics-refresh")!;
  let exportRows:unknown[][]=[];
  const [years,communities,quartiers,faithful,sacraments,marriages]=await Promise.all([
    fetchReportPages<ReportPastoralYear>(async (from,to)=>db.from("annees_pastorales").select("id,libelle,date_debut,date_fin,active").eq("paroisse_id",parishId).order("date_debut",{ascending:false}).range(from,to)),
    fetchReportPages<ReportCommunity>(async (from,to)=>db.from("communautes").select("id,nom,quartier_id").eq("paroisse_id",parishId).order("nom").range(from,to)),
    fetchReportPages<ReportQuartier>(async (from,to)=>db.from("quartiers").select("id,nom").eq("paroisse_id",parishId).order("nom").range(from,to)),
    fetchReportPages<ReportFaithful>(async (from,to)=>db.from("fideles").select("id,prenom,nom,sexe,statut,naissance_jour,naissance_mois,naissance_annee,naissance_precision,communaute_id").eq("paroisse_id",parishId).range(from,to)),
    fetchReportPages<ReportSacrament>(async (from,to)=>db.from("sacrements").select("fidele_id,type,annee_pastorale_id,jour,mois,annee,precision,communaute_historique_id,reference_registre_requise,numero_acte,page_registre").eq("paroisse_id",parishId).range(from,to)),
    fetchReportPages<ReportMarriage>(async (from,to)=>db.from("evenements_matrimoniaux").select("fidele_id,type,annee_pastorale_id,jour,mois,annee,precision,communaute_historique_id,numero_acte,page_registre").eq("paroisse_id",parishId).range(from,to))
  ]);
  const visibleCommunities=isClergyOrSecretary?communities:communities.filter((item)=>item.id===assignedCommunity);
    const visibleFaithful=faithful.filter((person)=>isClergyOrSecretary||person.communaute_id===assignedCommunity);
  const visibleSacraments=sacraments.filter((item)=>isClergyOrSecretary||item.communaute_historique_id===assignedCommunity);
  const visibleMarriages=marriages.filter((item)=>isClergyOrSecretary||item.communaute_historique_id===assignedCommunity);
  const [dimes,signatures,certificates]=isClergyOrSecretary?await Promise.all([
    fetchReportPages<ReportDime>(async (from,to)=>db.from("dimes").select("fidele_id,annee_pastorale_id,montant,devise").range(from,to)),
    fetchReportPages<ReportSignature>(async (from,to)=>db.from("signatures").select("fidele_id,annee_pastorale_id,signee").range(from,to)),
    fetchReportPages<ReportCertificate>(async (from,to)=>db.from("certificats").select("statut,date_demande,date_validation,date_emission,annee_pastorale_id").range(from,to))
  ]):[[],[],[]] as [ReportDime[],ReportSignature[],ReportCertificate[]];

  const yearOptions=years.map((year)=>'<option value="'+reportEsc(year.id)+'">'+reportEsc(year.libelle)+(year.active?' · active':'')+'</option>').join("");
  yearSelect.innerHTML=yearOptions||'<option value="">Aucune année pastorale</option>';
  yearSelect.value=years.some((year)=>year.id===activeYear?.id)?activeYear!.id:years.find((year)=>year.active)?.id??years[0]?.id??"";
  quartierSelect.innerHTML='<option value="">Tous les quartiers</option>'+quartiers.map((item)=>'<option value="'+reportEsc(item.id)+'">'+reportEsc(item.nom)+'</option>').join("");
  communitySelect.innerHTML='<option value="">Toutes les communautés</option>'+visibleCommunities.map((item)=>'<option value="'+reportEsc(item.id)+'">'+reportEsc(item.nom)+'</option>').join("");
  if(!isClergyOrSecretary){
    container.querySelector<HTMLElement>("#analytics-quartier-wrap")!.classList.add("hidden");
    container.querySelector<HTMLElement>("#analytics-community-wrap")!.classList.add("hidden");
    communitySelect.value=assignedCommunity??"";
    communitySelect.disabled=true;
  }
  if(!isClergyOrSecretary){
    container.querySelector<HTMLElement>("#analytics-dime-status")!.textContent="Accès agrégé réservé au curé et à la secrétaire";
    container.querySelector<HTMLElement>("#analytics-dime-summary")!.innerHTML=reportMetricCard("Accès","Restreint","Données financières protégées");
    container.querySelector<HTMLElement>("#analytics-chart-dimes")!.innerHTML="";
    container.querySelector<HTMLElement>("#analytics-dime-note")!.textContent="Les responsables ne consultent pas les données financières détaillées.";
    container.querySelector<HTMLElement>("#analytics-pascal")!.innerHTML=reportMetricCard("Accès","Restreint","Données administratives protégées");
    container.querySelector<HTMLElement>("#analytics-certificates")!.innerHTML=reportMetricCard("Accès","Restreint","Données administratives protégées");
  }

  const communityMap=new Map(communities.map((item)=>[item.id,item]));
  const quartierMap=new Map(quartiers.map((item)=>[item.id,item.nom]));
  const faithfulMap=new Map(visibleFaithful.map((item)=>[item.id,item]));
  const cohortMap=new Map<string,{baptized:Set<string>;eucharist:Set<string>;confirmation:Set<string>}>();
  for(const row of visibleSacraments){
    if(!row.annee)return;
    const person=faithfulMap.get(row.fidele_id);
    if(!person||person.statut!=="vivant")continue;
    if(row.type==="bapteme"){
      const cohort=cohortMap.get(String(row.annee))??{baptized:new Set<string>(),eucharist:new Set<string>(),confirmation:new Set<string>()};
      cohort.baptized.add(row.fidele_id);cohortMap.set(String(row.annee),cohort);
    }
  }
  const firstBaptismYear=new Map<string,number>();
  const firstEucharistYear=new Map<string,number>();
  const firstConfirmationYear=new Map<string,number>();
  for(const row of visibleSacraments){
    if(!row.annee)continue;
    const target=row.type==="bapteme"?firstBaptismYear:row.type==="eucharistie"?firstEucharistYear:row.type==="confirmation"?firstConfirmationYear:null;
    if(target&&(!target.has(row.fidele_id)||row.annee<target.get(row.fidele_id)!))target.set(row.fidele_id,row.annee);
  }
  for(const [id,baptismYear] of firstBaptismYear){
    const cohort=cohortMap.get(String(baptismYear))??{baptized:new Set<string>(),eucharist:new Set<string>(),confirmation:new Set<string>()};
    cohort.baptized.add(id);
    const eucharistYear=firstEucharistYear.get(id);
    const confirmationYear=firstConfirmationYear.get(id);
    if(eucharistYear&&eucharistYear>=baptismYear)cohort.eucharist.add(id);
    if(confirmationYear&&confirmationYear>=baptismYear)cohort.confirmation.add(id);
    cohortMap.set(String(baptismYear),cohort);
  }

  function render():void{
    feedback.className="hidden";
    const year=years.find((item)=>item.id===yearSelect.value);
    if(!year){
      feedback.textContent="Aucune année pastorale disponible pour calculer les rapports.";
      feedback.className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800";
      return;
    }
    const selectedCommunity=communitySelect.value;
    const selectedQuartier=quartierSelect.value;
    const scopeCommunityIds=new Set(visibleCommunities.filter((item)=>
      (!selectedCommunity||item.id===selectedCommunity)&&(!selectedQuartier||item.quartier_id===selectedQuartier)
    ).map((item)=>item.id));
    const inScopeFaithful=visibleFaithful.filter((person)=>scopeCommunityIds.has(person.communaute_id));
    const living=inScopeFaithful.filter((person)=>person.statut==="vivant");
    const inScopeSacraments=visibleSacraments.filter((row)=>row.annee_pastorale_id===year.id&&scopeCommunityIds.has(row.communaute_historique_id));
    const inScopeMarriages=visibleMarriages.filter((row)=>row.annee_pastorale_id===year.id&&row.type==="novas_nuptias"&&scopeCommunityIds.has(row.communaute_historique_id));
    const countType=(type:string)=>inScopeSacraments.filter((row)=>row.type===type).length;
    const baptismCount=countType("bapteme");
    const eucharistCount=countType("eucharistie");
    const confirmationCount=countType("confirmation");
    const marriageCount=inScopeMarriages.length;
    container.querySelector<HTMLElement>("#analytics-kpi-faithful")!.textContent=reportNumber(living.length);
    container.querySelector<HTMLElement>("#analytics-kpi-baptism")!.textContent=reportNumber(baptismCount);
    container.querySelector<HTMLElement>("#analytics-kpi-eucharist")!.textContent=reportNumber(eucharistCount);
    container.querySelector<HTMLElement>("#analytics-kpi-confirmation")!.textContent=reportNumber(confirmationCount);
    container.querySelector<HTMLElement>("#analytics-kpi-marriage")!.textContent=reportNumber(marriageCount);

    const periodStart=new Date(year.date_debut+"T12:00:00");
    const periodEnd=new Date(year.date_fin+"T12:00:00");
    const monthBuckets:{year:number;month:number;label:string}[]=[];
    const monthCursor=new Date(periodStart.getFullYear(),periodStart.getMonth(),1);
    while(monthCursor<=periodEnd&&monthBuckets.length<24){
      monthBuckets.push({
        year:monthCursor.getFullYear(),
        month:monthCursor.getMonth()+1,
        label:new Intl.DateTimeFormat("fr-CD",{month:"short",year:"2-digit"}).format(monthCursor).replace(".","")
      });
      monthCursor.setMonth(monthCursor.getMonth()+1);
    }
    const monthLabels=monthBuckets.map((bucket)=>bucket.label);
    const monthSeries=[
      {name:"Baptêmes",values:Array(monthBuckets.length).fill(0) as number[]},
      {name:"Premières communions",values:Array(monthBuckets.length).fill(0) as number[]},
      {name:"Confirmations",values:Array(monthBuckets.length).fill(0) as number[]},
      {name:"Mariages",values:Array(monthBuckets.length).fill(0) as number[]}
    ];
    for(const row of inScopeSacraments){
      if(!row.annee||!row.mois)continue;
      const bucket=monthBuckets.findIndex((item)=>item.year===row.annee&&item.month===row.mois);
      if(bucket<0)continue;
      const index=row.type==="bapteme"?0:row.type==="eucharistie"?1:2;
      monthSeries[index].values[bucket]++;
    }
    for(const row of inScopeMarriages){
      if(!row.annee||!row.mois)continue;
      const bucket=monthBuckets.findIndex((item)=>item.year===row.annee&&item.month===row.mois);
      if(bucket>=0)monthSeries[3].values[bucket]++;
    }
    reportLineChart(container.querySelector<HTMLElement>("#analytics-chart-monthly")!,monthLabels,monthSeries);

    const baptizedIds=new Set(visibleSacraments.filter((row)=>row.type==="bapteme"&&faithfulMap.get(row.fidele_id)?.statut==="vivant").map((row)=>row.fidele_id));
    const eucharistIds=new Set(visibleSacraments.filter((row)=>row.type==="eucharistie"&&baptizedIds.has(row.fidele_id)).map((row)=>row.fidele_id));
    const confirmedIds=new Set(visibleSacraments.filter((row)=>row.type==="confirmation"&&baptizedIds.has(row.fidele_id)).map((row)=>row.fidele_id));
    const journey=[
      {label:"Baptisés vivants",value:[...baptizedIds].filter((id)=>scopeCommunityIds.has(faithfulMap.get(id)?.communaute_id??"")).length},
      {label:"Ont reçu la première communion",value:[...eucharistIds].filter((id)=>scopeCommunityIds.has(faithfulMap.get(id)?.communaute_id??"")).length},
      {label:"Ont reçu la confirmation",value:[...confirmedIds].filter((id)=>scopeCommunityIds.has(faithfulMap.get(id)?.communaute_id??"")).length}
    ];
    const baptizedScoped=journey[0].value;
    const notCommuned=Math.max(0,baptizedScoped-journey[1].value);
    const notConfirmed=Math.max(0,baptizedScoped-journey[2].value);
    const hideEucharistForComplement=notCommuned>0&&notCommuned<5;
    const hideConfirmationForComplement=notConfirmed>0&&notConfirmed<5;
    reportBarList(container.querySelector<HTMLElement>("#analytics-chart-funnel")!,[
      {label:journey[0].label,value:journey[0].value,masked:hideEucharistForComplement||hideConfirmationForComplement},
      {label:journey[1].label,value:journey[1].value,masked:hideEucharistForComplement},
      {label:journey[2].label,value:journey[2].value,masked:hideConfirmationForComplement},
      {label:"Baptisés sans première communion (indicatif)",value:notCommuned},
      {label:"Baptisés sans confirmation (indicatif)",value:notConfirmed}
    ]);

    const reference=new Date(year.date_fin+"T12:00:00");
    const bands=[{label:"0–5 ans",test:(age:number)=>age<=5},{label:"6–12 ans",test:(age:number)=>age>=6&&age<=12},{label:"13–17 ans",test:(age:number)=>age>=13&&age<=17},{label:"18–25 ans",test:(age:number)=>age>=18&&age<=25},{label:"26–40 ans",test:(age:number)=>age>=26&&age<=40},{label:"41–60 ans",test:(age:number)=>age>=41&&age<=60},{label:"61 ans et +",test:(age:number)=>age>=61}];
    const ageCounts=bands.map(()=>0);
    let ageKnown=0;
    for(const person of living){
      const age=reportAgeAtEnd(person,reference);
      if(age===null)continue;
      const index=bands.findIndex((band)=>band.test(age));
      if(index>=0){ageCounts[index]++;ageKnown++;}
    }
    reportBarList(container.querySelector<HTMLElement>("#analytics-chart-age")!,bands.map((band,index)=>({label:band.label,value:ageCounts[index]})));
    const nonCommunedIds=new Set([...baptizedIds].filter((id)=>!eucharistIds.has(id)));
    const nonConfirmedIds=new Set([...baptizedIds].filter((id)=>!confirmedIds.has(id)));
    const gapAgeSeries=[
      {name:"Sans première communion",values:bands.map((band)=>living.filter((person)=>{const age=reportAgeAtEnd(person,reference);return age!==null&&nonCommunedIds.has(person.id)&&band.test(age);}).length)},
      {name:"Sans confirmation",values:bands.map((band)=>living.filter((person)=>{const age=reportAgeAtEnd(person,reference);return age!==null&&nonConfirmedIds.has(person.id)&&band.test(age);}).length)}
    ];
    reportLineChart(container.querySelector<HTMLElement>("#analytics-chart-gap-age")!,bands.map((band)=>band.label),gapAgeSeries);
    const male=living.filter((person)=>person.sexe==="masculin").length;
    const female=living.filter((person)=>person.sexe==="feminin").length;
    const genderDisplay=reportMask([male,female]);
    container.querySelector<HTMLElement>("#analytics-gender-summary")!.innerHTML=
      reportMetricCard("Hommes",String(genderDisplay[0]),"Fidèles vivants")+
      reportMetricCard("Femmes",String(genderDisplay[1]),"Fidèles vivants");

    const territoryCounts=visibleCommunities.filter((item)=>scopeCommunityIds.has(item.id)).map((community)=>({
      label:community.nom,value:living.filter((person)=>person.communaute_id===community.id).length,
      detail:quartierMap.get(community.quartier_id)??""
    })).sort((a,b)=>b.value-a.value);
    reportBarList(container.querySelector<HTMLElement>("#analytics-chart-territory")!,territoryCounts);

    const cohorts=[...cohortMap.entries()].map(([label,group])=>({
      label, baptized:group.baptized.size,
      eucharist:[...group.eucharist].filter((id)=>scopeCommunityIds.has(faithfulMap.get(id)?.communaute_id??"")).length,
      confirmation:[...group.confirmation].filter((id)=>scopeCommunityIds.has(faithfulMap.get(id)?.communaute_id??"")).length
    })).filter((item)=>item.baptized>0).sort((a,b)=>Number(a.label)-Number(b.label)).slice(-10);
    reportLineChart(container.querySelector<HTMLElement>("#analytics-chart-cohort")!,cohorts.map((item)=>item.label),[
      {name:"Baptisés",values:cohorts.map((item)=>item.baptized)},
      {name:"Première communion",values:cohorts.map((item)=>item.eucharist)},
      {name:"Confirmation",values:cohorts.map((item)=>item.confirmation)}
    ]);

    if(isClergyOrSecretary){
      const inScopeDimes=dimes.filter((row)=>row.annee_pastorale_id===year.id&&scopeCommunityIds.has(faithfulMap.get(row.fidele_id)?.communaute_id??""));
      const usd=inScopeDimes.filter((row)=>row.devise==="USD").reduce((sum,row)=>sum+Number(row.montant),0);
      const fc=inScopeDimes.filter((row)=>row.devise==="FC").reduce((sum,row)=>sum+Number(row.montant),0);
      const payerCount=new Set(inScopeDimes.map((row)=>row.fidele_id)).size;
      const maskDimeAmounts=payerCount>0&&payerCount<5;
      container.querySelector<HTMLElement>("#analytics-dime-summary")!.innerHTML=
        reportMetricCard("Collecte USD",maskDimeAmounts?"Masqué (<5)":usd.toLocaleString("en-US",{maximumFractionDigits:2})+" $","Montant enregistré")+
        reportMetricCard("Collecte FC",maskDimeAmounts?"Masqué (<5)":fc.toLocaleString("fr-CD",{maximumFractionDigits:0})+" FC","Montant enregistré");
      container.querySelector<HTMLElement>("#analytics-dime-note")!.textContent=reportNumber(payerCount)+" contributeurs distincts dans la période. Le taux de participation fiable nécessitera un effectif de référence historisé.";
      const dimeYears=years.slice().reverse();
      const dimeSeries=["USD","FC"].map((currency)=>({name:currency,values:dimeYears.map((item)=>{
        const rows=dimes.filter((row)=>row.annee_pastorale_id===item.id&&row.devise===currency&&scopeCommunityIds.has(faithfulMap.get(row.fidele_id)?.communaute_id??""));
        return new Set(rows.map((row)=>row.fidele_id)).size<5?0:rows.reduce((sum,row)=>sum+Number(row.montant),0);
      })}));
      reportLineChart(container.querySelector<HTMLElement>("#analytics-chart-dimes")!,dimeYears.map((item)=>item.libelle),dimeSeries);
      container.querySelector<HTMLElement>("#analytics-dime-status")!.textContent="Disponible pour le curé et la secrétaire";
      const selectedSignatures=signatures.filter((row)=>row.annee_pastorale_id===year.id&&scopeCommunityIds.has(faithfulMap.get(row.fidele_id)?.communaute_id??""));
      const signed=selectedSignatures.filter((row)=>row.signee);
      container.querySelector<HTMLElement>("#analytics-pascal")!.innerHTML=selectedSignatures.length
        ?reportMetricCard("Visas enregistrés",reportNumber(signed.length),"Année pastorale sélectionnée")
        :'<div class="rounded-xl border border-amber-200 bg-amber-50 p-4"><p class="font-semibold text-amber-900">Données non disponibles</p><p class="mt-1 text-sm text-amber-800">Aucun visa pascal n’est actuellement enregistré. Enoria ne calcule donc pas de faux taux de participation.</p></div>';
      const selectedCertificates=certificates.filter((row)=>row.annee_pastorale_id===year.id);
      const emitted=selectedCertificates.filter((row)=>row.statut==="emis").length;
      const pending=selectedCertificates.filter((row)=>row.statut==="attente").length;
      const durations=selectedCertificates.filter((row)=>row.date_emission).map((row)=>Math.max(0,(new Date(row.date_emission!).getTime()-new Date(row.date_demande).getTime())/86400000));
      const average=durations.length?durations.reduce((sum,value)=>sum+value,0)/durations.length:null;
      container.querySelector<HTMLElement>("#analytics-certificates")!.innerHTML=
        reportMetricCard("Demandes",reportNumber(selectedCertificates.length),"Période sélectionnée")+
        reportMetricCard("Duplicatas émis",reportNumber(emitted),"Statut émis")+
        reportMetricCard("En attente",reportNumber(pending),"À traiter")+
        reportMetricCard("Délai moyen",average===null?"—":average.toFixed(1)+" j",durations.length+" dossiers avec date d’émission");
    }

    const duplicateKeys=new Map<string,number>();
    for(const person of inScopeFaithful){
      if(person.naissance_precision!=="exacte"||!person.naissance_jour||!person.naissance_mois||!person.naissance_annee)continue;
      const key=(person.prenom+" "+person.nom).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("fr").replace(/\s+/g," ").trim()+"|"+person.naissance_annee+"-"+person.naissance_mois+"-"+person.naissance_jour;
      duplicateKeys.set(key,(duplicateKeys.get(key)??0)+1);
    }
    const duplicateGroups=[...duplicateKeys.values()].filter((count)=>count>1).length;
    const missingBirth=living.filter((person)=>person.naissance_precision==="inconnue"||!person.naissance_annee).length;
    const approximateBirth=living.filter((person)=>person.naissance_precision==="annee"||person.naissance_precision==="mois").length;
    const missingCommunity=inScopeFaithful.filter((person)=>!person.communaute_id||!communityMap.has(person.communaute_id)).length;
    const missingReferences=inScopeSacraments.filter((row)=>row.reference_registre_requise&&(!row.numero_acte||!row.page_registre)).length;
    const approximateEvents=inScopeSacraments.filter((row)=>row.precision!=="exacte").length+inScopeMarriages.filter((row)=>row.precision!=="exacte").length;
    const suspiciousDefault=inScopeSacraments.filter((row)=>row.precision==="exacte"&&row.jour===1&&row.mois===1).length+inScopeMarriages.filter((row)=>row.precision==="exacte"&&row.jour===1&&row.mois===1).length;
    container.querySelector<HTMLElement>("#analytics-quality")!.innerHTML=[
      reportMetricCard("Naissances inconnues",reportNumber(missingBirth),"Fidèles vivants"),
      reportMetricCard("Naissances approximatives",reportNumber(approximateBirth),"Année ou mois seulement"),
      reportMetricCard("Références d’acte incomplètes",reportNumber(missingReferences),"N° d’acte ou page manquant"),
      reportMetricCard("Dates sacramentelles imprécises",reportNumber(approximateEvents),"Année, mois ou inconnue"),
      reportMetricCard("Dates au 01/01",reportNumber(suspiciousDefault),"À vérifier, pas automatiquement erronées"),
      reportMetricCard("Fiches sans communauté valide",reportNumber(missingCommunity),"Dans le périmètre"),
      reportMetricCard("Doublons potentiels",reportNumber(duplicateGroups),"Même identité et date de naissance exacte")
    ].join("");

    const now=new Date();
    function is25or50YearAnniversary(eventYear:number|null,eventMonth:number|null,eventDay:number|null,precision:string):boolean{
      if(precision!=="exacte"||!eventYear||!eventMonth||!eventDay)return false;
      let targetYear=now.getFullYear();
      const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
      const nextDate=new Date(targetYear,eventMonth-1,eventDay);
      if(nextDate<today){targetYear++;}
      const elapsed=targetYear-eventYear;
      return elapsed===25||elapsed===50;
    }
    const baptismJubilees=visibleSacraments.filter((row)=>row.type==="bapteme"&&is25or50YearAnniversary(row.annee,row.mois,row.jour,row.precision)&&scopeCommunityIds.has(row.communaute_historique_id)).length;
    const marriageJubilees=visibleMarriages.filter((row)=>row.type==="novas_nuptias"&&is25or50YearAnniversary(row.annee,row.mois,row.jour,row.precision)&&scopeCommunityIds.has(row.communaute_historique_id)).length;
    const jubileeValues=reportMask([baptismJubilees,marriageJubilees]);
    container.querySelector<HTMLElement>("#analytics-jubilees")!.innerHTML=
      reportMetricCard("Anniversaires de baptême",String(jubileeValues[0]),"25 ou 50 ans")+
      reportMetricCard("Jubilés de mariage",String(jubileeValues[1]),"25 ou 50 ans");

    exportRows=[
      ["Indicateur","Valeur"],
      ["Année pastorale",year.libelle],
      ["Fidèles vivants",reportNumber(living.length)],
      ["Baptêmes",reportNumber(baptismCount)],
      ["Premières communions",reportNumber(eucharistCount)],
      ["Confirmations",reportNumber(confirmationCount)],
      ["Mariages",reportNumber(marriageCount)],
      ["Baptisés vivants",reportNumber(baptizedScoped)],
      ["Baptisés sans première communion",reportNumber(notCommuned)],
      ["Baptisés sans confirmation",reportNumber(notConfirmed)],
      ["Âges connus",reportNumber(ageKnown)],
      ["Hommes",reportNumber(male)],
      ["Femmes",reportNumber(female)],
      ["Naissances inconnues",reportNumber(missingBirth)],
      ["Naissances approximatives",reportNumber(approximateBirth)],
      ["Références d'acte incomplètes",reportNumber(missingReferences)],
      ["Dates au 01/01 à vérifier",reportNumber(suspiciousDefault)]
    ];
  }

  yearSelect.addEventListener("change",render);
  quartierSelect.addEventListener("change",render);
  communitySelect.addEventListener("change",render);
  refresh.addEventListener("click",()=>render());
  container.querySelector<HTMLButtonElement>("#analytics-export")!.addEventListener("click",()=>{
    if(!exportRows.length)return;
    reportCsvDownload(exportRows,"enoria-synthese-pastorale-"+(yearSelect.selectedOptions[0]?.textContent??"annee")+".csv");
  });
  render();
}

export async function mountReports(container:HTMLElement,context:UserContext,activeYear:ActivePastoralYear|null):Promise<void>{
  const canUseNominalReports=context.roles.some((role)=>role==="secretaire"||role==="cure");
  const feedback=container.querySelector<HTMLElement>("#reports-feedback")!;
  const form=container.querySelector<HTMLFormElement>("#report-form")!;
  const type=container.querySelector<HTMLSelectElement>("#report-type")!;
  const year=container.querySelector<HTMLSelectElement>("#report-year")!;
  const calendarWrap=container.querySelector<HTMLElement>("#report-calendar-year-wrap")!;
  const calendarYear=container.querySelector<HTMLInputElement>("#report-calendar-year")!;
  const db=getSupabaseClient();
  const parishId=context.assignments[0].paroisse_id;

  if(!canUseNominalReports){
    for(const option of Array.from(type.options)){
      if(option.value!=="rapport_annuel")option.remove();
    }
  }

  const {data:years,error}=await db.from("annees_pastorales").select("id,libelle,active").eq("paroisse_id",parishId).order("libelle",{ascending:false});
  if(error)throw error;
  year.replaceChildren(...(years??[]).map((item)=>{
    const option=document.createElement("option");
    option.value=item.id;
    option.textContent=item.libelle;
    return option;
  }));
  if(!years?.length){
    const emptyOption=document.createElement("option");
    emptyOption.value="";
    emptyOption.textContent="Aucune année";
    year.append(emptyOption);
  }
  year.value=years?.some((item)=>item.id===activeYear?.id)?activeYear!.id:years?.find((item)=>item.active)?.id??years?.[0]?.id??"";
  calendarYear.value=String(new Date().getFullYear());

  function syncReportControls():void{
    const usesCalendarYear=type.value==="rapport_annuel"||type.value==="registre_baptemes";
    calendarWrap.classList.toggle("hidden",!usesCalendarYear);
    const pastoralYearLabel=year.closest("label");
    pastoralYearLabel?.classList.toggle("hidden",usesCalendarYear||type.value==="fideles");
    year.disabled=usesCalendarYear||type.value==="fideles";
  }
  type.addEventListener("change",syncReportControls);
  syncReportControls();
  await mountPastoralAnalytics(container,context,activeYear);

  form.addEventListener("submit",async(event)=>{
    event.preventDefault();
    feedback.className="hidden";
    const usesCalendarYear=type.value==="rapport_annuel"||type.value==="registre_baptemes";
    const selectedCalendarYear=Number(calendarYear.value);
    if(usesCalendarYear&&(!Number.isInteger(selectedCalendarYear)||selectedCalendarYear<1900||selectedCalendarYear>2100)){
      feedback.textContent="Saisis une année civile valide.";
      feedback.className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800";
      return;
    }
    if(!usesCalendarYear&&type.value!=="fideles"&&!year.value){
      feedback.textContent="Sélectionne une année pastorale.";
      feedback.className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800";
      return;
    }
    const aggregated=type.value==="rapport_annuel";
    const confirmation=aggregated
      ?"Ce rapport ne contient que des chiffres agrégés. Les petits effectifs sont masqués. Confirmer sa génération ?"
      :"Ce fichier contient des données nominatives et religieuses. Confirmer l'export sur un poste protégé réservé au curé ou à la secrétaire ?";
    if(!window.confirm(confirmation))return;
    const button=container.querySelector<HTMLButtonElement>("#report-export")!;
    button.disabled=true;
    button.textContent="Préparation…";
    try{
      if(type.value==="rapport_annuel")await exportAnnualBishopReport(parishId,selectedCalendarYear);
      else if(type.value==="registre_baptemes")await exportBaptismRegister(parishId,selectedCalendarYear);
      else if(type.value==="fideles")await exportFideles();
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

