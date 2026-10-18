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
type AnnualEvent = {kind:"Baptêmes"|"Confirmations"|"Mariages";fideleId:string;day:number|null;month:number|null;year:number|null;precision:string};
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
async function fetchByCalendarYear(parishId:string,calendarYear:number,type:"bapteme"|"confirmation"):Promise<Tables<"sacrements">[]>{
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
  const [baptisms,confirmations,marriages,parishResult]=await Promise.all([
    fetchByCalendarYear(parishId,calendarYear,"bapteme"),
    fetchByCalendarYear(parishId,calendarYear,"confirmation"),
    fetchMarriagesByCalendarYear(parishId,calendarYear),
    db.from("paroisses").select("nom").eq("id",parishId).maybeSingle()
  ]);
  if(parishResult.error)throw parishResult.error;
  const events:AnnualEvent[]=[
    ...baptisms.map((row)=>({kind:"Baptêmes" as const,fideleId:row.fidele_id,day:row.jour,month:row.mois,year:row.annee,precision:row.precision})),
    ...confirmations.map((row)=>({kind:"Confirmations" as const,fideleId:row.fidele_id,day:row.jour,month:row.mois,year:row.annee,precision:row.precision})),
    ...marriages.map((row)=>({kind:"Mariages" as const,fideleId:row.fidele_id,day:row.jour,month:row.mois,year:row.annee,precision:row.precision}))
  ];
  const people=await fetchAnnualFaithfulRows([...new Set(events.map((event)=>event.fideleId))]);
  const kinds:AnnualEvent["kind"][]=["Baptêmes","Confirmations","Mariages"];
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
  year.innerHTML=(years??[]).map((item)=>'<option value="'+item.id+'">'+item.libelle+'</option>').join("")||'<option value="">Aucune année</option>';
  year.value=years?.some((item)=>item.id===activeYear?.id)?activeYear!.id:years?.find((item)=>item.active)?.id??years?.[0]?.id??"";
  calendarYear.value=String(new Date().getFullYear());

  function syncReportControls():void{
    const usesCalendarYear=type.value==="rapport_annuel"||type.value==="registre_baptemes";
    calendarWrap.classList.toggle("hidden",!usesCalendarYear);
    year.disabled=usesCalendarYear||type.value==="fideles";
  }
  type.addEventListener("change",syncReportControls);
  syncReportControls();

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

