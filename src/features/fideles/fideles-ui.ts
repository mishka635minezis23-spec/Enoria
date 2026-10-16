import type { Database, Tables } from "../../types/database.types";
import type { ActivePastoralYear, UserContext } from "../../auth/auth-service";
import { getSupabaseClient } from "../../lib/supabase";
import {
  getFaithfulInitialTab,
  getFaithfulListQuery,
  navigateBackFromFaithful,
  navigateToFaithful,
  updateFaithfulListQuery
} from "../../router";

type Precision = Database["public"]["Enums"]["precision_date"];
type Community = Tables<"communautes">;
type Quartier = Tables<"quartiers">;

const PAGE_SIZE = 20;

function escapeHtml(value: unknown): string {
  const text = String(value ?? "");
  const replacements: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  };
  return text.replace(/[&<>"']/g, (character) => replacements[character] ?? character);
}

function readListParams(): URLSearchParams {
  return new URLSearchParams(getFaithfulListQuery());
}

function writeListParams(params: URLSearchParams): void {
  updateFaithfulListQuery(params);
}

function safeSearchTerm(value: string): string {
  return value.normalize("NFC").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().slice(0, 80);
}

function setFeedback(node: HTMLElement, message: string, kind: "error" | "info" = "info"): void {
  node.textContent = message;
  node.className = kind === "error"
    ? "mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
    : "mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600";
}

export function mountFaithfulList(container: HTMLElement): void {
  const form = container.querySelector<HTMLFormElement>("#faithful-filters");
  const search = container.querySelector<HTMLInputElement>("#faithful-search");
  const quartierSelect = container.querySelector<HTMLSelectElement>("#filter-quartier");
  const communitySelect = container.querySelector<HTMLSelectElement>("#filter-communaute");
  const sexSelect = container.querySelector<HTMLSelectElement>("#filter-sexe");
  const statusSelect = container.querySelector<HTMLSelectElement>("#filter-statut");
  const rowsNode = container.querySelector<HTMLElement>("#faithful-rows");
  const feedback = container.querySelector<HTMLElement>("#faithful-feedback");
  const countNode = container.querySelector<HTMLElement>("#faithful-count");
  const pageNode = container.querySelector<HTMLElement>("#faithful-page");
  const previous = container.querySelector<HTMLButtonElement>("#faithful-prev");
  const next = container.querySelector<HTMLButtonElement>("#faithful-next");
  if (!form || !search || !quartierSelect || !communitySelect || !sexSelect || !statusSelect || !rowsNode || !feedback || !countNode || !pageNode || !previous || !next) return;

  const formEl = form!;
  const searchEl = search!;
  const quartierSelectEl = quartierSelect!;
  const communitySelectEl = communitySelect!;
  const sexSelectEl = sexSelect!;
  const statusSelectEl = statusSelect!;
  const rowsNodeEl = rowsNode!;
  const feedbackEl = feedback!;
  const countNodeEl = countNode!;
  const pageNodeEl = pageNode!;
  const previousEl = previous!;
  const nextEl = next!;

  const params = readListParams();
  searchEl.value = params.get("q") ?? "";
  quartierSelectEl.value = params.get("quartier") ?? "";
  communitySelectEl.value = params.get("communaute") ?? "";
  sexSelectEl.value = params.get("sexe") ?? "";
  statusSelectEl.value = params.get("statut") ?? "";

  let communities: Pick<Community, "id" | "nom" | "quartier_id">[] = [];
  let quartiers: Pick<Quartier, "id" | "nom">[] = [];
  let requestSequence = 0;

  function syncOptions(): void {
    const selectedQuartier = quartierSelectEl.value;
    const selectedCommunity = communitySelectEl.value;
    quartierSelectEl.innerHTML = '<option value="">Tous les quartiers</option>' +
      quartiers.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nom)}</option>`).join("");
    communitySelectEl.innerHTML = '<option value="">Toutes les communautés</option>' +
      communities
        .filter((item) => !selectedQuartier || item.quartier_id === selectedQuartier)
        .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nom)}</option>`)
        .join("");
    quartierSelectEl.value = selectedQuartier;
    communitySelectEl.value = selectedCommunity;
    if (communitySelectEl.value && ![...communitySelectEl.options].some((option) => option.value === communitySelectEl.value)) {
      communitySelectEl.value = "";
    }
  }

  function persistFilters(resetPage: boolean): void {
    const nextParams = new URLSearchParams();
    const term = safeSearchTerm(searchEl.value);
    if (term) nextParams.set("q", term);
    if (quartierSelectEl.value) nextParams.set("quartier", quartierSelectEl.value);
    if (communitySelectEl.value) nextParams.set("communaute", communitySelectEl.value);
    if (sexSelectEl.value) nextParams.set("sexe", sexSelectEl.value);
    if (statusSelectEl.value) nextParams.set("statut", statusSelectEl.value);
    const currentPage = resetPage ? 1 : Math.max(1, Number(readListParams().get("page") ?? "1"));
    if (currentPage > 1) nextParams.set("page", String(currentPage));
    writeListParams(nextParams);
  }

  async function loadRows(): Promise<void> {
    const sequence = ++requestSequence;
    const current = readListParams();
    const page = Math.max(1, Number(current.get("page") ?? "1"));
    const from = (page - 1) * PAGE_SIZE;
    const term = safeSearchTerm(current.get("q") ?? "");
    feedbackEl.classList.add("hidden");
    rowsNodeEl.innerHTML = '<tr><td colspan="7" class="px-3 py-12 text-center text-sm text-slate-400">Chargement du registre…</td></tr>';
    previousEl.disabled = true;
    nextEl.disabled = true;
    countNodeEl.textContent = "Chargement…";
    pageNodeEl.textContent = `Page ${page}`;

    try {
      const supabase = getSupabaseClient();
      if (communities.length === 0 || quartiers.length === 0) {
        const [communityResult, quartierResult] = await Promise.all([
          supabase.from("communautes").select("id,nom,quartier_id").order("nom"),
          supabase.from("quartiers").select("id,nom").order("nom")
        ]);
        if (communityResult.error) throw communityResult.error;
        if (quartierResult.error) throw quartierResult.error;
        communities = communityResult.data;
        quartiers = quartierResult.data;
        syncOptions();
      }

      let query = supabase
        .from("fideles")
        .select("id,prenom,nom,sexe,statut,communaute_id", { count: "exact" })
        .order("nom", { ascending: true })
        .order("prenom", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (term) query = query.or(`prenom.ilike.%${term}%,nom.ilike.%${term}%`);
      if (current.get("sexe")) query = query.eq("sexe", current.get("sexe")!);
      const selectedStatus = current.get("statut");
      if (selectedStatus === "vivant" || selectedStatus === "decede") query = query.eq("statut", selectedStatus);
      if (current.get("communaute")) {
        query = query.eq("communaute_id", current.get("communaute")!);
      } else if (current.get("quartier")) {
        const communityIds = communities
          .filter((item) => item.quartier_id === current.get("quartier"))
          .map((item) => item.id);
        if (communityIds.length === 0) {
          rowsNodeEl.innerHTML = '<tr><td colspan="7" class="px-3 py-12 text-center text-sm text-slate-400">Aucun fidèle dans ce quartier.</td></tr>';
          countNodeEl.textContent = "0 résultat";
          previousEl.disabled = page <= 1;
          nextEl.disabled = true;
          return;
        }
        query = query.in("communaute_id", communityIds);
      }

      const result = await query;
      if (sequence !== requestSequence) return;
      if (result.error) throw result.error;
      const data = result.data ?? [];
      const total = result.count ?? 0;
      const communityMap = new Map(communities.map((item) => [item.id, item]));
      const quartierMap = new Map(quartiers.map((item) => [item.id, item]));
      if (data.length === 0) {
        rowsNodeEl.innerHTML = '<tr><td colspan="7" class="px-3 py-12 text-center text-sm text-slate-400">Aucun fidèle ne correspond à cette recherche.</td></tr>';
      } else {
        rowsNodeEl.innerHTML = data.map((item, index) => {
          const community = communityMap.get(item.communaute_id);
          const quartier = community ? quartierMap.get(community.quartier_id) : undefined;
          const sexLabel = item.sexe === "masculin" ? "Masculin" : item.sexe === "feminin" ? "Féminin" : "Non précisé";
          const statusLabel = item.statut === "decede" ? "Décédé" : "Vivant";
          const statusClass = item.statut === "decede" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700";
          return `<tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
            <td class="px-3 py-3 text-xs text-slate-400">${from + index + 1}</td>
            <td class="px-3 py-3 font-medium text-slate-800">${escapeHtml(item.prenom)} ${escapeHtml(item.nom)}</td>
            <td class="px-3 py-3 text-slate-600">${sexLabel}</td>
            <td class="px-3 py-3 text-slate-600">${escapeHtml(quartier?.nom ?? "—")}</td>
            <td class="px-3 py-3 text-slate-600">${escapeHtml(community?.nom ?? "—")}</td>
            <td class="px-3 py-3"><span class="rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass}">${statusLabel}</span></td>
            <td class="px-3 py-3"><button type="button" data-open-fidele="${escapeHtml(item.id)}" class="text-xs font-semibold text-emerald-700 hover:underline">Voir</button></td>
          </tr>`;
        }).join("");
      }
      countNodeEl.textContent = `${total.toLocaleString("fr-CD")} fidèle(s)`;
      pageNodeEl.textContent = `Page ${page}`;
      previousEl.disabled = page <= 1;
      nextEl.disabled = from + data.length >= total;
    } catch (error) {
      if (sequence !== requestSequence) return;
      rowsNodeEl.innerHTML = '<tr><td colspan="7" class="px-3 py-12 text-center text-sm text-rose-600">Impossible de charger le registre.</td></tr>';
      setFeedback(feedbackEl, error instanceof Error ? error.message : "Erreur de lecture du registre.", "error");
      feedbackEl.classList.remove("hidden");
      countNodeEl.textContent = "Registre indisponible";
    }
  }

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    persistFilters(true);
    void loadRows();
  });
  for (const select of [quartierSelectEl, communitySelectEl, sexSelectEl, statusSelectEl]) {
    select.addEventListener("change", () => {
      if (select === quartierSelectEl) {
        communitySelectEl.value = "";
        syncOptions();
      }
      persistFilters(true);
      void loadRows();
    });
  }
  previousEl.addEventListener("click", () => {
    const current = readListParams();
    current.set("page", String(Math.max(1, Number(current.get("page") ?? "1") - 1)));
    writeListParams(current);
    void loadRows();
  });
  nextEl.addEventListener("click", () => {
    const current = readListParams();
    current.set("page", String(Number(current.get("page") ?? "1") + 1));
    writeListParams(current);
    void loadRows();
  });
  container.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-open-fidele]");
    if (button?.dataset.openFidele) navigateToFaithful(button.dataset.openFidele);
  });

  void loadRows();
}

