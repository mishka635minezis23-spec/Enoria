import type { Database, Json, Tables } from "../../types/database.types";
import type { ActivePastoralYear, UserContext } from "../../auth/auth-service";
import { getSupabaseClient } from "../../lib/supabase";
import { getAppConfig } from "../../config/app-config";
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
type CommunityChoice = Pick<Community, "id" | "nom" | "quartier_id">;
type PastoralYearChoice = Pick<Tables<"annees_pastorales">, "id" | "date_debut" | "date_fin" | "active">;

function resolvePastoralYearId(
  date: { annee: number | null; mois: number | null; jour: number | null },
  years: readonly PastoralYearChoice[],
  fallbackId?: string | null
): string {
  if (date.annee) {
    // Pour une date connue seulement par son année, le 30 juin sert de repère
    // dans l'année pastorale qui couvre la plus grande partie de l'année civile.
    const month = date.mois ?? 6;
    const day = date.jour ?? 30;
    const isoDate = `${date.annee}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const match = years.find((year) => year.date_debut <= isoDate && year.date_fin >= isoDate);
    if (match) return match.id;
  }
  return (fallbackId && years.some((year) => year.id === fallbackId) ? fallbackId : null)
    ?? years.find((year) => year.active)?.id
    ?? years[0]?.id
    ?? "";
}

function bindNeighborhoodCommunity(
  form: HTMLFormElement,
  quartierFieldName: string,
  communityFieldName: string,
  communities: readonly CommunityChoice[],
  selectedCommunityId?: string | null
): void {
  const quartierSelect = form.querySelector<HTMLSelectElement>(`select[name="${quartierFieldName}"]`);
  const communitySelect = form.querySelector<HTMLSelectElement>(`select[name="${communityFieldName}"]`);
  if (!quartierSelect || !communitySelect) return;
  const selectedCommunity = selectedCommunityId ? communities.find((item) => item.id === selectedCommunityId) : undefined;
  if (selectedCommunity) quartierSelect.value = selectedCommunity.quartier_id;
  const syncCommunities = (preferredId = ""): void => {
    const allowed = communities.filter((item) => Boolean(quartierSelect.value) && item.quartier_id === quartierSelect.value);
    communitySelect.innerHTML = '<option value="">Choisir une communauté…</option>' + allowed
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nom)}</option>`).join("");
    communitySelect.disabled = !quartierSelect.value;
    if (preferredId && allowed.some((item) => item.id === preferredId)) communitySelect.value = preferredId;
  };
  syncCommunities(selectedCommunity?.id ?? communitySelect.value);
  quartierSelect.addEventListener("change", () => syncCommunities());
}

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

export function mountFaithfulList(container: HTMLElement, context: UserContext, activeYear: ActivePastoralYear | null): void {
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

      if (term) {
        const tokens = term.split(/\s+/).filter(Boolean);
        const expression = tokens.map((part) => `prenom.ilike.%${part}%,nom.ilike.%${part}%`).join(",");
        query = query.or(expression);
      }
      if (current.get("sexe")) query = query.eq("sexe", current.get("sexe")!);
      const selectedStatus = current.get("statut");
      if (selectedStatus === "vivant" || selectedStatus === "decede") query = query.eq("statut", selectedStatus);
      if (current.get("communaute")) {
        query = query.eq("communaute_id", current.get("communaute")!);
      }
      if (current.get("quartier")) {
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
  let searchDebounce: number | undefined;
  searchEl.addEventListener("input", () => {
    if (searchDebounce !== undefined) window.clearTimeout(searchDebounce);
    searchDebounce = window.setTimeout(() => {
      persistFilters(true);
      void loadRows();
    }, 260);
  });
  container.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-open-fidele]");
    if (button?.dataset.openFidele) navigateToFaithful(button.dataset.openFidele);
  });

  mountFaithfulCreateWizard(container, context, activeYear, () => void loadRows());
  void loadRows();
}


type CardColorKey = "rose" | "bleu" | "lavande" | "sauge" | "or";
const CARD_COLORS: { key: CardColorKey; label: string; gradient: string; swatch: string }[] = [
  { key: "rose", label: "Rose poudré", gradient: "linear-gradient(135deg,#fff1f5 0%,#fbcfe8 52%,#fdf2f8 100%)", swatch: "linear-gradient(135deg,#fff1f5,#f9a8d4)" },
  { key: "bleu", label: "Bleu céleste", gradient: "linear-gradient(135deg,#eff6ff 0%,#bfdbfe 52%,#f8fbff 100%)", swatch: "linear-gradient(135deg,#eff6ff,#93c5fd)" },
  { key: "lavande", label: "Lavande", gradient: "linear-gradient(135deg,#f5f3ff 0%,#ddd6fe 52%,#faf5ff 100%)", swatch: "linear-gradient(135deg,#f5f3ff,#c4b5fd)" },
  { key: "sauge", label: "Vert sauge", gradient: "linear-gradient(135deg,#f0fdf4 0%,#bbf7d0 52%,#f7fef9 100%)", swatch: "linear-gradient(135deg,#f0fdf4,#86efac)" },
  { key: "or", label: "Or doux", gradient: "linear-gradient(135deg,#fffbeb 0%,#fde68a 52%,#fffdf4 100%)", swatch: "linear-gradient(135deg,#fffbeb,#fcd34d)" }
];

function renderCardColorChoices(selected: string, inputName: string): string {
  return CARD_COLORS.map((item) => {
    const active = item.key === selected;
    return '<label class="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border ' +
      (active ? 'border-slate-800 ring-2 ring-slate-300' : 'border-slate-200') +
      ' p-2 text-center transition hover:border-slate-400"><input class="sr-only" type="radio" name="' +
      escapeHtml(inputName) + '" value="' + item.key + '" ' + (active ? 'checked' : '') +
      ' aria-label="' + escapeHtml(item.label) + '" /><span class="h-8 w-8 rounded-full border border-black/10 shadow-inner" style="background:' +
      item.swatch + '"></span><span class="text-[10px] font-medium leading-tight text-slate-600">' +
      escapeHtml(item.label) + '</span></label>';
  }).join("");
}

function mountFaithfulCreateWizard(
  container: HTMLElement,
  context: UserContext,
  activeYear: ActivePastoralYear | null,
  onCreated: () => void
): void {
  const addButton = container.querySelector<HTMLButtonElement>("#add-faithful");
  const root = container.querySelector<HTMLElement>("#faithful-create-modal-root");
  if (!addButton || !root) return;
  const assignment = context.assignments.find((item) => item.role === "secretaire" || item.role === "cure");
  if (!assignment) {
    addButton.disabled = true;
    addButton.title = "L’inscription d’un fidèle avec son baptême est réservée à la secrétaire et au curé.";
    addButton.classList.add("cursor-not-allowed", "opacity-50");
    return;
  }
  const db = getSupabaseClient();
  const parishId = assignment.paroisse_id;
  let loading = false;

  const labelClass = "text-xs font-medium text-slate-600";
  const inputClass = "mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm";
  const selectClass = "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm";
  const buildSacrementFields = (prefix: string, optional: boolean): string => {
    const check = optional ? '<label class="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><input id="enable-' + prefix + '" type="checkbox" class="rounded border-slate-300" /> Ajouter ' + (prefix === "new-eucharistie" ? "l’Eucharistie" : "la Confirmation") + '</label>' : "";
    return check + '<fieldset id="' + prefix + '-fieldset" ' + (optional ? "disabled" : "") + ' class="space-y-3 ' + (optional ? "rounded-xl border border-slate-100 p-3" : "") + '">' +
      '<div><p class="mb-2 text-xs font-semibold text-slate-600">Date</p>' + partialDateFields(prefix) + '</div>' +
      '<div class="grid gap-3 sm:grid-cols-2"><label class="' + labelClass + '">Lieu<input name="' + prefix + '-lieu" maxlength="160" class="' + inputClass + '" /></label>' +
      '<label class="' + labelClass + '">Ministre<input name="' + prefix + '-ministre" maxlength="160" class="' + inputClass + '" /></label>' +
      '<label class="' + labelClass + '">N° d’acte<input name="' + prefix + '-acte" maxlength="80" required class="' + inputClass + '" /></label>' +
      '<label class="' + labelClass + ' sm:col-span-2">Parrain/marraine<input name="' + prefix + '-parrain-marraine" maxlength="160" class="' + inputClass + '" /></label>' +
      '<label class="' + labelClass + '">Visa / observation<input name="' + prefix + '-visa" maxlength="160" class="' + inputClass + '" /></label></div></fieldset>';
  };

  const childCard = (index: number): string => {
    return '<article class="faithful-child-entry rounded-xl border border-slate-200 bg-white p-4" data-child-index="' + index + '">' +
      '<div class="mb-3 flex items-center justify-between gap-2"><h4 class="text-sm font-semibold text-slate-800">Enfant ' + (index + 1) + '</h4><button type="button" data-remove-child class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">Retirer</button></div>' +
      '<div class="grid gap-3 sm:grid-cols-2"><label class="' + labelClass + '">Prénom<input data-child-field="prenom" maxlength="100" class="' + inputClass + '" /></label><label class="' + labelClass + '">Nom<input data-child-field="nom" maxlength="100" class="' + inputClass + '" /></label></div>' +
      '<div class="mt-3"><p class="mb-2 text-xs font-semibold text-slate-600">Naissance</p>' + partialDateFields("child-" + index + "-birth") + '</div>' +
      '<div class="mt-3 grid gap-3 sm:grid-cols-2"><label class="' + labelClass + '">Statut du baptême<select data-child-field="statut_bapteme" class="' + selectClass + '"><option value="inconnu">Inconnu</option><option value="baptise">Baptisé</option><option value="non_baptise">Non baptisé</option></select></label>' +
      '<label class="' + labelClass + '">Confession<select data-child-field="confession" class="' + selectClass + '"><option value="inconnue">Inconnue</option><option value="catholique">Catholique</option><option value="non_catholique">Non catholique</option></select></label></div>' +
      '<div class="mt-3"><p class="mb-2 text-xs font-semibold text-slate-600">Baptême de l’enfant</p>' + partialDateFields("child-" + index + "-baptism") + '</div>' +
      '<div class="mt-3 grid gap-3 sm:grid-cols-2"><label class="' + labelClass + '">Lieu de baptême<input data-child-field="lieu_bapteme" maxlength="160" class="' + inputClass + '" /></label>' +
      '<label class="' + labelClass + '">N° d’acte<input data-child-field="numero_acte" maxlength="80" class="' + inputClass + '" /></label><label class="' + labelClass + '">Page du registre<input data-child-field="page_registre" maxlength="80" class="' + inputClass + '" /></label></div></article>';
  };

  addButton.addEventListener("click", async () => {
    if (loading) return;
    loading = true;
    addButton.disabled = true;
    const originalLabel = addButton.textContent;
    addButton.textContent = "Préparation…";
    try {
      const [yearsResult, communitiesResult, quartiersResult] = await Promise.all([
        db.from("annees_pastorales").select("id,libelle,date_debut,date_fin,active").eq("paroisse_id", parishId).order("date_debut", { ascending: false }),
        db.from("communautes").select("id,nom,active,quartier_id").eq("paroisse_id", parishId).eq("active", true).order("nom"),
        db.from("quartiers").select("id,nom").eq("paroisse_id", parishId).order("nom")
      ]);
      if (yearsResult.error) throw yearsResult.error;
      if (communitiesResult.error) throw communitiesResult.error;
      if (quartiersResult.error) throw quartiersResult.error;
      const years = yearsResult.data ?? [];
      const communities = communitiesResult.data ?? [];
      const quartiers = quartiersResult.data ?? [];
      if (!years.length) throw new Error("Crée d’abord une année pastorale dans Paramètres avant d’enregistrer un fidèle.");
      if (!communities.length) throw new Error("Aucune communauté active n’est disponible pour cette paroisse.");
      const quartierOptions = '<option value="">Choisir un quartier…</option>' + quartiers.map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.nom) + '</option>').join("");
      const communityOptions = '<option value="">Choisir une communauté…</option>' + communities.map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.nom) + '</option>').join("");
      root.innerHTML =
        '<div id="faithful-create-overlay" class="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="faithful-create-title">' +
        '<div class="mx-auto my-2 w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl sm:my-6">' +
        '<header class="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-rose-50 via-white to-pink-50 p-5 sm:p-6"><div><p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">Nouveau dossier paroissial</p><h2 id="faithful-create-title" class="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">Ajouter un fidèle</h2><p id="faithful-wizard-progress" class="mt-1 text-sm text-slate-500">Étape 1 sur 3 · Identité</p></div><button id="faithful-create-close" type="button" class="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">✕</button></header>' +
        '<form id="faithful-create-form" class="space-y-5 p-5 sm:p-6" novalidate>' +
        '<section data-wizard-step="1" class="space-y-4"><div class="rounded-xl border border-slate-100 p-4"><h3 class="font-semibold text-slate-800">Identité et appartenance</h3><div class="mt-3 grid gap-3 sm:grid-cols-2">' +
        '<label class="' + labelClass + '">Prénom *<input name="prenom" required maxlength="100" class="' + inputClass + '" /></label><label class="' + labelClass + '">Nom *<input name="nom" required maxlength="100" class="' + inputClass + '" /></label>' +
        '<label class="' + labelClass + '">Sexe *<select name="sexe" required class="' + selectClass + '"><option value="">Choisir…</option><option value="masculin">Masculin</option><option value="feminin">Féminin</option></select></label>' +
        '<label class="' + labelClass + '">Quartier *<select name="quartier_id" required class="' + selectClass + '"><option value="">Choisir un quartier…</option>' + quartiers.map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.nom) + '</option>').join("") + '</select></label>' +
        '<label class="' + labelClass + '">Communauté actuelle *<select name="communaute_id" required class="' + selectClass + '"><option value="">Choisir une communauté…</option>' + communityOptions + '</select></label>' +
        '<label class="' + labelClass + '">Membre depuis<input name="communaute_depuis" type="date" class="' + inputClass + '" /></label><label class="' + labelClass + '">Lieu de naissance<input name="lieu_naissance" maxlength="160" class="' + inputClass + '" /></label></div>' +
        '<div class="mt-4"><p class="mb-2 text-xs font-semibold text-slate-600">Date de naissance</p>' + partialDateFields("new-birth") + '</div></div>' +
        '<div class="rounded-xl border border-slate-100 p-4"><h3 class="font-semibold text-slate-800">Parents</h3><div class="mt-3 grid gap-3 sm:grid-cols-2"><label class="' + labelClass + '">Nom du père<input name="nom_pere" maxlength="160" class="' + inputClass + '" /></label><label class="' + labelClass + '">Nom de la mère<input name="nom_mere" maxlength="160" class="' + inputClass + '" /></label></div></div>' +
        '<div class="rounded-xl border border-slate-100 p-4"><h3 class="font-semibold text-slate-800">Statut de vie</h3><label class="' + labelClass + ' mt-3 block">Statut<select id="new-status" name="statut" class="' + selectClass + '"><option value="vivant">Vivant</option><option value="decede">Décédé</option></select></label><fieldset id="new-death-fields" disabled class="mt-3 rounded-xl bg-slate-50 p-3"><p class="mb-2 text-xs font-semibold text-slate-600">Date de décès (si connue)</p>' + partialDateFields("new-death") + '</fieldset></div>' +
        '<div class="rounded-xl border border-slate-100 p-4"><h3 class="font-semibold text-slate-800">Couleur de la carte</h3><p class="mt-1 text-xs text-slate-500">Cinq couleurs maximum ; le rose poudré est appliqué par défaut.</p><div class="mt-3 grid grid-cols-5 gap-2">' + renderCardColorChoices("rose", "carte_couleur") + '</div></div></section>' +
        '<section data-wizard-step="2" class="hidden space-y-4"><div class="rounded-xl border border-rose-100 bg-rose-50/40 p-4"><h3 class="font-semibold text-slate-900">Baptême · obligatoire</h3><p class="mt-1 text-xs leading-5 text-slate-600">Le fidèle et son baptême seront enregistrés ensemble. Le numéro d’acte et la page sont requis.</p><div class="mt-4">' + buildSacrementFields("new-bapteme", false) + '</div></div>' +
        '<div class="rounded-xl border border-slate-100 p-4"><h3 class="mb-3 font-semibold text-slate-800">Autres sacrements (facultatifs)</h3>' + buildSacrementFields("new-eucharistie", true) + '<div class="my-4 border-t border-slate-100"></div>' + buildSacrementFields("new-confirmation", true) + '</div></section>' +
        '<section data-wizard-step="3" class="hidden space-y-4"><div class="rounded-xl border border-slate-100 p-4"><div class="flex items-start justify-between gap-3"><div><h3 class="font-semibold text-slate-800">Enfants</h3><p class="mt-1 text-xs text-slate-500">Ajoute uniquement les enfants dont tu connais les informations.</p></div><button id="faithful-add-child" type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">＋ Ajouter un enfant</button></div><div id="faithful-child-list" class="mt-3 space-y-3"></div><p class="mt-2 text-[11px] text-slate-400">Les emplacements laissés vides ne sont pas enregistrés.</p></div>' +
        '<div class="rounded-xl border border-slate-100 p-4"><label class="flex items-center gap-2 text-sm font-semibold text-slate-800"><input id="enable-marriage" type="checkbox" class="rounded border-slate-300" /> Enregistrer un événement matrimonial</label><fieldset id="new-marriage-fields" disabled class="mt-4 space-y-3">' +
        '<div class="grid gap-3 sm:grid-cols-2"><label class="' + labelClass + '">Type d’événement<select name="marriage_type" class="' + selectClass + '"><option value="post_baptismum">Mariage après baptême</option><option value="ante_baptismum">Mention avant baptême</option><option value="novas_nuptias">Nouvelles noces</option><option value="obiit_conjux">Décès du conjoint</option></select></label><label class="' + labelClass + '">Nom du conjoint<input name="marriage_spouse" maxlength="160" class="' + inputClass + '" /></label></div>' +
        '<div><p class="mb-2 text-xs font-semibold text-slate-600">Date de l’événement</p>' + partialDateFields("new-marriage") + '</div>' +
        '<div class="grid gap-3 sm:grid-cols-2"><label class="' + labelClass + '">Lieu<input name="marriage_lieu" maxlength="160" class="' + inputClass + '" /></label><label class="' + labelClass + '">Ministre<input name="marriage_ministre" maxlength="160" class="' + inputClass + '" /></label><label class="' + labelClass + '">N° d’acte<input name="marriage_acte" maxlength="80" class="' + inputClass + '" /></label><label class="' + labelClass + '">Visa / observation<input name="marriage_visa" maxlength="160" class="' + inputClass + '" /></label><label class="' + labelClass + '">Lieu de baptême du conjoint<input name="marriage_spouse_baptism_place" maxlength="160" class="' + inputClass + '" /></label></div>' +
        '<div><p class="mb-2 text-xs font-semibold text-slate-600">Baptême du conjoint (facultatif)</p>' + partialDateFields("new-spouse-baptism") + '</div>' +
        '<fieldset id="new-marriage-spouse-death-fields" disabled class="rounded-xl bg-slate-50 p-3"><p class="mb-2 text-xs font-semibold text-slate-600">Date de décès du conjoint pour ce type d’événement</p>' + partialDateFields("new-marriage-death") + '</fieldset></fieldset></div></section>' +
        '<div id="faithful-create-feedback" class="hidden rounded-xl p-3 text-sm" role="status"></div><footer class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><button id="faithful-create-cancel" type="button" class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600">Annuler</button><div class="flex gap-2"><button id="faithful-wizard-back" type="button" class="hidden rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600">Retour</button><button id="faithful-wizard-next" type="button" class="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Continuer</button><button id="faithful-wizard-save" type="submit" class="hidden rounded-lg bg-[var(--enoria-green)] px-4 py-2.5 text-sm font-semibold text-white">Enregistrer le dossier</button></div></footer></form></div></div>';

      const overlay = root.querySelector<HTMLElement>("#faithful-create-overlay")!;
      const form = root.querySelector<HTMLFormElement>("#faithful-create-form")!;
      bindNeighborhoodCommunity(form, "quartier_id", "communaute_id", communities);
      const feedback = root.querySelector<HTMLElement>("#faithful-create-feedback")!;
      const progress = root.querySelector<HTMLElement>("#faithful-wizard-progress")!;
      const next = root.querySelector<HTMLButtonElement>("#faithful-wizard-next")!;
      const back = root.querySelector<HTMLButtonElement>("#faithful-wizard-back")!;
      const save = root.querySelector<HTMLButtonElement>("#faithful-wizard-save")!;
      const close = (): void => {
        root.innerHTML = "";
        addButton.disabled = false;
        addButton.textContent = originalLabel;
        loading = false;
      };
      let step = 1;
      const setStep = (value: number): void => {
        step = Math.min(3, Math.max(1, value));
        root.querySelectorAll<HTMLElement>("[data-wizard-step]").forEach((node) => node.classList.toggle("hidden", Number(node.dataset.wizardStep) !== step));
        progress.textContent = step === 1 ? "Étape 1 sur 3 · Identité" : step === 2 ? "Étape 2 sur 3 · Sacrements" : "Étape 3 sur 3 · Famille";
        back.classList.toggle("hidden", step === 1);
        next.classList.toggle("hidden", step === 3);
        save.classList.toggle("hidden", step !== 3);
        feedback.classList.add("hidden");
      };
      root.querySelector<HTMLButtonElement>("#faithful-create-close")!.addEventListener("click", close);
      root.querySelector<HTMLButtonElement>("#faithful-create-cancel")!.addEventListener("click", close);
      overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
      back.addEventListener("click", () => setStep(step - 1));
      next.addEventListener("click", () => {
        const current = root.querySelector<HTMLElement>('[data-wizard-step="' + step + '"]')!;
        const invalid = [...current.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea")].find((item) => !item.disabled && !item.checkValidity());
        if (invalid) { invalid.reportValidity(); return; }
        setStep(step + 1);
      });

      const datePrefixes = ["new-birth","new-death","new-bapteme","new-eucharistie","new-confirmation","new-marriage","new-spouse-baptism","new-marriage-death"];
      for (const prefix of datePrefixes) {
        const precision = form.querySelector<HTMLSelectElement>("#" + prefix + "-precision");
        if (precision) precision.value = "inconnue";
        bindPartialDate(form, prefix);
      }
      const deathFields = root.querySelector<HTMLFieldSetElement>("#new-death-fields")!;
      root.querySelector<HTMLSelectElement>("#new-status")!.addEventListener("change", (event) => { deathFields.disabled = (event.currentTarget as HTMLSelectElement).value !== "decede"; });
      for (const prefix of ["new-eucharistie","new-confirmation"]) {
        const checkbox = root.querySelector<HTMLInputElement>("#enable-" + prefix)!;
        const fieldset = root.querySelector<HTMLFieldSetElement>("#" + prefix + "-fieldset")!;
        checkbox.addEventListener("change", () => { fieldset.disabled = !checkbox.checked; });
      }
      const marriageCheck = root.querySelector<HTMLInputElement>("#enable-marriage")!;
      const marriageFields = root.querySelector<HTMLFieldSetElement>("#new-marriage-fields")!;
      const spouseDeathFields = root.querySelector<HTMLFieldSetElement>("#new-marriage-spouse-death-fields")!;
      const marriageType = form.querySelector<HTMLSelectElement>('select[name="marriage_type"]')!;
      const syncSpouseDeath = (): void => {
        const isDeath = marriageCheck.checked && marriageType.value === "obiit_conjux";
        spouseDeathFields.disabled = !isDeath;
        if (isDeath) {
          const p = form.querySelector<HTMLSelectElement>("#new-marriage-death-precision")!;
          p.value = "exacte";
          bindPartialDate(form, "new-marriage-death");
        }
      };
      marriageCheck.addEventListener("change", () => { marriageFields.disabled = !marriageCheck.checked; syncSpouseDeath(); });
      marriageType.addEventListener("change", syncSpouseDeath);

      const childList = root.querySelector<HTMLElement>("#faithful-child-list")!;
      let nextChildIndex = 0;
      const addChild = (): void => {
        if (childList.querySelectorAll(".faithful-child-entry").length >= 5) {
          feedback.textContent = "Le formulaire initial prévoit au maximum cinq emplacements pour les enfants.";
          feedback.className = "rounded-xl bg-amber-50 p-3 text-sm text-amber-800";
          feedback.classList.remove("hidden");
          return;
        }
        const index = nextChildIndex++;
        childList.insertAdjacentHTML("beforeend", childCard(index));
        for (const prefix of ["child-" + index + "-birth","child-" + index + "-baptism"]) {
          form.querySelector<HTMLSelectElement>("#" + prefix + "-precision")!.value = "inconnue";
          bindPartialDate(form, prefix);
        }
      };
      root.querySelector<HTMLButtonElement>("#faithful-add-child")!.addEventListener("click", addChild);
      childList.addEventListener("click", (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-remove-child]");
        if (!button) return;
        button.closest(".faithful-child-entry")?.remove();
        [...childList.querySelectorAll<HTMLElement>(".faithful-child-entry")].forEach((node, index) => {
          node.querySelector("h4")!.textContent = "Enfant " + (index + 1);
        });
      });

      const dateValue = (prefix: string): PartialDateValues => collectPartialDate(form, prefix);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (loading) return;
        const invalid = [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea")].find((item) => !item.disabled && !item.checkValidity());
        if (invalid) {
          const owner = invalid.closest<HTMLElement>("[data-wizard-step]");
          if (owner) setStep(Number(owner.dataset.wizardStep));
          invalid.reportValidity();
          return;
        }
        loading = true;
        save.disabled = true;
        save.textContent = "Enregistrement…";
        try {
          const values = new FormData(form);
          const birth = dateValue("new-birth");
          const status = String(values.get("statut") ?? "vivant");
          const death = status === "decede" ? dateValue("new-death") : { precision: "inconnue" as Precision, jour: null, mois: null, annee: null };
          const baptismDate = dateValue("new-bapteme");
          const baptism = {
            annee_pastorale_id: resolvePastoralYearId(baptismDate, years, activeYear?.id),
            communaute_historique_id: String(values.get("communaute_id") ?? ""),
            precision: baptismDate.precision, jour: baptismDate.jour, mois: baptismDate.mois, annee: baptismDate.annee,
            lieu: String(values.get("new-bapteme-lieu") ?? "").trim(),
            numero_acte: String(values.get("new-bapteme-acte") ?? "").trim(),
            page_registre: null,
            ministre: String(values.get("new-bapteme-ministre") ?? "").trim(),
            parrain: String(values.get("new-bapteme-parrain-marraine") ?? "").trim() || null,
            marraine: null,
            visa: String(values.get("new-bapteme-visa") ?? "").trim()
          };
          const sacrements: Json[] = [];
          for (const prefix of ["new-eucharistie","new-confirmation"]) {
            if (!root.querySelector<HTMLInputElement>("#enable-" + prefix)!.checked) continue;
            const date = dateValue(prefix);
            sacrements.push({
              type: prefix === "new-eucharistie" ? "eucharistie" : "confirmation",
              annee_pastorale_id: resolvePastoralYearId(date, years, activeYear?.id),
              communaute_historique_id: String(values.get("communaute_id") ?? ""),
              precision: date.precision, jour: date.jour, mois: date.mois, annee: date.annee,
              lieu: String(values.get(prefix + "-lieu") ?? "").trim(),
              numero_acte: String(values.get(prefix + "-acte") ?? "").trim(),
              page_registre: null,
              ministre: String(values.get(prefix + "-ministre") ?? "").trim(),
              parrain: String(values.get(prefix + "-parrain-marraine") ?? "").trim() || null,
              marraine: null,
              visa: String(values.get(prefix + "-visa") ?? "").trim()
            });
          }
          const children: Json[] = [];
          for (const card of [...childList.querySelectorAll<HTMLElement>(".faithful-child-entry")]) {
            const value = (name: string): string => card.querySelector<HTMLInputElement | HTMLSelectElement>('[data-child-field="' + name + '"]')?.value.trim() ?? "";
            const prenom = value("prenom"), nom = value("nom");
            if (!prenom && !nom) continue;
            if (!prenom || !nom) throw new Error("Pour chaque enfant saisi, le prénom et le nom sont obligatoires.");
            const index = card.dataset.childIndex ?? "0";
            const birthDate = collectPartialDate(form, "child-" + index + "-birth");
            const baptismDateForChild = collectPartialDate(form, "child-" + index + "-baptism");
            const act = value("numero_acte"), page = value("page_registre");
            if ((!act && page) || (act && !page)) throw new Error("Pour le baptême d’un enfant, renseigne à la fois le numéro d’acte et la page.");
            children.push({
              prenom, nom, naissance_jour: birthDate.jour, naissance_mois: birthDate.mois, naissance_annee: birthDate.annee, naissance_precision: birthDate.precision,
              lieu_bapteme: value("lieu_bapteme") || null,
              bapteme_jour: baptismDateForChild.jour, bapteme_mois: baptismDateForChild.mois, bapteme_annee: baptismDateForChild.annee, bapteme_precision: baptismDateForChild.precision,
              numero_acte: act || null, page_registre: page || null, statut_bapteme: value("statut_bapteme") || "inconnu", confession: value("confession") || "inconnue"
            });
          }
          const mariages: Json[] = [];
          if (marriageCheck.checked) {
            const date = dateValue("new-marriage");
            const type = String(values.get("marriage_type") ?? "post_baptismum");
            const act = String(values.get("marriage_acte") ?? "").trim();
            const spouseBaptism = dateValue("new-spouse-baptism");
            const spouseDeath = type === "obiit_conjux" ? dateValue("new-marriage-death") : { precision: "inconnue" as Precision, jour: null, mois: null, annee: null };
            mariages.push({
              type, annee_pastorale_id: resolvePastoralYearId(date, years, activeYear?.id), communaute_historique_id: String(values.get("communaute_id") ?? ""),
              precision: date.precision, jour: date.jour, mois: date.mois, annee: date.annee,
              lieu: String(values.get("marriage_lieu") ?? "").trim() || null, numero_acte: act || null, page_registre: null,
              conjoint_nom: String(values.get("marriage_spouse") ?? "").trim() || null,
              conjoint_lieu_bapteme: String(values.get("marriage_spouse_baptism_place") ?? "").trim() || null,
              conjoint_bapteme_jour: spouseBaptism.jour, conjoint_bapteme_mois: spouseBaptism.mois, conjoint_bapteme_annee: spouseBaptism.annee, conjoint_bapteme_precision: spouseBaptism.precision,
              deces_conjoint_jour: spouseDeath.jour, deces_conjoint_mois: spouseDeath.mois, deces_conjoint_annee: spouseDeath.annee, deces_conjoint_precision: spouseDeath.precision,
              ministre: String(values.get("marriage_ministre") ?? "").trim() || null, visa: String(values.get("marriage_visa") ?? "").trim() || null
            });
          }
          const color = form.querySelector<HTMLInputElement>('input[name="carte_couleur"]:checked')?.value ?? "rose";
          const payload = {
            paroisse_id: parishId, communaute_id: String(values.get("communaute_id") ?? ""),
            communaute_depuis: String(values.get("communaute_depuis") ?? "") || null,
            prenom: String(values.get("prenom") ?? "").trim(), nom: String(values.get("nom") ?? "").trim(), sexe: String(values.get("sexe") ?? ""),
            naissance_jour: birth.jour, naissance_mois: birth.mois, naissance_annee: birth.annee, naissance_precision: birth.precision,
            lieu_naissance: String(values.get("lieu_naissance") ?? "").trim() || null,
            nom_pere: String(values.get("nom_pere") ?? "").trim() || null, nom_mere: String(values.get("nom_mere") ?? "").trim() || null,
            statut: status, deces_jour: death.jour, deces_mois: death.mois, deces_annee: death.annee, deces_precision: death.precision,
            carte_couleur: color, bapteme: baptism, sacrements, mariages, enfants: children
          };
          const result = await db.rpc("enregistrer_fidele_baptise", { p_donnees: payload });
          if (result.error) throw result.error;
          if (!result.data) throw new Error("Aucun identifiant n’a été retourné après l’enregistrement.");
          const newId = result.data;
          close();
          onCreated();
          navigateToFaithful(newId);
        } catch (error) {
          feedback.textContent = error instanceof Error ? error.message : "L’enregistrement a échoué. Vérifie les informations.";
          feedback.className = "rounded-xl bg-rose-50 p-3 text-sm text-rose-700";
          feedback.classList.remove("hidden");
        } finally {
          loading = false;
          save.disabled = false;
          save.textContent = "Enregistrer le dossier";
        }
      });

      const currentQuartier = form.querySelector<HTMLSelectElement>('select[name="quartier_id"]')!;
      currentQuartier.value = communities[0]?.quartier_id ?? "";
      currentQuartier.dispatchEvent(new Event("change"));
      const currentCommunity = form.querySelector<HTMLSelectElement>('select[name="communaute_id"]')!;
      currentCommunity.value = communities.find((item) => item.quartier_id === currentQuartier.value)?.id ?? "";
      setStep(1);
      loading = false;
      form.querySelector<HTMLInputElement>('input[name="prenom"]')?.focus();
    } catch (error) {
      const fb = container.querySelector<HTMLElement>("#faithful-feedback");
      if (fb) { setFeedback(fb, error instanceof Error ? error.message : "Impossible de préparer le formulaire.", "error"); fb.classList.remove("hidden"); }
    } finally {
      if (!root.querySelector("#faithful-create-overlay")) {
        addButton.disabled = false;
        addButton.textContent = originalLabel;
        loading = false;
      }
    }
  });
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
): Promise<() => void> {
  container.querySelector<HTMLButtonElement>("#faithful-back")?.addEventListener("click", navigateBackFromFaithful);
  const livretModal = container.querySelector<HTMLElement>("#livret-modal");
  const livretStage = container.querySelector<HTMLElement>("#livret-3d-container");
  let currentBookletMarkup = "";
  const setLivretView = (): void => {
    if (livretStage) livretStage.dataset.v = "1";
  };
  const closeLivret = (): void => {
    livretModal?.classList.add("hidden");
    if (livretStage) livretStage.innerHTML = "";
    document.body.classList.remove("overflow-hidden");
    setLivretView();
  };
  const openLivret = (): void => {
    if (!livretModal || !livretStage) return;
    livretStage.innerHTML = currentBookletMarkup ||
      '<div class="spread"><section class="livret-page">Le livret n’est pas encore disponible.</section></div>';
    setLivretView();
    livretModal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
  };
  const handleLivretKeydown = (event: KeyboardEvent): void => {
    if (livretModal && !livretModal.classList.contains("hidden") && event.key === "Escape") {
      event.preventDefault();
      closeLivret();
    }
  };
  document.addEventListener("keydown", handleLivretKeydown);
  container.querySelector<HTMLButtonElement>("#close-livret-3d")?.addEventListener("click", closeLivret);
  container.querySelector<HTMLButtonElement>("#open-livret-3d")?.addEventListener("click", openLivret);
  livretModal?.addEventListener("click", (event) => {
    if (event.target === livretModal) closeLivret();
  });
  const disposeProfile = (): void => {
    closeLivret();
    document.removeEventListener("keydown", handleLivretKeydown);
  };
  const nameNode = container.querySelector<HTMLElement>("#profile-name");
  const subtitleNode = container.querySelector<HTMLElement>("#profile-subtitle");
  const contentNode = container.querySelector<HTMLElement>("#profile-content");
  const feedback = container.querySelector<HTMLElement>("#profile-feedback");
  if (!nameNode || !subtitleNode || !contentNode || !feedback) return closeLivret;
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
    const parishResult = await supabase.from("paroisses").select("nom").eq("id", faithfulRecord.paroisse_id).maybeSingle();
    if (parishResult.error) throw parishResult.error;
    const parishName = parishResult.data?.nom ?? getAppConfig().parishName;

    nameEl.textContent = `${faithfulRecord.prenom} ${faithfulRecord.nom}`;
    subtitleEl.textContent = `${faithfulRecord.sexe === "masculin" ? "Masculin" : faithfulRecord.sexe === "feminin" ? "Féminin" : "Sexe non précisé"} · ${faithfulRecord.statut === "decede" ? "Décédé" : "Vivant"}`;

    const tabs = [...container.querySelectorAll<HTMLButtonElement>("[data-tab]")];
    let tabSequence = 0;

    const canManageFaithful = context.roles.some((role) => role === "secretaire" || role === "cure");
    const renderGeneral = async (sequence: number): Promise<void> => {
      const sacramentResult = await supabase.from("sacrements")
        .select("id,type,jour,mois,annee,precision,lieu,numero_acte,parrain,marraine,ministre")
        .eq("fidele_id",faithfulRecord.id).order("annee",{ascending:true});
      if(sequence!==tabSequence)return;
      if(sacramentResult.error)throw sacramentResult.error;
      const sacraments=sacramentResult.data??[];
      const byType=new Map(sacraments.map(item=>[item.type,item]));
      const baptism=byType.get("bapteme");
      const eucharist=byType.get("eucharistie");
      const confirmation=byType.get("confirmation");
      const paper=CARD_COLORS.find(item=>item.key===faithfulRecord.carte_couleur)?.gradient??CARD_COLORS[0].gradient;
      const birthDate=formatPartialDate(faithfulRecord.naissance_jour,faithfulRecord.naissance_mois,faithfulRecord.naissance_annee,faithfulRecord.naissance_precision);
      const line=(label:string,value:unknown):string=>'<div class="l"><span class="k">'+escapeHtml(label)+'</span><span class="v">'+escapeHtml(value??"")+'</span></div>';
      const pair=(first:string,second:string):string=>'<div class="row2">'+first+second+'</div>';
      const heading=(title:string,place:unknown):string=>'<div class="livret-section-heading"><strong>'+title+'</strong><span class="v">'+escapeHtml(place??"")+'</span></div>';
      const dateLine=(record:typeof baptism,withNumber:boolean):string=>{
        const value=record?formatPartialDate(record.jour,record.mois,record.annee,record.precision):"";
        return withNumber?pair(line("die",value),line("n°",record?.numero_acte??"")):line("die",value);
      };
      const ministerLine=(record:typeof baptism):string=>line("Quod testor ego",record?.ministre??"");
      const sponsors=[baptism?.parrain,baptism?.marraine].filter((value):value is string=>Boolean(value?.trim())).join(" / ");
      const coverPage=
        '<section class="livret-page cover" style="--paper:'+paper+'">'+
          '<div class="cover-diocese"><span>DIOCESE</span><span>DE</span><span>GOMA</span></div>'+
          '<div class="cover-country">RÉPUBLIQUE DÉMOCRATIQUE<br>DU CONGO</div>'+
          '<hr class="cover-rule"><div class="cover-parish-label">PAROISSE</div>'+
          '<div class="cover-parish">'+escapeHtml(parishName)+'</div><hr class="cover-rule cover-rule-bottom">'+
        '</section>';
      const identityPage=
        '<section class="livret-page identity" style="--paper:'+paper+'">'+
          '<h3>IDENTITAS</h3>'+
          line("Nomen",faithfulRecord.prenom)+line("Nomen",faithfulRecord.nom)+
          line("Pater",faithfulRecord.nom_pere)+line("Mater",faithfulRecord.nom_mere)+
          pair(line("Nat. In",faithfulRecord.lieu_naissance),line("die",birthDate))+
          '<hr>'+heading("BAPTISMUM",baptism?.lieu)+dateLine(baptism,true)+line("Suscepit",sponsors)+ministerLine(baptism)+
          '<hr>'+heading("EUCARISTIA",eucharist?.lieu)+dateLine(eucharist,false)+ministerLine(eucharist)+
          '<hr>'+heading("CONFIRMATIO",confirmation?.lieu)+dateLine(confirmation,true)+ministerLine(confirmation)+
        '</section>';
      currentBookletMarkup='<div class="spread" id="s1">'+coverPage+identityPage+'</div>';
      contentEl.innerHTML=`
        <div class="space-y-3">
          <section class="page-card p-4 sm:p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div><p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Dossier paroissial</p>
                <h2 class="mt-1 text-base font-semibold text-slate-900">${escapeHtml(faithfulRecord.prenom)} ${escapeHtml(faithfulRecord.nom)}</h2>
                <p class="mt-0.5 text-xs text-slate-500">${escapeHtml(community?.nom??"Communauté inconnue")} · ${faithfulRecord.statut==="decede"?"Décédé":"Vivant"}</p></div>
              ${canManageFaithful?'<button type="button" id="faithful-meta-toggle" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Modifier statut / couleur</button>':""}
            </div>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <div class="rounded-lg bg-slate-50 p-2.5"><p class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Sacrements</p><p class="mt-0.5 text-xs font-medium text-slate-800">${sacraments.length} enregistré(s)</p></div>
              <div class="rounded-lg bg-slate-50 p-2.5"><p class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Paroisse</p><p class="mt-0.5 text-xs font-medium text-slate-800">${escapeHtml(parishName)}</p></div>
            </div>
            <button type="button" data-open-booklet class="mt-3 flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50/40">
              <span><span class="block text-sm font-semibold text-slate-900">Ouvrir le livret paroissial</span><span class="mt-0.5 block text-[11px] text-slate-500">Couverture et identité sacramentelle · deux colonnes</span></span>
              <span class="grid h-11 w-24 shrink-0 grid-cols-2 overflow-hidden rounded border border-stone-500 bg-amber-50 text-[7px] text-stone-600"><span class="border-r border-stone-500 p-1">DIOCÈSE</span><span class="p-1">IDENTITAS</span></span>
            </button>
          </section>
          ${canManageFaithful?`
          <form id="faithful-meta-form" class="hidden rounded-xl border border-slate-200 bg-white p-4">
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="text-xs font-medium text-slate-600">Statut de vie<select id="profile-status" name="statut" class="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="vivant" ${faithfulRecord.statut==="vivant"?"selected":""}>Vivant</option><option value="decede" ${faithfulRecord.statut==="decede"?"selected":""}>Décédé</option></select></label>
              <div class="text-xs font-medium text-slate-600">Couleur de la carte<div class="mt-2 grid grid-cols-5 gap-2">${renderCardColorChoices(faithfulRecord.carte_couleur,"profile_carte_couleur")}</div></div>
            </div>
            <fieldset id="profile-death-fields" ${faithfulRecord.statut==="decede"?"":"disabled"} class="mt-3 rounded-xl bg-slate-50 p-3"><p class="mb-2 text-xs font-semibold text-slate-600">Date du décès (facultative si inconnue)</p>${partialDateFields("profile-death")}</fieldset>
            <div class="mt-3 flex flex-wrap justify-end gap-2"><button type="button" id="faithful-meta-cancel" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">Annuler</button><button type="submit" class="rounded-lg bg-[var(--enoria-green)] px-3 py-2 text-xs font-semibold text-white">Enregistrer</button></div><p id="faithful-meta-feedback" class="mt-3 hidden rounded-lg p-3 text-sm" role="status"></p>
          </form>`:""}
        </div>`;
      contentEl.querySelector<HTMLButtonElement>("[data-open-booklet]")?.addEventListener("click",openLivret);
      if(canManageFaithful){
        const editor=contentEl.querySelector<HTMLFormElement>("#faithful-meta-form")!;
        const editorFeedback=editor.querySelector<HTMLElement>("#faithful-meta-feedback")!;
        const statusSelect=editor.querySelector<HTMLSelectElement>("#profile-status")!;
        const deathFields=editor.querySelector<HTMLFieldSetElement>("#profile-death-fields")!;
        const precision=editor.querySelector<HTMLSelectElement>("#profile-death-precision")!;
        editor.querySelector<HTMLInputElement>("#profile-death-day")!.value=faithfulRecord.deces_jour?.toString()??"";
        editor.querySelector<HTMLInputElement>("#profile-death-month")!.value=faithfulRecord.deces_mois?.toString()??"";
        editor.querySelector<HTMLInputElement>("#profile-death-year")!.value=faithfulRecord.deces_annee?.toString()??"";
        precision.value=faithfulRecord.deces_precision;
        bindPartialDate(editor,"profile-death");
        contentEl.querySelector<HTMLButtonElement>("#faithful-meta-toggle")!.addEventListener("click",()=>editor.classList.toggle("hidden"));
        editor.querySelector<HTMLButtonElement>("#faithful-meta-cancel")!.addEventListener("click",()=>editor.classList.add("hidden"));
        statusSelect.addEventListener("change",()=>{deathFields.disabled=statusSelect.value!=="decede";});
        editor.addEventListener("submit",async(event)=>{
          event.preventDefault();
          const submit=editor.querySelector<HTMLButtonElement>('button[type="submit"]')!;
          submit.disabled=true;submit.textContent="Enregistrement…";
          try{
            const nextStatus=statusSelect.value as "vivant"|"decede";
            const date=nextStatus==="decede"?collectPartialDate(editor,"profile-death"):{precision:"inconnue" as Precision,jour:null,mois:null,annee:null};
            const color=editor.querySelector<HTMLInputElement>('input[name="profile_carte_couleur"]:checked')?.value??"rose";
            const {data,error}=await supabase.from("fideles").update({statut:nextStatus,deces_jour:date.jour,deces_mois:date.mois,deces_annee:date.annee,deces_precision:date.precision,carte_couleur:color}).eq("id",faithfulRecord.id).select("*").single();
            if(error)throw error;
            Object.assign(faithfulRecord,data);
            subtitleEl.textContent=(faithfulRecord.sexe==="masculin"?"Masculin":"Féminin")+" · "+(faithfulRecord.statut==="decede"?"Décédé":"Vivant");
            await renderGeneral(sequence);
          }catch(error){
            editorFeedback.textContent=error instanceof Error?error.message:"Modification impossible.";
            editorFeedback.className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700";editorFeedback.classList.remove("hidden");
          }finally{submit.disabled=false;submit.textContent="Enregistrer";}
        });
      }
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
        await renderGeneral(sequence);
        return;
      }
      contentEl.innerHTML = '<div class="page-card p-6 text-sm text-slate-500">Chargement de cet onglet…</div>';
      try {
        if (tab === "sacrements") {
          const [sacramentResult, marriageResult, yearResult, communityResult, partnerResult] = await Promise.all([
            supabase.from("sacrements").select("*").eq("fidele_id", faithfulRecord.id).order("annee", { ascending: true }),
            supabase.from("evenements_matrimoniaux").select("*").or("fidele_id.eq." + faithfulRecord.id + ",conjoint_fidele_id.eq." + faithfulRecord.id).order("annee", { ascending: true }),
            supabase.from("annees_pastorales").select("id,libelle,date_debut,date_fin,active").eq("paroisse_id", faithfulRecord.paroisse_id).order("date_debut", { ascending: false }),
            supabase.from("communautes").select("id,nom,quartier_id").eq("paroisse_id", faithfulRecord.paroisse_id).order("nom"),
            supabase.from("fideles").select("id,prenom,nom").eq("paroisse_id", faithfulRecord.paroisse_id).order("nom").order("prenom").limit(1000)
          ]);
          if (sequence !== tabSequence) return;
          if (sacramentResult.error) throw sacramentResult.error;
          if (marriageResult.error) throw marriageResult.error;
          if (yearResult.error) throw yearResult.error;
          if (communityResult.error) throw communityResult.error;
          if (partnerResult.error) throw partnerResult.error;

          const sacramentRecords = sacramentResult.data ?? [];
          const marriageRecords = marriageResult.data ?? [];
          const years = yearResult.data ?? [];
          const communities = communityResult.data ?? [];
          const partners = partnerResult.data ?? [];
          const canWrite = context.roles.some((role) => role === "secretaire" || role === "cure");
          const sacramentLabels: Record<string,string> = { bapteme:"Baptême", eucharistie:"Eucharistie", confirmation:"Confirmation" };
          const marriageLabels: Record<string,string> = {
            ante_baptismum:"Mention avant baptême",
            post_baptismum:"Mariage célébré",
            obiit_conjux:"Décès du conjoint",
            novas_nuptias:"Nouvelles noces"
          };
          const partnerNames = new Map(partners.map((item) => [item.id,item.prenom + " " + item.nom]));
          const fieldLabel = "block text-xs font-medium text-slate-600";
          const fieldClass = "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm";
          const selected = (actual: string | null | undefined, value: string): string => actual === value ? "selected" : "";
          const lookupsReady = years.length > 0 && communities.some((item) => item.id === faithfulRecord.communaute_id);

          const initializePartialDate = (
            form: HTMLFormElement,
            prefix: string,
            value?: {precision:Precision;jour:number|null;mois:number|null;annee:number|null} | null
          ): void => {
            form.querySelector<HTMLInputElement>("#" + prefix + "-day")!.value = value?.jour?.toString() ?? "";
            form.querySelector<HTMLInputElement>("#" + prefix + "-month")!.value = value?.mois?.toString() ?? "";
            form.querySelector<HTMLInputElement>("#" + prefix + "-year")!.value = value?.annee?.toString() ?? "";
            form.querySelector<HTMLSelectElement>("#" + prefix + "-precision")!.value = value?.precision ?? "inconnue";
            bindPartialDate(form,prefix);
          };

          const sacramentFormHtml = (record?: Tables<"sacrements">): string => {
            const id = record?.id ?? "new";
            const prefix = "sacdate-" + id.replace(/[^a-zA-Z0-9]/g,"");
            const availableTypes = (["bapteme","eucharistie","confirmation"] as const).filter((type) =>
              !sacramentRecords.some((item) => item.type === type)
            );
            const typeControl = record
              ? '<input type="hidden" name="type" value="' + record.type + '" /><span class="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold">' + escapeHtml(sacramentLabels[record.type]) + '</span>'
              : '<label class="' + fieldLabel + '">Sacrement<select name="type" required class="' + fieldClass + '">' + availableTypes.map((type) => '<option value="' + type + '">' + escapeHtml(sacramentLabels[type]) + '</option>').join("") + '</select></label>';
            return '<form class="sacrament-editor mt-3 space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/30 p-4" data-record-id="' + escapeHtml(id) + '" data-date-prefix="' + escapeHtml(prefix) + '">' +
              '<div class="flex items-center justify-between gap-3"><h4 class="text-sm font-semibold text-slate-900">' + (record ? "Modifier " + escapeHtml(sacramentLabels[record.type]) : "Nouveau sacrement") + '</h4><span class="text-[10px] text-slate-500">' + (record ? "Modification" : "Création") + '</span></div>' +
              '<div class="grid gap-3 sm:grid-cols-2">' + typeControl +
                '<div class="text-xs text-slate-500 flex items-center">Année pastorale déterminée automatiquement à partir de la date.</div></div>' +
              '<div><p class="mb-2 text-xs font-semibold text-slate-600">Date du sacrement</p>' + partialDateFields(prefix) + '</div>' +
              '<div class="grid gap-3 sm:grid-cols-2">' +
                '<label class="' + fieldLabel + '">Lieu<input name="lieu" maxlength="160" value="' + escapeHtml(record?.lieu ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + '">Ministre<input name="ministre" maxlength="160" value="' + escapeHtml(record?.ministre ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + '">Numéro d’acte<input name="numero_acte" maxlength="80" value="' + escapeHtml(record?.numero_acte ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + '">Parrain/marraine<input name="parrain_marraine" maxlength="160" value="' + escapeHtml([record?.parrain, record?.marraine].filter((value) => Boolean(value?.trim())).join(" / ")) + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + ' sm:col-span-2">Visa / observation<input name="visa" maxlength="200" value="' + escapeHtml(record?.visa ?? "") + '" class="' + fieldClass + '" /></label>' +
              '</div><p class="text-[11px] leading-5 text-slate-500">La communauté et l’année pastorale sont renseignées automatiquement à partir du dossier et de la date de célébration. La page du registre n’est pas demandée.</p>' +
              '<p class="editor-feedback hidden rounded-lg p-3 text-sm" role="status"></p>' +
              '<div class="flex justify-end gap-2"><button type="button" data-cancel-editor class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">Annuler</button><button type="submit" class="rounded-lg bg-[var(--enoria-green)] px-4 py-2 text-xs font-semibold text-white">Enregistrer</button></div></form>';
          };

          const marriageFormHtml = (record?: Tables<"evenements_matrimoniaux">): string => {
            const id = record?.id ?? "new";
            const prefix = "marriage-" + id.replace(/[^a-zA-Z0-9]/g,"");
            const spouseBirthPrefix = prefix + "-bapt";
            const spouseDeathPrefix = prefix + "-death";
            const eventTypes: [string,string][] = [
              ["post_baptismum","Mariage célébré"],
              ["ante_baptismum","Mention avant baptême"],
              ["novas_nuptias","Nouvelles noces"],
              ["obiit_conjux","Décès du conjoint"]
            ];
            const typeOptions = eventTypes.map(([value,label]) => '<option value="' + value + '" ' + selected(record?.type,value) + '>' + label + '</option>').join("");
            const partnerName = record?.conjoint_fidele_id
              ? partnerNames.get(record.conjoint_fidele_id) ?? record.conjoint_nom ?? ""
              : record?.conjoint_nom ?? "";
            return '<form class="marriage-editor mt-3 space-y-4 rounded-xl border border-amber-100 bg-amber-50/30 p-4" data-record-id="' + escapeHtml(id) + '" data-date-prefix="' + escapeHtml(prefix) + '" data-baptism-prefix="' + escapeHtml(spouseBirthPrefix) + '" data-death-prefix="' + escapeHtml(spouseDeathPrefix) + '">' +
              '<div class="flex items-center justify-between gap-3"><h4 class="text-sm font-semibold text-slate-900">' + (record ? "Modifier l’événement matrimonial" : "Nouvel événement matrimonial") + '</h4><span class="text-[10px] text-slate-500">Mariage · liens de conjoints</span></div>' +
              '<div class="grid gap-3 sm:grid-cols-2">' +
                '<label class="' + fieldLabel + '">Nature de l’événement<select name="type" required class="' + fieldClass + '">' + typeOptions + '</select></label>' +
                '<label class="' + fieldLabel + '">Nom du conjoint<input name="conjoint_nom" maxlength="160" value="' + escapeHtml(partnerName) + '" class="' + fieldClass + '" /></label>' +
                '<div class="text-xs text-slate-500 flex items-center">Année pastorale déterminée automatiquement à partir de la date.</div>' +
              '</div>' +
              '<div><p class="mb-2 text-xs font-semibold text-slate-600">Date de l’événement matrimonial</p>' + partialDateFields(prefix) + '</div>' +
              '<div class="grid gap-3 sm:grid-cols-2">' +
                '<label class="' + fieldLabel + '">Lieu<input name="lieu" maxlength="160" value="' + escapeHtml(record?.lieu ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + '">Ministre<input name="ministre" maxlength="160" value="' + escapeHtml(record?.ministre ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + '">Numéro d’acte<input name="numero_acte" maxlength="80" value="' + escapeHtml(record?.numero_acte ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + ' sm:col-span-2">Lieu de baptême du conjoint<input name="conjoint_lieu_bapteme" maxlength="160" value="' + escapeHtml(record?.conjoint_lieu_bapteme ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + ' sm:col-span-2">Visa / observation<input name="visa" maxlength="200" value="' + escapeHtml(record?.visa ?? "") + '" class="' + fieldClass + '" /></label>' +
              '</div>' +
              '<div class="rounded-lg border border-slate-200 bg-white p-3"><p class="mb-2 text-xs font-semibold text-slate-700">Baptême du conjoint</p>' + partialDateFields(spouseBirthPrefix) + '</div>' +
              '<fieldset data-spouse-death-fields ' + (record?.type === "obiit_conjux" ? "" : "disabled") + ' class="rounded-lg border border-slate-200 bg-white p-3"><p class="mb-2 text-xs font-semibold text-slate-700">Date de décès du conjoint (si événement de décès)</p>' + partialDateFields(spouseDeathPrefix) + '</fieldset>' +
              '<p class="text-[11px] leading-5 text-slate-500">Le dossier concerné est celui du fidèle affiché. Le conjoint est conservé comme un nom, sans liaison avec un autre dossier.</p>' +
              '<p class="editor-feedback hidden rounded-lg p-3 text-sm" role="status"></p>' +
              '<div class="flex justify-end gap-2"><button type="button" data-cancel-editor class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">Annuler</button><button type="submit" class="rounded-lg bg-[var(--enoria-green)] px-4 py-2 text-xs font-semibold text-white">Enregistrer l’événement</button></div></form>';
          };

          const sacramentCards = sacramentRecords.map((item) => {
            const id = item.id;
            const label = sacramentLabels[item.type] ?? item.type;
            return '<article class="rounded-xl border border-slate-200 bg-white p-4">' +
              '<div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-semibold text-slate-900">' + escapeHtml(label) + '</h3>' +
              '<p class="mt-1 text-xs text-slate-500">' + escapeHtml(formatPartialDate(item.jour,item.mois,item.annee,item.precision)) + ' · Acte ' + escapeHtml(item.numero_acte ?? "—") + '</p>' +
              '<p class="mt-1 text-xs text-slate-600">Parrain/marraine : ' + escapeHtml([item.parrain,item.marraine].filter((value) => Boolean(value?.trim())).join(" / ") || "—") + '</p>' +
              '<p class="mt-1 text-[11px] text-slate-500">Ministre : ' + escapeHtml(item.ministre ?? "—") + ' · Visa : ' + escapeHtml(item.visa ?? "—") + '</p></div>' +
              (canWrite ? '<button type="button" data-edit-sacrament="' + escapeHtml(id) + '" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Modifier</button>' : "") + '</div>' +
              (canWrite ? '<div id="sacrament-editor-' + escapeHtml(id) + '" class="hidden">' + sacramentFormHtml(item) + '</div>' : "") + '</article>';
          }).join("");

          const marriagesHtml = marriageRecords.map((item) => {
            const isIncoming = item.fidele_id !== faithfulRecord.id;
            const partnerId = isIncoming ? item.fidele_id : item.conjoint_fidele_id;
            const spouseName = partnerId
              ? partnerNames.get(partnerId) ?? item.conjoint_nom ?? "Dossier du conjoint"
              : item.conjoint_nom ?? "Nom non renseigné";
            const spouseBirth = item.conjoint_bapteme_precision === "inconnue" ? "Non renseigné" : formatPartialDate(item.conjoint_bapteme_jour,item.conjoint_bapteme_mois,item.conjoint_bapteme_annee,item.conjoint_bapteme_precision);
            const spouseDeath = item.deces_conjoint_precision === "inconnue" ? "Non renseigné" : formatPartialDate(item.deces_conjoint_jour,item.deces_conjoint_mois,item.deces_conjoint_annee,item.deces_conjoint_precision);
            return '<article class="rounded-xl border border-amber-200 bg-white p-4">' +
              '<div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-semibold text-slate-900">' + escapeHtml(marriageLabels[item.type] ?? item.type) + '</h3>' +
              '<p class="mt-1 text-xs text-slate-500">' + escapeHtml(formatPartialDate(item.jour,item.mois,item.annee,item.precision)) + ' · ' + escapeHtml(item.lieu ?? "Lieu non renseigné") + '</p>' +
              '<p class="mt-1 text-xs text-slate-700">Conjoint : <strong>' + escapeHtml(spouseName) + '</strong></p>' +
              '<p class="mt-1 text-xs text-slate-500">Acte ' + escapeHtml(item.numero_acte ?? "—") + '</p>' +
              '<p class="mt-1 text-[11px] text-slate-500">Baptême du conjoint : ' + escapeHtml(spouseBirth) + (item.type === "obiit_conjux" ? ' · Décès : ' + escapeHtml(spouseDeath) : "") + '</p>' +
              '<p class="mt-1 text-[11px] text-slate-500">Ministre : ' + escapeHtml(item.ministre ?? "—") + ' · Visa : ' + escapeHtml(item.visa ?? "—") + (isIncoming ? ' · Visible via le dossier matrimonial lié' : "") + '</p></div>' +
              (canWrite && !isIncoming ? '<button type="button" data-edit-marriage="' + escapeHtml(item.id) + '" class="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-amber-50">Modifier</button>' : "") + '</div>' +
              (canWrite && !isIncoming ? '<div id="marriage-editor-' + escapeHtml(item.id) + '" class="hidden">' + marriageFormHtml(item) + '</div>' : "") + '</article>';
          }).join("");


          const availableTypes = (["bapteme","eucharistie","confirmation"] as const).filter((type) =>
            !sacramentRecords.some((item) => item.type === type)
          );
          contentEl.innerHTML = `
            <div class="space-y-5">
              <section class="page-card p-5">
                <div class="flex flex-wrap items-center justify-between gap-3"><div><p class="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Registre sacramentel</p><h2 class="mt-1 font-semibold text-slate-900">Sacrements reçus</h2><p class="mt-1 text-xs text-slate-500">Baptême, Eucharistie et Confirmation. Chaque entrée conserve sa date, ses témoins, son ministre et ses références.</p></div>${canWrite && availableTypes.length && lookupsReady ? '<button id="add-sacrament-toggle" type="button" class="rounded-lg bg-[var(--enoria-green)] px-3 py-2 text-xs font-semibold text-white">＋ Ajouter</button>' : ""}</div>
                <div id="new-sacrament-wrap" class="hidden">${canWrite && availableTypes.length && lookupsReady ? sacramentFormHtml() : ""}</div>
                ${!lookupsReady && canWrite ? '<p class="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Une année pastorale et une communauté doivent être disponibles pour gérer les sacrements.</p>' : ""}
                <div class="mt-4 space-y-3">${sacramentCards || '<p class="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Aucun sacrement enregistré.</p>'}</div>
              </section>
              <section class="page-card p-5">
                <div class="flex flex-wrap items-center justify-between gap-3"><div><p class="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Vie matrimoniale</p><h2 class="mt-1 font-semibold text-slate-900">Mariage et événements matrimoniaux</h2><p class="mt-1 max-w-2xl text-xs leading-5 text-slate-500">L’événement reste associé au dossier du fidèle ; le conjoint est indiqué par son nom, sans liaison avec une autre fiche.</p></div>${canWrite && lookupsReady ? '<button id="add-marriage-toggle" type="button" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">＋ Ajouter un événement / lien</button>' : ""}</div>
                <div id="new-marriage-wrap" class="hidden">${canWrite && lookupsReady ? marriageFormHtml() : ""}</div>
                <div class="mt-4 space-y-3">${marriagesHtml || '<p class="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Aucun mariage ni lien matrimonial enregistré.</p>'}</div>
              </section>
              ${!canWrite ? '<p class="text-xs text-slate-500">Consultation seule. L’ajout et la modification des registres sont réservés à la secrétaire et au curé.</p>' : ""}
            </div>`;

          const showEditor = (id: string): void => {
            const node = contentEl.querySelector<HTMLElement>("#" + id);
            if (!node) return;
            node.classList.remove("hidden");
            node.scrollIntoView({ behavior: "smooth", block: "nearest" });
          };
          contentEl.querySelector<HTMLButtonElement>("#add-sacrament-toggle")?.addEventListener("click",() => showEditor("new-sacrament-wrap"));
          contentEl.querySelector<HTMLButtonElement>("#add-marriage-toggle")?.addEventListener("click",() => showEditor("new-marriage-wrap"));
          contentEl.querySelectorAll<HTMLButtonElement>("[data-edit-sacrament]").forEach((button) =>
            button.addEventListener("click",() => showEditor("sacrament-editor-" + button.dataset.editSacrament))
          );
          contentEl.querySelectorAll<HTMLButtonElement>("[data-edit-marriage]").forEach((button) =>
            button.addEventListener("click",() => showEditor("marriage-editor-" + button.dataset.editMarriage))
          );
          contentEl.querySelectorAll<HTMLButtonElement>("[data-cancel-editor]").forEach((button) =>
            button.addEventListener("click",() => button.closest("form")?.classList.add("hidden"))
          );

          for (const form of [...contentEl.querySelectorAll<HTMLFormElement>(".sacrament-editor")]) {
            const recordId = form.dataset.recordId!;
            const record = recordId === "new" ? undefined : sacramentRecords.find((item) => item.id === recordId);
            const prefix = form.dataset.datePrefix!;
            initializePartialDate(form,prefix,record ? {
              precision:record.precision,jour:record.jour,mois:record.mois,annee:record.annee
            } : null);
            const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
            form.addEventListener("submit",async(event) => {
              event.preventDefault();
              const feedbackNode = form.querySelector<HTMLElement>(".editor-feedback")!;
              const values = new FormData(form);
              submit.disabled = true;
              submit.textContent = "Enregistrement…";
              try {
                const type = String(values.get("type") ?? record?.type ?? "") as "bapteme" | "eucharistie" | "confirmation";
                if (!["bapteme","eucharistie","confirmation"].includes(type)) throw new Error("Type de sacrement invalide.");
                const date = collectPartialDate(form,prefix);
                const act = String(values.get("numero_acte") ?? "").trim();
                if (type === "bapteme" && !act) throw new Error("Le numéro d’acte du baptême est obligatoire.");
                const payload = {
                  annee_pastorale_id:resolvePastoralYearId(date, years, record?.annee_pastorale_id ?? activeYear?.id),
                  communaute_historique_id:record?.communaute_historique_id ?? faithfulRecord.communaute_id,
                  jour:date.jour, mois:date.mois, annee:date.annee, precision:date.precision,
                  lieu:String(values.get("lieu") ?? "").trim() || null,
                  numero_acte:act || null, page_registre:record?.page_registre ?? null,
                  reference_registre_requise:record?.reference_registre_requise ?? false,
                  ministre:String(values.get("ministre") ?? "").trim() || null,
                  parrain:String(values.get("parrain_marraine") ?? "").trim() || null,
                  marraine:null,
                  visa:String(values.get("visa") ?? "").trim() || null
                };
                const result = record
                  ? await supabase.from("sacrements").update(payload).eq("id",record.id).eq("fidele_id",faithfulRecord.id).select("id").single()
                  : await supabase.from("sacrements").insert({...payload,fidele_id:faithfulRecord.id,paroisse_id:faithfulRecord.paroisse_id,type}).select("id").single();
                if (result.error) throw result.error;
                await renderTab("sacrements");
              } catch(error) {
                feedbackNode.textContent = error instanceof Error ? error.message : "Enregistrement du sacrement impossible.";
                feedbackNode.className = "editor-feedback rounded-lg bg-rose-50 p-3 text-sm text-rose-700";
                feedbackNode.classList.remove("hidden");
                submit.disabled = false;
                submit.textContent = "Enregistrer";
              }
            });
          }

          for (const form of [...contentEl.querySelectorAll<HTMLFormElement>(".marriage-editor")]) {
            const recordId = form.dataset.recordId!;
            const record = recordId === "new" ? undefined : marriageRecords.find((item) => item.id === recordId);
            const prefix = form.dataset.datePrefix!;
            const baptismPrefix = form.dataset.baptismPrefix!;
            const deathPrefix = form.dataset.deathPrefix!;
            initializePartialDate(form,prefix,record ? {
              precision:record.precision,jour:record.jour,mois:record.mois,annee:record.annee
            } : null);
            initializePartialDate(form,baptismPrefix,record ? {
              precision:record.conjoint_bapteme_precision,jour:record.conjoint_bapteme_jour,mois:record.conjoint_bapteme_mois,annee:record.conjoint_bapteme_annee
            } : null);
            initializePartialDate(form,deathPrefix,record ? {
              precision:record.deces_conjoint_precision,jour:record.deces_conjoint_jour,mois:record.deces_conjoint_mois,annee:record.deces_conjoint_annee
            } : null);
            const deathFields = form.querySelector<HTMLFieldSetElement>("[data-spouse-death-fields]")!;
            const typeSelect = form.querySelector<HTMLSelectElement>('select[name="type"]')!;
            const syncDeathFields = (): void => { deathFields.disabled = typeSelect.value !== "obiit_conjux"; };
            typeSelect.addEventListener("change",syncDeathFields);
            syncDeathFields();
            const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
            form.addEventListener("submit",async(event) => {
              event.preventDefault();
              const feedbackNode = form.querySelector<HTMLElement>(".editor-feedback")!;
              const values = new FormData(form);
              submit.disabled = true;
              submit.textContent = "Enregistrement…";
              try {
                const date = collectPartialDate(form,prefix);
                const spouseBirth = collectPartialDate(form,baptismPrefix);
                const spouseDeath = collectPartialDate(form,deathPrefix);
                const act = String(values.get("numero_acte") ?? "").trim();
                const spouseName = String(values.get("conjoint_nom") ?? "").trim();
                const payload = {
                  annee_pastorale_id:resolvePastoralYearId(date, years, record?.annee_pastorale_id ?? activeYear?.id),
                  communaute_historique_id:record?.communaute_historique_id ?? faithfulRecord.communaute_id,
                  type:typeSelect.value as Database["public"]["Enums"]["type_evenement_matrimonial"],
                  jour:date.jour, mois:date.mois, annee:date.annee, precision:date.precision,
                  lieu:String(values.get("lieu") ?? "").trim() || null,
                  numero_acte:act || null, page_registre:record?.page_registre ?? null,
                  conjoint_fidele_id:null, conjoint_nom:spouseName || null,
                  conjoint_lieu_bapteme:String(values.get("conjoint_lieu_bapteme") ?? "").trim() || null,
                  conjoint_bapteme_jour:spouseBirth.jour, conjoint_bapteme_mois:spouseBirth.mois,
                  conjoint_bapteme_annee:spouseBirth.annee, conjoint_bapteme_precision:spouseBirth.precision,
                  deces_conjoint_jour:spouseDeath.jour, deces_conjoint_mois:spouseDeath.mois,
                  deces_conjoint_annee:spouseDeath.annee, deces_conjoint_precision:spouseDeath.precision,
                  ministre:String(values.get("ministre") ?? "").trim() || null,
                  visa:String(values.get("visa") ?? "").trim() || null
                };
                const result = record
                  ? await supabase.from("evenements_matrimoniaux").update(payload).eq("id",record.id).eq("fidele_id",faithfulRecord.id).select("id").single()
                  : await supabase.from("evenements_matrimoniaux").insert({...payload,fidele_id:faithfulRecord.id,paroisse_id:faithfulRecord.paroisse_id,created_by:context.user.id}).select("id").single();
                if (result.error) throw result.error;
                await renderTab("sacrements");
              } catch(error) {
                feedbackNode.textContent = error instanceof Error ? error.message : "Enregistrement de l’événement matrimonial impossible.";
                feedbackNode.className = "editor-feedback rounded-lg bg-rose-50 p-3 text-sm text-rose-700";
                feedbackNode.classList.remove("hidden");
                submit.disabled = false;
                submit.textContent = "Enregistrer l’événement";
              }
            });
          }
          return;
        }

        if (tab === "dimes") {
          if (!canManageFaithful) {
            contentEl.innerHTML = '<section class="page-card p-5 text-sm text-slate-500">La consultation des dîmes est réservée à la secrétaire et au curé.</section>';
            return;
          }
          const [dimeResult,yearResult] = await Promise.all([
            supabase.from("dimes").select("id,montant,devise,observation,annee_pastorale_id,created_at").eq("fidele_id",faithfulRecord.id).order("created_at",{ascending:false}),
            supabase.from("annees_pastorales").select("id,libelle,date_debut").eq("paroisse_id",faithfulRecord.paroisse_id).order("date_debut",{ascending:false})
          ]);
          if(sequence!==tabSequence)return;
          if(dimeResult.error)throw dimeResult.error;
          if(yearResult.error)throw yearResult.error;
          const years=yearResult.data??[];
          const yearMap=new Map(years.map((item)=>[item.id,item.libelle]));
          const entries=dimeResult.data??[];
          const totals=new Map<string,number>();
          for(const item of entries)totals.set(item.devise,(totals.get(item.devise)??0)+item.montant);
          const rows=entries.map((item)=>'<tr class="border-b border-slate-100 last:border-0"><td class="px-3 py-3 font-medium text-slate-800">'+escapeHtml(yearMap.get(item.annee_pastorale_id)??"Année inconnue")+'</td><td class="px-3 py-3 text-right tabular-nums">'+escapeHtml(item.montant.toLocaleString("fr-CD",{maximumFractionDigits:2}))+'</td><td class="px-3 py-3">'+escapeHtml(item.devise)+'</td><td class="px-3 py-3 text-slate-500">'+escapeHtml(item.observation??"—")+'</td><td class="px-3 py-3"><div class="flex gap-2"><button type="button" data-profile-edit-dime="'+escapeHtml(item.id)+'" class="text-xs font-semibold text-emerald-700">Modifier</button><button type="button" data-profile-delete-dime="'+escapeHtml(item.id)+'" class="text-xs font-semibold text-rose-600">Supprimer</button></div></td></tr>').join("");
          const yearOptions=years.map((item)=>'<option value="'+escapeHtml(item.id)+'">'+escapeHtml(item.libelle)+'</option>').join("");
          contentEl.innerHTML='<div class="space-y-4"><section class="page-card p-5"><div class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="font-semibold text-slate-800">Dîmes du fidèle</h2><p class="mt-1 text-xs text-slate-500">Une contribution par année pastorale · modification et suppression disponibles</p></div><span class="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">'+entries.length+' contribution(s)</span></div><div class="mt-4 grid gap-3 sm:grid-cols-2"><div class="rounded-xl border border-slate-100 bg-slate-50 p-4"><p class="text-xs text-slate-500">Total en USD</p><p class="mt-1 text-xl font-semibold tabular-nums text-slate-900">'+(totals.get("USD")??0).toLocaleString("fr-CD",{maximumFractionDigits:2})+'</p></div><div class="rounded-xl border border-slate-100 bg-slate-50 p-4"><p class="text-xs text-slate-500">Total en FC</p><p class="mt-1 text-xl font-semibold tabular-nums text-slate-900">'+(totals.get("FC")??0).toLocaleString("fr-CD",{maximumFractionDigits:2})+'</p></div></div><div class="mt-5 overflow-x-auto"><table class="w-full min-w-[650px] text-left text-sm"><thead class="border-y border-slate-100 bg-slate-50 text-xs text-slate-500"><tr><th class="px-3 py-3 font-medium">Année pastorale</th><th class="px-3 py-3 text-right font-medium">Montant</th><th class="px-3 py-3 font-medium">Devise</th><th class="px-3 py-3 font-medium">Observation</th><th class="px-3 py-3 font-medium">Actions</th></tr></thead><tbody>'+(rows||'<tr><td colspan="5" class="px-3 py-12 text-center text-sm text-slate-400">Aucune dîme enregistrée pour ce fidèle.</td></tr>')+'</tbody></table></div></section><section class="page-card p-5"><h3 class="font-semibold text-slate-800">Ajouter ou modifier une dîme</h3><form id="profile-dime-form" class="mt-4 grid gap-3 sm:grid-cols-2"><input id="profile-dime-id" type="hidden"><label class="text-xs font-medium text-slate-600">Année pastorale<select id="profile-dime-year" required class="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">'+yearOptions+'</select></label><label class="text-xs font-medium text-slate-600">Montant<input id="profile-dime-amount" type="number" min="0" step="0.01" required class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"></label><label class="text-xs font-medium text-slate-600">Devise<select id="profile-dime-currency" class="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="USD">USD</option><option value="FC">FC</option></select></label><label class="text-xs font-medium text-slate-600">Observation<input id="profile-dime-observation" maxlength="300" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"></label><div class="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" class="rounded-lg bg-[var(--enoria-green)] px-4 py-2.5 text-sm font-semibold text-white">Enregistrer la dîme</button><button id="profile-dime-reset" type="button" class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600">Vider</button></div><p id="profile-dime-feedback" class="hidden sm:col-span-2 rounded-lg p-3 text-sm"></p></form></section></div>';
          const dimeForm=contentEl.querySelector<HTMLFormElement>("#profile-dime-form")!;
          const dimeId=contentEl.querySelector<HTMLInputElement>("#profile-dime-id")!;
          const dimeYear=contentEl.querySelector<HTMLSelectElement>("#profile-dime-year")!;
          const dimeAmount=contentEl.querySelector<HTMLInputElement>("#profile-dime-amount")!;
          const dimeCurrency=contentEl.querySelector<HTMLSelectElement>("#profile-dime-currency")!;
          const dimeObservation=contentEl.querySelector<HTMLInputElement>("#profile-dime-observation")!;
          const dimeFeedback=contentEl.querySelector<HTMLElement>("#profile-dime-feedback")!;
          const resetDime=():void=>{dimeId.value="";dimeYear.value=years.find((item)=>item.id===activeYear?.id)?.id??years[0]?.id??"";dimeAmount.value="";dimeCurrency.value="USD";dimeObservation.value="";};
          contentEl.querySelector<HTMLButtonElement>("#profile-dime-reset")!.addEventListener("click",resetDime);
          contentEl.addEventListener("click",async(event)=>{
            const target=event.target as HTMLElement;
            const edit=target.closest<HTMLButtonElement>("[data-profile-edit-dime]");
            if(edit?.dataset.profileEditDime){
              const item=entries.find((entry)=>entry.id===edit.dataset.profileEditDime);
              if(!item)return;
              dimeId.value=item.id;dimeYear.value=item.annee_pastorale_id;dimeAmount.value=String(item.montant);dimeCurrency.value=item.devise;dimeObservation.value=item.observation??"";
              dimeForm.scrollIntoView({behavior:"smooth",block:"center"});return;
            }
            const remove=target.closest<HTMLButtonElement>("[data-profile-delete-dime]");
            if(remove?.dataset.profileDeleteDime){
              if(!window.confirm("Supprimer définitivement cette dîme ?"))return;
              const {error}=await supabase.from("dimes").delete().eq("id",remove.dataset.profileDeleteDime).eq("fidele_id",faithfulRecord.id);
              if(error){dimeFeedback.textContent=error.message;dimeFeedback.className="sm:col-span-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700";dimeFeedback.classList.remove("hidden");return;}
              await renderTab("dimes");
            }
          });
          dimeForm.addEventListener("submit",async(event)=>{
            event.preventDefault();
            const amount=Number(dimeAmount.value);
            if(!Number.isFinite(amount)||amount<0)return;
            const payload={fidele_id:faithfulRecord.id,annee_pastorale_id:dimeYear.value,montant:amount,devise:dimeCurrency.value as "USD"|"FC",observation:dimeObservation.value.trim()||null};
            const result=dimeId.value
              ? await supabase.from("dimes").update(payload).eq("id",dimeId.value).eq("fidele_id",faithfulRecord.id)
              : await supabase.from("dimes").upsert({...payload,created_by:context.user.id},{onConflict:"fidele_id,annee_pastorale_id"});
            if(result.error){dimeFeedback.textContent=result.error.message;dimeFeedback.className="sm:col-span-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700";dimeFeedback.classList.remove("hidden");return;}
            await renderTab("dimes");
          });
          return;
        }

        if (tab === "famille") {
          const { data, error } = await supabase.from("enfants").select("*").eq("fidele_parent_id", faithfulRecord.id).order("nom").order("prenom");
          if(sequence!==tabSequence)return;
          if(error)throw error;
          const children=data??[];
          const dateInput=(day:number|null,month:number|null,year:number|null)=>day&&month&&year?`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`:"";
          const cards=children.map((child)=>`
            <article class="rounded-xl border border-slate-100 p-4"><div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-semibold text-slate-800">${escapeHtml(child.prenom)} ${escapeHtml(child.nom)}</h3>
              <p class="mt-2 text-xs text-slate-500">Naissance : ${formatPartialDate(child.naissance_jour,child.naissance_mois,child.naissance_annee,child.naissance_precision)}</p>
              <p class="mt-1 text-xs text-slate-500">Baptême : ${formatPartialDate(child.bapteme_jour,child.bapteme_mois,child.bapteme_annee,child.bapteme_precision)} · ${escapeHtml(child.statut_bapteme)}</p>
              <p class="mt-1 text-xs text-slate-500">Confession : ${escapeHtml(child.confession)}</p></div>${canManageFaithful?`<div class="flex gap-2"><button type="button" data-edit-child="${escapeHtml(child.id)}" class="text-xs font-semibold text-emerald-700">Modifier</button><button type="button" data-delete-child="${escapeHtml(child.id)}" class="text-xs font-semibold text-rose-600">Supprimer</button></div>`:""}</div></article>`).join("");
          contentEl.innerHTML=`<section class="page-card p-5"><div class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="font-semibold text-slate-800">Enfants</h2><p class="mt-1 text-xs text-slate-500">${children.length} enfant(s) enregistré(s)</p></div>${canManageFaithful?'<button id="profile-add-child" type="button" class="rounded-lg bg-[var(--enoria-green)] px-3 py-2 text-xs font-semibold text-white">＋ Ajouter un enfant</button>':""}</div><div class="mt-4 space-y-3">${cards||'<p class="text-sm text-slate-400">Aucun enfant enregistré dans ce dossier.</p>'}</div>${canManageFaithful?`<form id="profile-child-form" class="mt-5 hidden rounded-xl border border-slate-100 bg-slate-50 p-4"><h3 id="profile-child-title" class="font-semibold text-slate-800">Ajouter un enfant</h3><input id="profile-child-id" type="hidden"><div class="mt-3 grid gap-3 sm:grid-cols-2"><label class="text-xs font-medium text-slate-600">Prénom<input id="profile-child-first" required maxlength="100" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"></label><label class="text-xs font-medium text-slate-600">Nom<input id="profile-child-last" required maxlength="100" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"></label><label class="text-xs font-medium text-slate-600">Date de naissance<input id="profile-child-birth" type="date" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"></label><label class="text-xs font-medium text-slate-600">Date de baptême<input id="profile-child-baptism" type="date" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"></label><label class="text-xs font-medium text-slate-600">Lieu du baptême<input id="profile-child-place" maxlength="160" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"></label><label class="text-xs font-medium text-slate-600">Statut du baptême<select id="profile-child-status" class="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="inconnu">Inconnu</option><option value="baptise">Baptisé</option><option value="non_baptise">Non baptisé</option></select></label><label class="text-xs font-medium text-slate-600">Confession<select id="profile-child-faith" class="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="inconnue">Inconnue</option><option value="catholique">Catholique</option><option value="non_catholique">Non catholique</option></select></label><label class="text-xs font-medium text-slate-600">N° d’acte<input id="profile-child-act" maxlength="80" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"></label><label class="text-xs font-medium text-slate-600">Page du registre<input id="profile-child-page" maxlength="80" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"></label></div><div class="mt-4 flex gap-2"><button type="submit" class="rounded-lg bg-[var(--enoria-green)] px-4 py-2.5 text-sm font-semibold text-white">Enregistrer</button><button id="profile-child-cancel" type="button" class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600">Annuler</button></div><p id="profile-child-feedback" class="mt-3 hidden rounded-lg p-3 text-sm"></p></form>`:''}</section>`;
          if(canManageFaithful){
            const childForm=contentEl.querySelector<HTMLFormElement>("#profile-child-form")!;
            const childField=(id:string)=>childForm.querySelector<HTMLInputElement|HTMLSelectElement>("#"+id)!;
            const resetChild=()=>{childForm.reset();childField("profile-child-id").value="";childForm.classList.add("hidden");contentEl.querySelector<HTMLElement>("#profile-child-title")!.textContent="Ajouter un enfant";};
            const fillDate=(value:string)=>{if(!value)return {jour:null,mois:null,annee:null,precision:"inconnue" as Precision};const date=new Date(value+"T00:00:00");return {jour:date.getDate(),mois:date.getMonth()+1,annee:date.getFullYear(),precision:"exacte" as Precision};};
            contentEl.querySelector<HTMLButtonElement>("#profile-add-child")!.addEventListener("click",()=>{resetChild();childForm.classList.remove("hidden");childForm.scrollIntoView({behavior:"smooth",block:"center"});});
            contentEl.querySelector<HTMLButtonElement>("#profile-child-cancel")!.addEventListener("click",resetChild);
            contentEl.addEventListener("click",async(event)=>{
              const target=event.target as HTMLElement;
              const edit=target.closest<HTMLButtonElement>("[data-edit-child]");
              if(edit?.dataset.editChild){
                const child=children.find((item)=>item.id===edit.dataset.editChild);if(!child)return;
                childForm.classList.remove("hidden");contentEl.querySelector<HTMLElement>("#profile-child-title")!.textContent="Modifier l’enfant";
                childField("profile-child-id").value=child.id;childField("profile-child-first").value=child.prenom;childField("profile-child-last").value=child.nom;
                childField("profile-child-birth").value=dateInput(child.naissance_jour,child.naissance_mois,child.naissance_annee);
                childField("profile-child-baptism").value=dateInput(child.bapteme_jour,child.bapteme_mois,child.bapteme_annee);
                childField("profile-child-place").value=child.lieu_bapteme??"";childField("profile-child-status").value=child.statut_bapteme;childField("profile-child-faith").value=child.confession;
                childField("profile-child-act").value=child.numero_acte??"";childField("profile-child-page").value=child.page_registre??"";
                childForm.scrollIntoView({behavior:"smooth",block:"center"});return;
              }
              const remove=target.closest<HTMLButtonElement>("[data-delete-child]");
              if(remove?.dataset.deleteChild){
                if(!window.confirm("Supprimer cet enfant du dossier ?"))return;
                const result=await supabase.from("enfants").delete().eq("id",remove.dataset.deleteChild).eq("fidele_parent_id",faithfulRecord.id);
                if(result.error){const fb=childForm.querySelector<HTMLElement>("#profile-child-feedback")!;fb.textContent=result.error.message;fb.className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700";fb.classList.remove("hidden");return;}
                await renderTab("famille");
              }
            });
            childForm.addEventListener("submit",async(event)=>{
              event.preventDefault();
              const birth=fillDate(childField("profile-child-birth").value);const baptism=fillDate(childField("profile-child-baptism").value);
              const act=childField("profile-child-act").value.trim();const page=childField("profile-child-page").value.trim();
              const fb=childForm.querySelector<HTMLElement>("#profile-child-feedback")!;
              if(Boolean(act)!==Boolean(page)){fb.textContent="Le numéro d’acte et la page doivent être renseignés ensemble.";fb.className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800";fb.classList.remove("hidden");return;}
              const payload={fidele_parent_id:faithfulRecord.id,prenom:childField("profile-child-first").value.trim(),nom:childField("profile-child-last").value.trim(),naissance_jour:birth.jour,naissance_mois:birth.mois,naissance_annee:birth.annee,naissance_precision:birth.precision,lieu_bapteme:childField("profile-child-place").value.trim()||null,bapteme_jour:baptism.jour,bapteme_mois:baptism.mois,bapteme_annee:baptism.annee,bapteme_precision:baptism.precision,statut_bapteme:childField("profile-child-status").value,confession:childField("profile-child-faith").value,numero_acte:act||null,page_registre:page||null};
              const id=childField("profile-child-id").value;
              const result=id?await supabase.from("enfants").update(payload).eq("id",id).eq("fidele_parent_id",faithfulRecord.id):await supabase.from("enfants").insert({...payload,created_by:context.user.id});
              if(result.error){fb.textContent=result.error.message;fb.className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700";fb.classList.remove("hidden");return;}
              await renderTab("famille");
            });
          }
          return;
        }

        if (tab === "historique") {
          if (!context.roles.some((role) => role === "secretaire" || role === "cure")) {
            contentEl.innerHTML = '<section class="page-card p-5 text-sm text-slate-500">L’historique des transferts est réservé à la secrétaire et au curé.</section>';
            return;
          }
          const [transferResult, actionResult] = await Promise.all([
            supabase.from("historique_affectations_fideles").select("*").eq("fidele_id", faithfulRecord.id).order("date_debut", { ascending: false }),
            supabase.from("historique_actions").select("action,table_cible,details,created_at,utilisateur_id").eq("fidele_id", faithfulRecord.id).order("created_at", { ascending: false })
          ]);
          if (sequence !== tabSequence) return;
          if (transferResult.error) throw transferResult.error;
          if (actionResult.error) throw actionResult.error;
          const communityIds = [...new Set((transferResult.data ?? []).flatMap((item) => [item.ancienne_communaute_id,item.nouvelle_communaute_id]).filter((id): id is string => Boolean(id)))];
          const communityResult = communityIds.length
            ? await supabase.from("communautes").select("id,nom").in("id",communityIds)
            : { data: [], error: null };
          if (communityResult.error) throw communityResult.error;
          const communityNames = new Map((communityResult.data ?? []).map((item) => [item.id,item.nom]));
          const transferHtml = (transferResult.data ?? []).map((item) => `
            <article class="rounded-xl border border-slate-100 p-4"><p class="text-sm font-semibold text-slate-800">Changement de communauté</p>
            <p class="mt-2 text-xs text-slate-500">${escapeHtml(communityNames.get(item.ancienne_communaute_id ?? "") ?? "Origine inconnue")} → ${escapeHtml(communityNames.get(item.nouvelle_communaute_id) ?? "Destination inconnue")}</p>
            <p class="mt-1 text-xs text-slate-500">Du ${escapeHtml(item.date_debut)} au ${escapeHtml(item.date_fin ?? "en cours")} · Motif : ${escapeHtml(item.motif ?? "Non précisé")}</p></article>`).join("");
          const actionsHtml = (actionResult.data ?? []).map((item) => `
            <article class="rounded-xl border border-slate-100 p-4"><div class="flex flex-wrap items-center justify-between gap-2"><p class="text-sm font-semibold text-slate-800">${escapeHtml(item.action)}</p><span class="text-xs text-slate-400">${escapeHtml(new Intl.DateTimeFormat("fr-CD",{dateStyle:"medium",timeStyle:"short"}).format(new Date(item.created_at)))}</span></div>
            <p class="mt-1 text-xs text-slate-500">Table concernée : ${escapeHtml(item.table_cible)}</p><p class="mt-2 break-words text-xs text-slate-500">${escapeHtml(JSON.stringify(item.details))}</p></article>`).join("");
          contentEl.innerHTML = `<div class="space-y-4"><section class="page-card p-5"><h2 class="font-semibold text-slate-800">Historique des affectations</h2><div class="mt-4 space-y-3">${transferHtml || '<p class="text-sm text-slate-400">Aucun transfert enregistré.</p>'}</div></section><section class="page-card p-5"><h2 class="font-semibold text-slate-800">Journal des actions</h2><div class="mt-4 space-y-3">${actionsHtml || '<p class="text-sm text-slate-400">Aucune action journalisée pour ce dossier.</p>'}</div></section></div>`;
          return;
        }

        if (tab === "documents") {
          if (!context.roles.some((role) => role === "secretaire" || role === "cure")) {
            contentEl.innerHTML = '<section class="page-card p-5 text-sm text-slate-500">Les demandes et duplicatas sont réservés à la secrétaire et au curé.</section>';
            return;
          }
          const [certificateResult, recordResult] = await Promise.all([
            supabase.from("certificats").select("*").eq("fidele_id", faithfulRecord.id).order("date_demande", { ascending: false }),
            supabase.from("sacrements").select("id,type,jour,mois,annee,precision,lieu,numero_acte,page_registre,ministre").eq("fidele_id", faithfulRecord.id)
          ]);
          if (sequence !== tabSequence) return;
          if (certificateResult.error) throw certificateResult.error;
          if (recordResult.error) throw recordResult.error;
          const certificates = certificateResult.data ?? [];
          const sacramentRecords = recordResult.data ?? [];
          const isPriest = context.roles.includes("cure");
          const statusLabels: Record<string, string> = { attente: "En attente", valide: "Validé par le curé", refuse: "Refusé", emis: "Duplicata émis" };
          const requestHtml = sacramentRecords.map((record) => {
            const pending = certificates.some((item) => item.sacrement_id === record.id && (item.statut === "attente" || item.statut === "valide"));
            const label = record.type === "bapteme" ? "Baptême" : record.type === "eucharistie" ? "Eucharistie" : "Confirmation";
            const action = pending
              ? '<span class="text-xs text-amber-700">Demande en cours de traitement</span>'
              : activeYear
                ? `<button type="button" data-request-duplicata="${escapeHtml(record.id)}" class="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800">Demander un duplicata</button>`
                : '<span class="text-xs text-slate-500">Aucune année active : demande bloquée</span>';
            return `<div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-3"><div><p class="text-sm font-medium text-slate-800">${label}</p><p class="mt-1 text-xs text-slate-500">Acte ${escapeHtml(record.numero_acte ?? "—")} · Page ${escapeHtml(record.page_registre ?? "—")}</p></div>${action}</div>`;
          }).join("");
          const certificateHtml = certificates.map((item) => {
            let actions = "";
            if (item.statut === "attente" && isPriest) {
              actions = `<div class="mt-3 flex flex-wrap gap-2"><button type="button" data-approve-cert="${item.id}" class="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Valider</button><button type="button" data-reject-cert="${item.id}" class="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">Refuser</button></div>`;
            } else if (item.statut === "valide" && isPriest) {
              actions = `<button type="button" data-emit-cert="${item.id}" class="mt-3 rounded-lg bg-[var(--enoria-green)] px-3 py-2 text-xs font-semibold text-white">Générer le PDF et émettre</button>`;
            } else if (item.statut === "emis") {
              actions = '<p class="mt-2 text-xs text-slate-500">Duplicata émis. En cas de perte, créer une nouvelle demande pour conserver la traçabilité.</p>';
            } else if (item.statut === "valide") {
              actions = '<p class="mt-2 text-xs text-emerald-700">Validé. L’émission du PDF est réservée au curé.</p>';
            } else if (item.statut === "attente") {
              actions = '<p class="mt-2 text-xs text-amber-700">En attente de validation du curé.</p>';
            }
            return `<article class="rounded-xl border border-slate-100 p-4"><div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-semibold text-slate-800">Duplicata n° ${item.numero_duplicata}</h3><span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">${statusLabels[item.statut] ?? item.statut}</span></div><p class="mt-2 text-xs text-slate-500">Demande : ${escapeHtml(item.date_demande)} · Validation : ${escapeHtml(item.date_validation ?? "—")} · Émission : ${escapeHtml(item.date_emission ?? "—")}</p>${item.motif_refus ? `<p class="mt-1 text-xs text-rose-600">Motif du refus : ${escapeHtml(item.motif_refus)}</p>` : ""}${actions}</article>`;
          }).join("");
          contentEl.innerHTML = `
            <div class="space-y-4">
              <section class="page-card p-5"><h2 class="font-semibold text-slate-800">Demander un duplicata</h2><p class="mt-1 text-xs leading-5 text-slate-500">La demande est enregistrée dans la base et doit être validée par le curé avant toute émission.</p><div class="mt-3">${requestHtml || '<p class="text-sm text-slate-400">Aucun sacrement disponible pour demander un duplicata.</p>'}</div></section>
              <section class="page-card p-5"><h2 class="font-semibold text-slate-800">Suivi des demandes</h2><div class="mt-4 space-y-3">${certificateHtml || '<p class="text-sm text-slate-400">Aucune demande de duplicata.</p>'}</div></section>
              <p id="certificate-action-feedback" class="hidden rounded-lg p-3 text-sm" role="status"></p>
            </div>`;

          const actionFeedback = contentEl.querySelector<HTMLElement>("#certificate-action-feedback")!;
          const showActionError = (error: unknown): void => {
            actionFeedback.textContent = error instanceof Error ? error.message : "Action impossible.";
            actionFeedback.className = "rounded-lg bg-rose-50 p-3 text-sm text-rose-700";
          };
          contentEl.querySelectorAll<HTMLButtonElement>("[data-request-duplicata]").forEach((button) => {
            button.addEventListener("click", async () => {
              button.disabled = true;
              try {
                const { error: rpcError } = await supabase.rpc("demander_duplicata", { p_sacrement: button.dataset.requestDuplicata! });
                if (rpcError) throw rpcError;
                await renderTab("documents");
              } catch (error) {
                showActionError(error);
                button.disabled = false;
              }
            });
          });
          contentEl.querySelectorAll<HTMLButtonElement>("[data-approve-cert]").forEach((button) => {
            button.addEventListener("click", async () => {
              button.disabled = true;
              try {
                const { error: rpcError } = await supabase.rpc("decider_duplicata", { p_certificat: button.dataset.approveCert!, p_accepter: true });
                if (rpcError) throw rpcError;
                await renderTab("documents");
              } catch (error) {
                showActionError(error);
                button.disabled = false;
              }
            });
          });
          contentEl.querySelectorAll<HTMLButtonElement>("[data-reject-cert]").forEach((button) => {
            button.addEventListener("click", async () => {
              const reason = window.prompt("Indique le motif du refus :");
              if (reason === null) return;
              if (!reason.trim()) {
                showActionError(new Error("Le motif du refus est obligatoire."));
                return;
              }
              button.disabled = true;
              try {
                const { error: rpcError } = await supabase.rpc("decider_duplicata", { p_certificat: button.dataset.rejectCert!, p_accepter: false, p_motif: reason.trim() });
                if (rpcError) throw rpcError;
                await renderTab("documents");
              } catch (error) {
                showActionError(error);
                button.disabled = false;
              }
            });
          });
          const emitPdf = async (certificateId: string, markAsEmitted: boolean): Promise<void> => {
            const certificate = certificates.find((item) => item.id === certificateId);
            if (!certificate) throw new Error("Demande de duplicata introuvable.");
            const record = sacramentRecords.find((item) => item.id === certificate.sacrement_id);
            if (!record) throw new Error("Le sacrement source est introuvable.");
            const labels: Record<string,string> = { bapteme:"Baptême", eucharistie:"Eucharistie", confirmation:"Confirmation" };
            const config = getAppConfig();
            const { createCertificatePdf, downloadCertificatePdf } = await import("../rapports/certificate-pdf");
            const bytes = await createCertificatePdf({
              parishName: config.parishName,
              dioceseName: config.dioceseName,
              faithfulName: `${faithfulRecord.prenom} ${faithfulRecord.nom}`,
              sacramentLabel: labels[record.type] ?? record.type,
              dateText: formatPartialDate(record.jour,record.mois,record.annee,record.precision),
              place: record.lieu ?? "",
              actNumber: record.numero_acte ?? "",
              pageNumber: record.page_registre ?? "",
              minister: record.ministre ?? "",
              duplicateNumber: certificate.numero_duplicata,
              emittedDate: new Intl.DateTimeFormat("fr-CD",{dateStyle:"long"}).format(certificate.date_emission ? new Date(certificate.date_emission) : new Date())
            });
            if (markAsEmitted) {
              const { error: emitError } = await supabase.rpc("marquer_certificat_emis", { p_certificat: certificateId });
              if (emitError) throw emitError;
            }
            const filePart = `${faithfulRecord.nom}-${faithfulRecord.prenom}`.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9-]/g,"-");
            downloadCertificatePdf(bytes,`Enoria-duplicata-${certificate.numero_duplicata}-${filePart}.pdf`);
            if (markAsEmitted) await renderTab("documents");
          };
          contentEl.querySelectorAll<HTMLButtonElement>("[data-emit-cert]").forEach((button) => {
            button.addEventListener("click", async () => {
              button.disabled = true;
              try { await emitPdf(button.dataset.emitCert!,true); }
              catch (error) { showActionError(error); button.disabled = false; }
            });
          });
        }
      } catch (error) {
        if (sequence !== tabSequence) return;
        contentEl.innerHTML = `<section class="page-card p-5 text-sm text-rose-700">${escapeHtml(error instanceof Error ? error.message : "Impossible de charger cet onglet.")}</section>`;
      }
    }

    tabs.forEach((button) => button.addEventListener("click", () => void renderTab(button.dataset.tab ?? "general")));
    void renderTab(getFaithfulInitialTab());
    return disposeProfile;
  } catch (error) {
    nameEl.textContent = "Dossier indisponible";
    subtitleEl.textContent = "Les informations ne sont pas accessibles avec ce compte.";
    contentEl.innerHTML = `<section class="page-card p-5 text-sm text-rose-700">${escapeHtml(error instanceof Error ? error.message : "Impossible de charger le dossier.")}</section>`;
    return disposeProfile;
  }
}