function formatPartialDate(
  day: number | null,
  month: number | null,
  year: number | null,
  precision: Precision
): string {
  if (precision === "inconnue") return "Date inconnue";
  if (precision === "annee") return year ? String(year) : "Année non renseignée";
  if (precision === "mois") {
    if (!year || !month) return "Mois/année incomplets";
    return new Intl.DateTimeFormat("fr-CD", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
  }
  if (!day || !month || !year) return "Date incomplète";
  return new Intl.DateTimeFormat("fr-CD", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(year, month - 1, day));
}

function renderField(label: string, value: unknown): string {
  return `<div class="rounded-xl bg-slate-50 p-4"><p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">${escapeHtml(label)}</p><p class="mt-1 text-sm font-medium text-slate-800">${escapeHtml(value || "—")}</p></div>`;
}

interface PartialDateValues {
  precision: Precision;
  jour: number | null;
  mois: number | null;
  annee: number | null;
}

function partialDateFields(prefix: string): string {
  return `
    <div class="grid gap-3 sm:grid-cols-4">
      <label class="text-xs font-medium text-slate-600">Précision
        <select id="${prefix}-precision" class="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
          <option value="exacte">Date exacte</option><option value="mois">Mois et année</option><option value="annee">Année seulement</option><option value="inconnue">Inconnue</option>
        </select>
      </label>
      <label class="text-xs font-medium text-slate-600">Jour<input id="${prefix}-day" type="number" min="1" max="31" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
      <label class="text-xs font-medium text-slate-600">Mois<input id="${prefix}-month" type="number" min="1" max="12" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
      <label class="text-xs font-medium text-slate-600">Année<input id="${prefix}-year" type="number" min="1800" max="2200" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
    </div>`;
}

function bindPartialDate(form: HTMLFormElement, prefix: string): void {
  const precision = form.querySelector<HTMLSelectElement>(`#${prefix}-precision`)!;
  const day = form.querySelector<HTMLInputElement>(`#${prefix}-day`)!;
  const month = form.querySelector<HTMLInputElement>(`#${prefix}-month`)!;
  const year = form.querySelector<HTMLInputElement>(`#${prefix}-year`)!;
  const sync = (): void => {
    const value = precision.value as Precision;
    day.disabled = value !== "exacte";
    day.required = value === "exacte";
    month.disabled = value !== "exacte" && value !== "mois";
    month.required = value === "exacte" || value === "mois";
    year.disabled = value === "inconnue";
    year.required = value !== "inconnue";
  };
  precision.addEventListener("change", sync);
  sync();
}

function collectPartialDate(form: HTMLFormElement, prefix: string): PartialDateValues {
  const precision = form.querySelector<HTMLSelectElement>(`#${prefix}-precision`)!.value as Precision;
  const dayInput = form.querySelector<HTMLInputElement>(`#${prefix}-day`)!;
  const monthInput = form.querySelector<HTMLInputElement>(`#${prefix}-month`)!;
  const yearInput = form.querySelector<HTMLInputElement>(`#${prefix}-year`)!;
  const jour = precision === "exacte" ? Number(dayInput.value) : null;
  const mois = precision === "exacte" || precision === "mois" ? Number(monthInput.value) : null;
  const annee = precision !== "inconnue" ? Number(yearInput.value) : null;
  if (annee !== null && (!Number.isInteger(annee) || annee < 1800 || annee > 2200)) throw new Error("L'année doit être comprise entre 1800 et 2200.");
  if (mois !== null && (!Number.isInteger(mois) || mois < 1 || mois > 12)) throw new Error("Le mois doit être compris entre 1 et 12.");
  if (jour !== null) {
    if (!Number.isInteger(jour) || jour < 1 || jour > 31 || mois === null || annee === null) throw new Error("La date exacte est incomplète.");
    const check = new Date(annee, mois - 1, jour);
    if (check.getFullYear() !== annee || check.getMonth() !== mois - 1 || check.getDate() !== jour) throw new Error("Cette date du calendrier n'existe pas.");
  }
  return { precision, jour, mois, annee };
}

export async function mountFaithfulProfile(
  container: HTMLElement,
  context: UserContext,
  faithfulId: string,
  activeYear: ActivePastoralYear | null
): Promise<void> {
  container.querySelector<HTMLButtonElement>("#faithful-back")?.addEventListener("click", navigateBackFromFaithful);
  const nameNode = container.querySelector<HTMLElement>("#profile-name");
  const subtitleNode = container.querySelector<HTMLElement>("#profile-subtitle");
  const contentNode = container.querySelector<HTMLElement>("#profile-content");
  const feedback = container.querySelector<HTMLElement>("#profile-feedback");
  if (!nameNode || !subtitleNode || !contentNode || !feedback) return;
  const nameEl = nameNode!;
  const subtitleEl = subtitleNode!;
  const contentEl = contentNode!;

  const supabase = getSupabaseClient();
  try {
    const { data: faithful, error } = await supabase.from("fideles").select("*").eq("id", faithfulId).maybeSingle();
    if (error) throw error;
    if (!faithful) throw new Error("Fidèle introuvable ou accès non autorisé.");
    const faithfulRecord = faithful!;

    const communityResult = await supabase
      .from("communautes")
      .select("id,nom,quartier_id")
      .eq("id", faithfulRecord.communaute_id)
      .maybeSingle();
    if (communityResult.error) throw communityResult.error;
    const community = communityResult.data;
    let quartierName = "—";
    if (community) {
      const q = await supabase.from("quartiers").select("id,nom").eq("id", community.quartier_id).maybeSingle();
      if (!q.error && q.data) quartierName = q.data.nom;
    }

    nameEl.textContent = `${faithfulRecord.prenom} ${faithfulRecord.nom}`;
    subtitleEl.textContent = `${faithfulRecord.sexe === "masculin" ? "Masculin" : faithfulRecord.sexe === "feminin" ? "Féminin" : "Sexe non précisé"} · ${faithfulRecord.statut === "decede" ? "Décédé" : "Vivant"}`;

    const tabs = [...container.querySelectorAll<HTMLButtonElement>("[data-tab]")];
    let tabSequence = 0;

    const renderGeneral = (): void => {
      const birth = formatPartialDate(faithfulRecord.naissance_jour, faithfulRecord.naissance_mois, faithfulRecord.naissance_annee, faithfulRecord.naissance_precision);
      const death = formatPartialDate(faithfulRecord.deces_jour, faithfulRecord.deces_mois, faithfulRecord.deces_annee, faithfulRecord.deces_precision);
      contentEl.innerHTML = `
        <div class="grid gap-4 lg:grid-cols-2">
          <section class="page-card p-5"><h2 class="font-semibold text-slate-800">Identité</h2><div class="mt-4 grid gap-3 sm:grid-cols-2">
            ${renderField("Prénom", faithfulRecord.prenom)}${renderField("Nom", faithfulRecord.nom)}${renderField("Sexe", faithfulRecord.sexe === "masculin" ? "Masculin" : "Féminin")}${renderField("Statut", faithfulRecord.statut === "decede" ? "Décédé" : "Vivant")}
            ${renderField("Date de naissance", birth)}${renderField("Lieu de naissance", faithfulRecord.lieu_naissance)}
            ${faithfulRecord.statut === "decede" ? renderField("Date de décès", death) : ""}
          </div></section>
          <section class="page-card p-5"><h2 class="font-semibold text-slate-800">Famille et appartenance</h2><div class="mt-4 grid gap-3 sm:grid-cols-2">
            ${renderField("Nom du père", faithfulRecord.nom_pere)}${renderField("Nom de la mère", faithfulRecord.nom_mere)}
            ${renderField("Quartier", quartierName)}${renderField("Communauté actuelle", community?.nom ?? "—")}
            ${renderField("Depuis le", faithfulRecord.communaute_depuis)}
          </div></section>
        </div>`;
    };

    async function renderTab(tab: string): Promise<void> {
      const sequence = ++tabSequence;
      tabs.forEach((button) => {
        const selected = button.dataset.tab === tab;
        button.className = selected
          ? "profile-tab whitespace-nowrap border-b-2 border-emerald-700 px-4 py-3 text-sm font-semibold text-emerald-800"
          : "profile-tab whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-500";
      });
      if (tab === "general") {
        renderGeneral();
        return;
      }
      contentEl.innerHTML = '<div class="page-card p-6 text-sm text-slate-500">Chargement de cet onglet…</div>';
      try {
        if (tab === "sacrements") {
          const [sacramentResult, marriageResult, mentionResult] = await Promise.all([
            supabase.from("sacrements").select("*").eq("fidele_id", faithfulId).order("annee", { ascending: true }),
            supabase.from("evenements_matrimoniaux").select("*").eq("fidele_id", faithfulId).order("annee", { ascending: true }),
            supabase.from("mentions_livret").select("*").eq("fidele_id", faithfulId).order("created_at", { ascending: false })
          ]);
          if (sequence !== tabSequence) return;
          if (sacramentResult.error) throw sacramentResult.error;
          const sacramentLabels: Record<string, string> = { bapteme: "Baptême", eucharistie: "Eucharistie", confirmation: "Confirmation" };
          const sacramentsHtml = (sacramentResult.data ?? []).map((item) => `
            <article class="rounded-xl border border-slate-100 p-4"><div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-semibold text-slate-800">${sacramentLabels[item.type] ?? item.type}</h3><span class="text-xs text-slate-500">${formatPartialDate(item.jour, item.mois, item.annee, item.precision)}</span></div>
            <p class="mt-2 text-xs text-slate-500">${escapeHtml(item.lieu ?? "Lieu non renseigné")} · Acte ${escapeHtml(item.numero_acte ?? "—")} · Page ${escapeHtml(item.page_registre ?? "—")}</p>
            <p class="mt-1 text-xs text-slate-500">Ministre : ${escapeHtml(item.ministre ?? "—")} · Parrain : ${escapeHtml(item.parrain ?? "—")} · Marraine : ${escapeHtml(item.marraine ?? "—")}</p></article>`).join("");
          const marriageHtml = (marriageResult.error ? [] : marriageResult.data ?? []).map((item) => `
            <article class="rounded-xl border border-slate-100 p-4"><h3 class="font-semibold text-slate-800">Événement matrimonial : ${escapeHtml(item.type)}</h3><p class="mt-2 text-xs text-slate-500">${formatPartialDate(item.jour, item.mois, item.annee, item.precision)} · ${escapeHtml(item.lieu ?? "Lieu non renseigné")}</p><p class="mt-1 text-xs text-slate-500">Conjoint : ${escapeHtml(item.conjoint_nom ?? "—")} · Acte ${escapeHtml(item.numero_acte ?? "—")} · Page ${escapeHtml(item.page_registre ?? "—")}</p></article>`).join("");
          const mentionsHtml = (mentionResult.error ? [] : mentionResult.data ?? []).map((item) => `<li class="flex justify-between gap-3 py-2 text-xs"><span>${escapeHtml(item.type_mention)}</span><span class="text-slate-500">${escapeHtml(item.statut)}</span></li>`).join("");
          const canWrite = context.roles.some((role) => role === "secretaire" || role === "cure");
          let editorHtml = "";
          let yearsForForm: {id:string;libelle:string;date_debut:string;active:boolean}[] = [];
          let communitiesForForm: {id:string;nom:string}[] = [];
          if (canWrite) {
            const [yearsResult, communitiesResult] = await Promise.all([
              supabase.from("annees_pastorales").select("id,libelle,date_debut,active").eq("paroisse_id",faithfulRecord.paroisse_id).order("date_debut",{ascending:false}),
              supabase.from("communautes").select("id,nom").eq("paroisse_id",faithfulRecord.paroisse_id).order("nom")
            ]);
            if (yearsResult.error) throw yearsResult.error;
            if (communitiesResult.error) throw communitiesResult.error;
            yearsForForm = yearsResult.data;
            communitiesForForm = communitiesResult.data;
            const availableTypes = (["eucharistie","confirmation"] as const).filter((type) =>
              !(sacramentResult.data ?? []).some((item) => item.type === type)
            );
            const yearOptions = yearsForForm.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.libelle)}</option>`).join("");
            const communityOptions = communitiesForForm.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nom)}</option>`).join("");
            editorHtml = `
              <section class="page-card p-5">
                <h2 class="font-semibold text-slate-800">Ajouter un sacrement</h2>
                <p class="mt-1 text-xs leading-5 text-slate-500">Réservé à la secrétaire et au curé. Le numéro d'acte et la page du registre sont obligatoires.</p>
                ${availableTypes.length && yearOptions && communityOptions ? `
                  <form id="add-sacrament-form" class="mt-4 space-y-4">
                    <div class="grid gap-3 sm:grid-cols-3">
                      <label class="text-xs font-medium text-slate-600">Sacrement<select name="type" class="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">${availableTypes.map((type)=>`<option value="${type}">${type==="eucharistie"?"Eucharistie":"Confirmation"}</option>`).join("")}</select></label>
                      <label class="text-xs font-medium text-slate-600">Année pastorale<select name="annee" required class="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">${yearOptions}</select></label>
                      <label class="text-xs font-medium text-slate-600">Communauté de célébration<select name="communaute" required class="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">${communityOptions}</select></label>
                    </div>
                    ${partialDateFields("sacrament")}
                    <div class="grid gap-3 sm:grid-cols-2">
                      <label class="text-xs font-medium text-slate-600">Numéro d'acte<input name="numero_acte" required maxlength="80" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                      <label class="text-xs font-medium text-slate-600">Page du registre<input name="page_registre" required maxlength="80" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                      <label class="text-xs font-medium text-slate-600">Lieu<input name="lieu" maxlength="160" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                      <label class="text-xs font-medium text-slate-600">Ministre<input name="ministre" maxlength="160" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                    </div>
                    <p id="add-sacrament-feedback" class="hidden rounded-lg p-3 text-sm" role="status"></p>
                    <button type="submit" class="rounded-lg bg-[var(--enoria-green)] px-4 py-2.5 text-sm font-semibold text-white">Enregistrer le sacrement</button>
                  </form>` : '<p class="mt-3 text-sm text-slate-500">Aucun type de sacrement disponible ou aucune année/communauté accessible.</p>'}
              </section>
              <section class="page-card p-5">
                <h2 class="font-semibold text-slate-800">Carte de baptême et mariage</h2>
                <div class="mt-3 flex flex-wrap items-center justify-between gap-3"><p class="max-w-2xl text-xs leading-5 text-slate-500">La modification de la carte de baptême attend une opération atomique côté base. L'ajout des événements matrimoniaux attend une contrainte obligatoire sur l'acte et la page du registre.</p><button type="button" disabled class="cursor-not-allowed rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-400">Modifier la carte de baptême</button></div>
              </section>`;
          } else {
            editorHtml = '<section class="page-card p-5 text-sm text-slate-500">Consultation seule : l’ajout et la modification des sacrements sont réservés à la secrétaire et au curé.</section>';
          }
          contentEl.innerHTML = `
            <div class="space-y-4"><section class="page-card p-5"><h2 class="font-semibold text-slate-800">Sacrements</h2><div class="mt-4 space-y-3">${sacramentsHtml || '<p class="text-sm text-slate-400">Aucun sacrement lisible pour ce dossier.</p>'}</div></section>
            <section class="page-card p-5"><h2 class="font-semibold text-slate-800">Événements matrimoniaux</h2><div class="mt-4 space-y-3">${marriageHtml || '<p class="text-sm text-slate-400">Aucun événement matrimonial lisible.</p>'}</div></section>
            <section class="page-card p-5"><h2 class="font-semibold text-slate-800">Mentions du livret</h2><ul class="mt-3 divide-y divide-slate-100">${mentionsHtml || '<li class="py-2 text-sm text-slate-400">Aucune mention enregistrée.</li>'}</ul></section>
            ${editorHtml}</div>`;

          const addForm = contentEl.querySelector<HTMLFormElement>("#add-sacrament-form");
          if (addForm) {
            bindPartialDate(addForm,"sacrament");
            const yearSelect = addForm.querySelector<HTMLSelectElement>('select[name="annee"]')!;
            const communitySelect = addForm.querySelector<HTMLSelectElement>('select[name="communaute"]')!;
            const yearOptionsData = yearsForForm;
            const communityOptionsData = communitiesForForm;
            yearSelect.value = yearOptionsData.some((item)=>item.id===activeYear?.id) ? activeYear!.id : yearOptionsData.find((item)=>item.active)?.id ?? yearOptionsData[0]?.id ?? "";
            communitySelect.value = communityOptionsData.some((item)=>item.id===faithfulRecord.communaute_id) ? faithfulRecord.communaute_id : communityOptionsData[0]?.id ?? "";
            addForm.addEventListener("submit",async(event)=>{
              event.preventDefault();
              const formFeedback=addForm.querySelector<HTMLElement>("#add-sacrament-feedback")!;
              const button=addForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
              const values=new FormData(addForm);
              button.disabled=true;
              button.textContent="Enregistrement…";
              try {
                const date=collectPartialDate(addForm,"sacrament");
                const act=String(values.get("numero_acte")??"").trim();
                const page=String(values.get("page_registre")??"").trim();
                if(!act||!page)throw new Error("Le numéro d'acte et la page du registre sont obligatoires.");
                const selectedType=String(values.get("type"));
                if(selectedType!=="eucharistie"&&selectedType!=="confirmation")throw new Error("Type de sacrement invalide.");
                const {error:insertError}=await supabase.from("sacrements").insert({
                  fidele_id:faithfulRecord.id,
                  paroisse_id:faithfulRecord.paroisse_id,
                  type:selectedType,
                  annee_pastorale_id:String(values.get("annee")),
                  communaute_historique_id:String(values.get("communaute")),
                  jour:date.jour,
                  mois:date.mois,
                  annee:date.annee,
                  precision:date.precision,
                  lieu:String(values.get("lieu")??"").trim()||null,
                  numero_acte:act,
                  page_registre:page,
                  reference_registre_requise:true,
                  ministre:String(values.get("ministre")??"").trim()||null
                });
                if(insertError)throw insertError;
                formFeedback.textContent="Sacrement enregistré dans le registre numérique.";
                formFeedback.className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800";
                await renderTab("sacrements");
              } catch(error) {
                formFeedback.textContent=error instanceof Error?error.message:"Enregistrement impossible.";
                formFeedback.className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700";
                button.disabled=false;
                button.textContent="Enregistrer le sacrement";
              }
            });
          }
          return;
        }

        if (tab === "famille") {
          const { data, error } = await supabase.from("enfants").select("*").eq("fidele_parent_id", faithfulId).order("nom");
          if (sequence !== tabSequence) return;
          if (error) throw error;
          const html = (data ?? []).map((child) => `
            <article class="rounded-xl border border-slate-100 p-4"><h3 class="font-semibold text-slate-800">${escapeHtml(child.prenom)} ${escapeHtml(child.nom)}</h3>
              <p class="mt-2 text-xs text-slate-500">Naissance : ${formatPartialDate(child.naissance_jour, child.naissance_mois, child.naissance_annee, child.naissance_precision)}</p>
              <p class="mt-1 text-xs text-slate-500">Baptême : ${formatPartialDate(child.bapteme_jour, child.bapteme_mois, child.bapteme_annee, child.bapteme_precision)} · Statut : ${escapeHtml(child.statut_bapteme)}</p>
              <p class="mt-1 text-xs text-slate-500">Confession : ${escapeHtml(child.confession)}</p></article>`).join("");
          contentEl.innerHTML = `<section class="page-card p-5"><h2 class="font-semibold text-slate-800">Enfants</h2><div class="mt-4 space-y-3">${html || '<p class="text-sm text-slate-400">Aucun enfant enregistré dans ce dossier.</p>'}</div></section>`;
          return;
        }

        if (tab === "historique") {
          if (!context.roles.some((role) => role === "secretaire" || role === "cure")) {
            contentEl.innerHTML = '<section class="page-card p-5 text-sm text-slate-500">L’historique des transferts est réservé à la secrétaire et au curé.</section>';
            return;
          }
          const { data, error } = await supabase.from("historique_affectations_fideles").select("*").eq("fidele_id", faithfulId).order("date_debut", { ascending: false });
          if (sequence !== tabSequence) return;
          if (error) throw error;
          const html = (data ?? []).map((item) => `
            <article class="rounded-xl border border-slate-100 p-4"><p class="text-sm font-semibold text-slate-800">Changement de communauté</p>
            <p class="mt-2 text-xs text-slate-500">Du ${escapeHtml(item.date_debut)} au ${escapeHtml(item.date_fin ?? "en cours")} · Motif : ${escapeHtml(item.motif ?? "Non précisé")}</p></article>`).join("");
          contentEl.innerHTML = `<section class="page-card p-5"><h2 class="font-semibold text-slate-800">Historique des affectations</h2><div class="mt-4 space-y-3">${html || '<p class="text-sm text-slate-400">Aucun transfert enregistré.</p>'}</div></section>`;
          return;
        }

        if (tab === "documents") {
          if (!context.roles.some((role) => role === "secretaire" || role === "cure")) {
            contentEl.innerHTML = '<section class="page-card p-5 text-sm text-slate-500">Les demandes et duplicatas sont réservés à la secrétaire et au curé.</section>';
            return;
          }
          const { data, error } = await supabase.from("certificats").select("*").eq("fidele_id", faithfulId).order("date_demande", { ascending: false });
          if (sequence !== tabSequence) return;
          if (error) throw error;
          const statusLabels: Record<string, string> = { attente: "En attente", valide: "Validé", refuse: "Refusé", emis: "Émis" };
          const html = (data ?? []).map((item) => `
            <article class="rounded-xl border border-slate-100 p-4"><div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-semibold text-slate-800">Duplicata n° ${item.numero_duplicata}</h3><span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">${statusLabels[item.statut] ?? item.statut}</span></div>
            <p class="mt-2 text-xs text-slate-500">Demande : ${escapeHtml(item.date_demande)} · Validation : ${escapeHtml(item.date_validation ?? "—")} · Émission : ${escapeHtml(item.date_emission ?? "—")}</p>
            ${item.motif_refus ? `<p class="mt-1 text-xs text-rose-600">Motif du refus : ${escapeHtml(item.motif_refus)}</p>` : ""}</article>`).join("");
          contentEl.innerHTML = `<section class="page-card p-5"><h2 class="font-semibold text-slate-800">Demandes de duplicata</h2><div class="mt-4 space-y-3">${html || '<p class="text-sm text-slate-400">Aucune demande de duplicata.</p>'}</div></section>`;
        }
      } catch (error) {
        if (sequence !== tabSequence) return;
        contentEl.innerHTML = `<section class="page-card p-5 text-sm text-rose-700">${escapeHtml(error instanceof Error ? error.message : "Impossible de charger cet onglet.")}</section>`;
      }
    }

    tabs.forEach((button) => button.addEventListener("click", () => void renderTab(button.dataset.tab ?? "general")));
    void renderTab(getFaithfulInitialTab());
  } catch (error) {
    nameEl.textContent = "Dossier indisponible";
    subtitleEl.textContent = "Les informations ne sont pas accessibles avec ce compte.";
    contentEl.innerHTML = `<section class="page-card p-5 text-sm text-rose-700">${escapeHtml(error instanceof Error ? error.message : "Impossible de charger le dossier.")}</section>`;
  }
}
