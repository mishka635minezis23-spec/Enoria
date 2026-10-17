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

      if (term) query = query.or(`prenom.ilike.%${term}%,nom.ilike.%${term}%`);
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

function cardGradient(value: string | null | undefined): string {
  return CARD_COLORS.find((item) => item.key === value)?.gradient ?? CARD_COLORS[0].gradient;
}

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

function bookletLine(label: string, value: unknown): string {
  return '<div class="my-1 flex min-w-0 items-baseline gap-1.5 text-[11px] leading-tight text-slate-800"><span class="shrink-0">' +
    escapeHtml(label) + '</span><span class="min-h-5 min-w-0 flex-1 border-b border-dotted border-slate-500 px-1 font-serif italic text-indigo-800 [overflow-wrap:anywhere]">' +
    escapeHtml(value || "") + '</span></div>';
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
  const buildSacrementFields = (prefix: string, years: string, communities: string, optional: boolean): string => {
    const check = optional ? '<label class="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><input id="enable-' + prefix + '" type="checkbox" class="rounded border-slate-300" /> Ajouter ' + (prefix === "new-eucharistie" ? "l’Eucharistie" : "la Confirmation") + '</label>' : "";
    return check + '<fieldset id="' + prefix + '-fieldset" ' + (optional ? "disabled" : "") + ' class="space-y-3 ' + (optional ? "rounded-xl border border-slate-100 p-3" : "") + '">' +
      '<div class="grid gap-3 sm:grid-cols-2"><label class="' + labelClass + '">Année pastorale<select name="' + prefix + '-year" required class="' + selectClass + '">' + years + '</select></label>' +
      '<label class="' + labelClass + '">Communauté de célébration<select name="' + prefix + '-community" required class="' + selectClass + '">' + communities + '</select></label></div>' +
      '<div><p class="mb-2 text-xs font-semibold text-slate-600">Date</p>' + partialDateFields(prefix) + '</div>' +
      '<div class="grid gap-3 sm:grid-cols-2"><label class="' + labelClass + '">Lieu<input name="' + prefix + '-lieu" maxlength="160" class="' + inputClass + '" /></label>' +
      '<label class="' + labelClass + '">Ministre<input name="' + prefix + '-ministre" maxlength="160" class="' + inputClass + '" /></label>' +
      '<label class="' + labelClass + '">N° d’acte<input name="' + prefix + '-acte" maxlength="80" required class="' + inputClass + '" /></label>' +
      '<label class="' + labelClass + '">Page du registre<input name="' + prefix + '-page" maxlength="80" required class="' + inputClass + '" /></label>' +
      '<label class="' + labelClass + '">Parrain<input name="' + prefix + '-parrain" maxlength="160" class="' + inputClass + '" /></label>' +
      '<label class="' + labelClass + '">Marraine<input name="' + prefix + '-marraine" maxlength="160" class="' + inputClass + '" /></label>' +
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
      const [yearsResult, communitiesResult] = await Promise.all([
        db.from("annees_pastorales").select("id,libelle,date_debut,active").eq("paroisse_id", parishId).order("date_debut", { ascending: false }),
        db.from("communautes").select("id,nom,active").eq("paroisse_id", parishId).eq("active", true).order("nom")
      ]);
      if (yearsResult.error) throw yearsResult.error;
      if (communitiesResult.error) throw communitiesResult.error;
      const years = yearsResult.data ?? [];
      const communities = communitiesResult.data ?? [];
      if (!years.length) throw new Error("Crée d’abord une année pastorale dans Paramètres avant d’enregistrer un fidèle.");
      if (!communities.length) throw new Error("Aucune communauté active n’est disponible pour cette paroisse.");
      const yearOptions = years.map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.libelle) + '</option>').join("");
      const communityOptions = communities.map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.nom) + '</option>').join("");
      root.innerHTML =
        '<div id="faithful-create-overlay" class="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="faithful-create-title">' +
        '<div class="mx-auto my-2 w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl sm:my-6">' +
        '<header class="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-rose-50 via-white to-pink-50 p-5 sm:p-6"><div><p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">Nouveau dossier paroissial</p><h2 id="faithful-create-title" class="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">Ajouter un fidèle</h2><p id="faithful-wizard-progress" class="mt-1 text-sm text-slate-500">Étape 1 sur 3 · Identité</p></div><button id="faithful-create-close" type="button" class="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">✕</button></header>' +
        '<form id="faithful-create-form" class="space-y-5 p-5 sm:p-6" novalidate>' +
        '<section data-wizard-step="1" class="space-y-4"><div class="rounded-xl border border-slate-100 p-4"><h3 class="font-semibold text-slate-800">Identité et appartenance</h3><div class="mt-3 grid gap-3 sm:grid-cols-2">' +
        '<label class="' + labelClass + '">Prénom *<input name="prenom" required maxlength="100" class="' + inputClass + '" /></label><label class="' + labelClass + '">Nom *<input name="nom" required maxlength="100" class="' + inputClass + '" /></label>' +
        '<label class="' + labelClass + '">Sexe *<select name="sexe" required class="' + selectClass + '"><option value="">Choisir…</option><option value="masculin">Masculin</option><option value="feminin">Féminin</option></select></label>' +
        '<label class="' + labelClass + '">Communauté actuelle *<select name="communaute_id" required class="' + selectClass + '"><option value="">Choisir…</option>' + communityOptions + '</select></label>' +
        '<label class="' + labelClass + '">Membre depuis<input name="communaute_depuis" type="date" class="' + inputClass + '" /></label><label class="' + labelClass + '">Lieu de naissance<input name="lieu_naissance" maxlength="160" class="' + inputClass + '" /></label></div>' +
        '<div class="mt-4"><p class="mb-2 text-xs font-semibold text-slate-600">Date de naissance</p>' + partialDateFields("new-birth") + '</div></div>' +
        '<div class="rounded-xl border border-slate-100 p-4"><h3 class="font-semibold text-slate-800">Parents</h3><div class="mt-3 grid gap-3 sm:grid-cols-2"><label class="' + labelClass + '">Nom du père<input name="nom_pere" maxlength="160" class="' + inputClass + '" /></label><label class="' + labelClass + '">Nom de la mère<input name="nom_mere" maxlength="160" class="' + inputClass + '" /></label></div></div>' +
        '<div class="rounded-xl border border-slate-100 p-4"><h3 class="font-semibold text-slate-800">Statut de vie</h3><label class="' + labelClass + ' mt-3 block">Statut<select id="new-status" name="statut" class="' + selectClass + '"><option value="vivant">Vivant</option><option value="decede">Décédé</option></select></label><fieldset id="new-death-fields" disabled class="mt-3 rounded-xl bg-slate-50 p-3"><p class="mb-2 text-xs font-semibold text-slate-600">Date de décès (si connue)</p>' + partialDateFields("new-death") + '</fieldset></div>' +
        '<div class="rounded-xl border border-slate-100 p-4"><h3 class="font-semibold text-slate-800">Couleur de la carte</h3><p class="mt-1 text-xs text-slate-500">Cinq couleurs maximum ; le rose poudré est appliqué par défaut.</p><div class="mt-3 grid grid-cols-5 gap-2">' + renderCardColorChoices("rose", "carte_couleur") + '</div></div></section>' +
        '<section data-wizard-step="2" class="hidden space-y-4"><div class="rounded-xl border border-rose-100 bg-rose-50/40 p-4"><h3 class="font-semibold text-slate-900">Baptême · obligatoire</h3><p class="mt-1 text-xs leading-5 text-slate-600">Le fidèle et son baptême seront enregistrés ensemble. Le numéro d’acte et la page sont requis.</p><div class="mt-4">' + buildSacrementFields("new-bapteme", yearOptions, communityOptions, false) + '</div></div>' +
        '<div class="rounded-xl border border-slate-100 p-4"><h3 class="mb-3 font-semibold text-slate-800">Autres sacrements (facultatifs)</h3>' + buildSacrementFields("new-eucharistie", yearOptions, communityOptions, true) + '<div class="my-4 border-t border-slate-100"></div>' + buildSacrementFields("new-confirmation", yearOptions, communityOptions, true) + '</div></section>' +
        '<section data-wizard-step="3" class="hidden space-y-4"><div class="rounded-xl border border-slate-100 p-4"><div class="flex items-start justify-between gap-3"><div><h3 class="font-semibold text-slate-800">Enfants</h3><p class="mt-1 text-xs text-slate-500">Ajoute uniquement les enfants dont tu connais les informations.</p></div><button id="faithful-add-child" type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">＋ Ajouter un enfant</button></div><div id="faithful-child-list" class="mt-3 space-y-3"></div><p class="mt-2 text-[11px] text-slate-400">Les emplacements laissés vides ne sont pas enregistrés.</p></div>' +
        '<div class="rounded-xl border border-slate-100 p-4"><label class="flex items-center gap-2 text-sm font-semibold text-slate-800"><input id="enable-marriage" type="checkbox" class="rounded border-slate-300" /> Enregistrer un événement matrimonial</label><fieldset id="new-marriage-fields" disabled class="mt-4 space-y-3">' +
        '<div class="grid gap-3 sm:grid-cols-2"><label class="' + labelClass + '">Type d’événement<select name="marriage_type" class="' + selectClass + '"><option value="post_baptismum">Mariage après baptême</option><option value="ante_baptismum">Mention avant baptême</option><option value="novas_nuptias">Nouvelles noces</option><option value="obiit_conjux">Décès du conjoint</option></select></label><label class="' + labelClass + '">Conjoint(e)<input name="marriage_spouse" maxlength="160" class="' + inputClass + '" /></label>' +
        '<label class="' + labelClass + '">Année pastorale<select name="marriage_year" required class="' + selectClass + '">' + yearOptions + '</select></label><label class="' + labelClass + '">Communauté de l’événement<select name="marriage_community" required class="' + selectClass + '">' + communityOptions + '</select></label></div>' +
        '<div><p class="mb-2 text-xs font-semibold text-slate-600">Date de l’événement</p>' + partialDateFields("new-marriage") + '</div>' +
        '<div class="grid gap-3 sm:grid-cols-2"><label class="' + labelClass + '">Lieu<input name="marriage_lieu" maxlength="160" class="' + inputClass + '" /></label><label class="' + labelClass + '">Ministre<input name="marriage_ministre" maxlength="160" class="' + inputClass + '" /></label><label class="' + labelClass + '">N° d’acte<input name="marriage_acte" maxlength="80" class="' + inputClass + '" /></label><label class="' + labelClass + '">Page du registre<input name="marriage_page" maxlength="80" class="' + inputClass + '" /></label><label class="' + labelClass + '">Visa / observation<input name="marriage_visa" maxlength="160" class="' + inputClass + '" /></label><label class="' + labelClass + '">Lieu de baptême du conjoint<input name="marriage_spouse_baptism_place" maxlength="160" class="' + inputClass + '" /></label></div>' +
        '<div><p class="mb-2 text-xs font-semibold text-slate-600">Baptême du conjoint (facultatif)</p>' + partialDateFields("new-spouse-baptism") + '</div>' +
        '<fieldset id="new-marriage-spouse-death-fields" disabled class="rounded-xl bg-slate-50 p-3"><p class="mb-2 text-xs font-semibold text-slate-600">Date de décès du conjoint pour ce type d’événement</p>' + partialDateFields("new-marriage-death") + '</fieldset></fieldset></div></section>' +
        '<div id="faithful-create-feedback" class="hidden rounded-xl p-3 text-sm" role="status"></div><footer class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><button id="faithful-create-cancel" type="button" class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600">Annuler</button><div class="flex gap-2"><button id="faithful-wizard-back" type="button" class="hidden rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600">Retour</button><button id="faithful-wizard-next" type="button" class="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Continuer</button><button id="faithful-wizard-save" type="submit" class="hidden rounded-lg bg-[var(--enoria-green)] px-4 py-2.5 text-sm font-semibold text-white">Enregistrer le dossier</button></div></footer></form></div></div>';

      const overlay = root.querySelector<HTMLElement>("#faithful-create-overlay")!;
      const form = root.querySelector<HTMLFormElement>("#faithful-create-form")!;
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
            annee_pastorale_id: String(values.get("new-bapteme-year") ?? ""),
            communaute_historique_id: String(values.get("new-bapteme-community") ?? ""),
            precision: baptismDate.precision, jour: baptismDate.jour, mois: baptismDate.mois, annee: baptismDate.annee,
            lieu: String(values.get("new-bapteme-lieu") ?? "").trim(),
            numero_acte: String(values.get("new-bapteme-acte") ?? "").trim(),
            page_registre: String(values.get("new-bapteme-page") ?? "").trim(),
            ministre: String(values.get("new-bapteme-ministre") ?? "").trim(),
            parrain: String(values.get("new-bapteme-parrain") ?? "").trim(),
            marraine: String(values.get("new-bapteme-marraine") ?? "").trim(),
            visa: String(values.get("new-bapteme-visa") ?? "").trim()
          };
          const sacrements: Json[] = [];
          for (const prefix of ["new-eucharistie","new-confirmation"]) {
            if (!root.querySelector<HTMLInputElement>("#enable-" + prefix)!.checked) continue;
            const date = dateValue(prefix);
            sacrements.push({
              type: prefix === "new-eucharistie" ? "eucharistie" : "confirmation",
              annee_pastorale_id: String(values.get(prefix + "-year") ?? ""),
              communaute_historique_id: String(values.get(prefix + "-community") ?? ""),
              precision: date.precision, jour: date.jour, mois: date.mois, annee: date.annee,
              lieu: String(values.get(prefix + "-lieu") ?? "").trim(),
              numero_acte: String(values.get(prefix + "-acte") ?? "").trim(),
              page_registre: String(values.get(prefix + "-page") ?? "").trim(),
              ministre: String(values.get(prefix + "-ministre") ?? "").trim(),
              parrain: String(values.get(prefix + "-parrain") ?? "").trim(),
              marraine: String(values.get(prefix + "-marraine") ?? "").trim(),
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
            const act = String(values.get("marriage_acte") ?? "").trim(), page = String(values.get("marriage_page") ?? "").trim();
            if ((!act && page) || (act && !page)) throw new Error("Pour l’événement matrimonial, renseigne ensemble le numéro d’acte et la page.");
            const spouseBaptism = dateValue("new-spouse-baptism");
            const spouseDeath = type === "obiit_conjux" ? dateValue("new-marriage-death") : { precision: "inconnue" as Precision, jour: null, mois: null, annee: null };
            mariages.push({
              type, annee_pastorale_id: String(values.get("marriage_year") ?? ""), communaute_historique_id: String(values.get("marriage_community") ?? ""),
              precision: date.precision, jour: date.jour, mois: date.mois, annee: date.annee,
              lieu: String(values.get("marriage_lieu") ?? "").trim() || null, numero_acte: act || null, page_registre: page || null,
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

      const currentCommunity = form.querySelector<HTMLSelectElement>('select[name="communaute_id"]')!;
      currentCommunity.value = communities[0]?.id ?? "";
      for (const prefix of ["new-bapteme","new-eucharistie","new-confirmation","new-marriage"]) {
        const communitySelect = form.querySelector<HTMLSelectElement>('select[name="' + prefix + '-community"]');
        if (communitySelect) communitySelect.value = currentCommunity.value;
        const yearSelect = form.querySelector<HTMLSelectElement>('select[name="' + prefix + '-year"]');
        if (yearSelect) yearSelect.value = years.some((item) => item.id === activeYear?.id) ? activeYear!.id : (years.find((item) => item.active)?.id ?? years[0]!.id);
      }
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
  const closeLivret = (): void => {
    livretModal?.classList.add("hidden");
    if (livretStage) livretStage.innerHTML = "";
    document.body.classList.remove("overflow-hidden");
  };
  const openLivret = (): void => {
    if (!livretModal || !livretStage) return;
    livretStage.innerHTML = currentBookletMarkup ||
      '<p class="rounded-lg bg-white p-8 text-sm text-slate-500">Le livret n’est pas encore disponible.</p>';
    livretModal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
  };
  container.querySelector<HTMLButtonElement>("#close-livret-3d")?.addEventListener("click", closeLivret);
  container.querySelector<HTMLButtonElement>("#open-livret-3d")?.addEventListener("click", openLivret);
  livretModal?.addEventListener("click", (event) => {
    if (event.target === livretModal) closeLivret();
  });
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
    let quartierName = "—";
    if (community) {
      const q = await supabase.from("quartiers").select("id,nom").eq("id", community.quartier_id).maybeSingle();
      if (!q.error && q.data) quartierName = q.data.nom;
    }

    nameEl.textContent = `${faithfulRecord.prenom} ${faithfulRecord.nom}`;
    subtitleEl.textContent = `${faithfulRecord.sexe === "masculin" ? "Masculin" : faithfulRecord.sexe === "feminin" ? "Féminin" : "Sexe non précisé"} · ${faithfulRecord.statut === "decede" ? "Décédé" : "Vivant"}`;

    const tabs = [...container.querySelectorAll<HTMLButtonElement>("[data-tab]")];
    let tabSequence = 0;

    const canManageFaithful = context.roles.some((role) => role === "secretaire" || role === "cure");
    const renderGeneral = async (sequence: number): Promise<void> => {
      const [sacramentResult, marriageResult, childrenResult] = await Promise.all([
        supabase.from("sacrements").select("*").eq("fidele_id", faithfulRecord.id).order("annee", { ascending: true }),
        supabase.from("evenements_matrimoniaux").select("*").or("fidele_id.eq." + faithfulRecord.id + ",conjoint_fidele_id.eq." + faithfulRecord.id).order("annee", { ascending: true }),
        supabase.from("enfants").select("*").eq("fidele_parent_id", faithfulRecord.id).order("nom").order("prenom")
      ]);
      if (sequence !== tabSequence) return;
      if (sacramentResult.error) throw sacramentResult.error;
      if (marriageResult.error) throw marriageResult.error;
      if (childrenResult.error) throw childrenResult.error;

      const sacraments = sacramentResult.data ?? [];
      const marriages = marriageResult.data ?? [];
      const children = childrenResult.data ?? [];
      const sacramentByType = new Map(sacraments.map((item) => [item.type, item]));
      const baptism = sacramentByType.get("bapteme");
      const eucharist = sacramentByType.get("eucharistie");
      const confirmation = sacramentByType.get("confirmation");
      const dateFor = (item: {jour:number|null;mois:number|null;annee:number|null;precision:Precision}|undefined): string =>
        !item || item.precision === "inconnue" ? "" : formatPartialDate(item.jour,item.mois,item.annee,item.precision);
      const paletteHtml = canManageFaithful ? '<button type="button" id="faithful-meta-toggle" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Modifier statut / couleur</button>' : '';
      const relatedIds = [...new Set(marriages.flatMap((item) => [
        item.fidele_id !== faithfulRecord.id ? item.fidele_id : null,
        item.conjoint_fidele_id
      ]).filter((id): id is string => Boolean(id)))];
      const relatedResult = relatedIds.length
        ? await supabase.from("fideles").select("id,prenom,nom").in("id", relatedIds)
        : { data: [], error: null };
      if (relatedResult.error) throw relatedResult.error;
      const relatedNames = new Map((relatedResult.data ?? []).map((item) => [item.id, item.prenom + " " + item.nom]));
      const marriageLabels: Record<string,string> = {
        ante_baptismum:"Avant le baptême", post_baptismum:"Mariage célébré",
        obiit_conjux:"Décès du conjoint", novas_nuptias:"Nouvelles noces"
      };
      const spouseNameFor = (item: typeof marriages[number]): string => {
        if (item.fidele_id !== faithfulRecord.id) return relatedNames.get(item.fidele_id) ?? item.conjoint_nom ?? "Conjoint lié";
        if (item.conjoint_fidele_id) return relatedNames.get(item.conjoint_fidele_id) ?? item.conjoint_nom ?? "Dossier lié";
        return item.conjoint_nom ?? "";
      };
      const dateForMarriage = (item: {jour:number|null;mois:number|null;annee:number|null;precision:Precision}): string =>
        item.precision === "inconnue" ? "" : formatPartialDate(item.jour,item.mois,item.annee,item.precision);
      const marriageHtml = marriages.length
        ? marriages.map((item) => {
            const spouseBaptism = item.conjoint_bapteme_precision === "inconnue" ? "" : formatPartialDate(item.conjoint_bapteme_jour,item.conjoint_bapteme_mois,item.conjoint_bapteme_annee,item.conjoint_bapteme_precision);
            const spouseDeath = item.deces_conjoint_precision === "inconnue" ? "" : formatPartialDate(item.deces_conjoint_jour,item.deces_conjoint_mois,item.deces_conjoint_annee,item.deces_conjoint_precision);
            const ownerHint = item.fidele_id !== faithfulRecord.id ? "Enregistré depuis le dossier lié du conjoint" : "";
            return '<article class="mb-2"><h3 class="text-[11px] font-bold">' + escapeHtml(marriageLabels[item.type] ?? item.type) + '</h3>' +
              bookletLine("cum",spouseNameFor(item)) + bookletLine("in",item.lieu) + bookletLine("die",dateForMarriage(item)) +
              bookletLine("n°",item.numero_acte) + bookletLine("Page",item.page_registre) +
              bookletLine("Bapt. conjoint",item.conjoint_lieu_bapteme) + bookletLine("date bapt.",spouseBaptism) +
              (item.type === "obiit_conjux" ? bookletLine("Décès",spouseDeath) : "") +
              bookletLine("Ministre",item.ministre) + bookletLine("Visa",item.visa) +
              (ownerHint ? '<p class="mt-1 text-[9px] italic text-slate-500">' + escapeHtml(ownerHint) + '</p>' : "") + '</article>';
          }).join('<hr class="my-1 border-0 border-t-2 border-black/70" />')
        : '<p class="mt-2 text-[10px] italic text-slate-500">Aucun événement matrimonial.</p>' + Array.from({length:2},() => bookletLine("in","")).join("");
      const childSlots = Math.max(5,children.length);
      const childrenHtml = Array.from({length:childSlots},(_,index) => {
        const child = children[index];
        if (!child) {
          return '<div class="mb-1">' + bookletLine(String(index+1)+")","") + bookletLine("nat","") +
            bookletLine("bapt. in","") + bookletLine("die","") + bookletLine("n°","") + '</div>';
        }
        const childBirth = child.naissance_precision === "inconnue" ? "" : formatPartialDate(child.naissance_jour,child.naissance_mois,child.naissance_annee,child.naissance_precision);
        const childBaptism = child.bapteme_precision === "inconnue" ? "" : formatPartialDate(child.bapteme_jour,child.bapteme_mois,child.bapteme_annee,child.bapteme_precision);
        return '<div class="mb-1">' + bookletLine(String(index+1)+")",child.prenom + " " + child.nom) +
          bookletLine("nat",childBirth) + bookletLine("bapt. in",child.lieu_bapteme) +
          bookletLine("die",childBaptism) + bookletLine("n°",child.numero_acte) + '</div>';
      }).join("");
      const death = faithfulRecord.deces_precision === "inconnue" ? "" : formatPartialDate(faithfulRecord.deces_jour,faithfulRecord.deces_mois,faithfulRecord.deces_annee,faithfulRecord.deces_precision);
      const birth = faithfulRecord.naissance_precision === "inconnue" ? "" : formatPartialDate(faithfulRecord.naissance_jour,faithfulRecord.naissance_mois,faithfulRecord.naissance_annee,faithfulRecord.naissance_precision);
      const bookletSacramentBlock = (title: string, item: typeof baptism): string => {
        return '<hr class="my-1 border-0 border-t-2 border-black/70" /><h3 class="text-[11px] font-bold tracking-wide">' + title + '</h3>' +
          bookletLine("in",item?.lieu) + bookletLine("die",dateFor(item)) + bookletLine("n°",item?.numero_acte) +
          bookletLine("Page",item?.page_registre) + bookletLine("Suscepit",item?.parrain) +
          bookletLine("Matrina",item?.marraine) + bookletLine("Ministre",item?.ministre) + bookletLine("Visa",item?.visa);
      };
      const bookletCardHtml = `
        <section class="livret-card-sheet mx-auto flex w-full max-w-[1123px] flex-col overflow-hidden border-2 border-black bg-white shadow-2xl" style="width:min(100%,1123px,calc((100dvh - 64px)*297/210));aspect-ratio:297/210;background:${cardGradient(faithfulRecord.carte_couleur)}">
          <header class="shrink-0 border-b-2 border-black px-4 py-2 text-center sm:px-6">
            <p class="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-700">Paroisse · ${escapeHtml(getAppConfig().parishName)}</p>
            <h2 class="mt-0.5 font-serif text-lg font-bold uppercase tracking-[0.18em] text-slate-950 sm:text-xl">Liber memorialis</h2>
            <p class="mt-0.5 text-[9px] text-slate-700">Registre personnel · ${escapeHtml(faithfulRecord.prenom)} ${escapeHtml(faithfulRecord.nom)}</p>
          </header>
          <div class="grid min-h-0 flex-1 grid-cols-3 divide-x-2 divide-black overflow-hidden">
            <section class="min-w-0 overflow-y-auto px-2 py-2 sm:px-4">
              <h3 class="mb-1 text-center text-[11px] font-bold tracking-[0.18em]">IDENTITAS</h3>
              ${bookletLine("Nomen",faithfulRecord.prenom)}${bookletLine("Familia",faithfulRecord.nom)}${bookletLine("Sexus",faithfulRecord.sexe === "masculin" ? "Masculin" : "Féminin")}${bookletLine("Pater",faithfulRecord.nom_pere)}${bookletLine("Mater",faithfulRecord.nom_mere)}${bookletLine("Nat. in",faithfulRecord.lieu_naissance)}${bookletLine("die",birth)}
              <hr class="my-1 border-0 border-t-2 border-black/80" />
              <h3 class="text-[11px] font-bold tracking-wide">BAPTISMUM</h3>
              ${bookletLine("in",baptism?.lieu)}${bookletLine("die",dateFor(baptism))}${bookletLine("n°",baptism?.numero_acte)}${bookletLine("Page",baptism?.page_registre)}${bookletLine("Suscepit",baptism?.parrain)}${bookletLine("Matrina",baptism?.marraine)}${bookletLine("Ministre",baptism?.ministre)}${bookletLine("Visa",baptism?.visa)}
              ${bookletSacramentBlock("EUCHARISTIA",eucharist)}
              ${bookletSacramentBlock("CONFIRMATIO",confirmation)}
            </section>
            <section class="min-w-0 overflow-y-auto px-2 py-2 sm:px-4">
              <h3 class="mb-1 text-center text-[11px] font-bold tracking-[0.18em]">MATRIMONIUM</h3>
              ${marriageHtml}
              <div class="mt-2 border-t-2 border-black pt-1">
                ${bookletLine("Communitas",community?.nom)}${bookletLine("Quartier",quartierName)}${bookletLine("Depuis",faithfulRecord.communaute_depuis)}${bookletLine("Statut",faithfulRecord.statut === "decede" ? "Décédé" : "Vivant")}${faithfulRecord.statut === "decede" ? bookletLine("Décès",death) : ""}
              </div>
            </section>
            <section class="min-w-0 overflow-y-auto px-2 py-2 sm:px-4">
              <h3 class="mb-1 text-center text-[12px] font-bold tracking-[0.18em]">LIBERI</h3>
              ${childrenHtml}
              ${children.length > 5 ? '<p class="mt-1 border-t border-black/60 pt-1 text-[9px] italic text-slate-600">' + children.length + ' enfants inscrits · suite conservée</p>' : ""}
            </section>
          </div>
          <footer class="shrink-0 border-t-2 border-black px-3 py-1 text-center text-[8px] text-slate-700">Enoria · Document de consultation · Les registres papier demeurent la référence officielle</footer>
        </section>`;
      currentBookletMarkup = bookletCardHtml;
      contentEl.innerHTML = `
        <div class="space-y-3">
          <section class="page-card p-4 sm:p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div><p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Aperçu du dossier</p>
                <h2 class="mt-1 text-base font-semibold text-slate-900">${escapeHtml(faithfulRecord.prenom)} ${escapeHtml(faithfulRecord.nom)}</h2>
                <p class="mt-0.5 text-xs text-slate-500">${escapeHtml(community?.nom ?? "Communauté inconnue")} · ${faithfulRecord.statut === "decede" ? "Décédé" : "Vivant"}</p>
              </div>
              ${paletteHtml}
            </div>
            <div class="mt-3 grid gap-2 sm:grid-cols-3">
              <div class="rounded-lg bg-slate-50 p-2.5"><p class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Naissance</p><p class="mt-0.5 text-xs font-medium text-slate-800">${escapeHtml(birth || "Non renseignée")}</p></div>
              <div class="rounded-lg bg-slate-50 p-2.5"><p class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Sacrements</p><p class="mt-0.5 text-xs font-medium text-slate-800">${sacraments.length} inscrit(s)</p></div>
              <div class="rounded-lg bg-slate-50 p-2.5"><p class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Famille</p><p class="mt-0.5 text-xs font-medium text-slate-800">${children.length} enfant(s) · ${marriages.length} événement(s) matrimonial(aux)</p></div>
            </div>
            <button type="button" data-open-booklet class="mt-3 flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50/40">
              <span><span class="block text-sm font-semibold text-slate-900">Ouvrir le livret complet</span><span class="mt-0.5 block text-[11px] text-slate-500">Carte A4 paysage · 3 colonnes reliées · plein écran</span></span>
              <span class="grid h-11 w-24 shrink-0 grid-cols-3 overflow-hidden rounded border-2 border-black bg-rose-50 text-[7px] text-slate-500">
                <span class="border-r-2 border-black p-1">IDENTITAS</span><span class="border-r-2 border-black p-1">MATR.</span><span class="p-1">LIBERI</span>
              </span>
            </button>
          </section>
          ${canManageFaithful ? `
          <form id="faithful-meta-form" class="hidden rounded-xl border border-slate-200 bg-white p-4">
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="text-xs font-medium text-slate-600">Statut de vie<select id="profile-status" name="statut" class="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="vivant" ${faithfulRecord.statut === "vivant" ? "selected" : ""}>Vivant</option><option value="decede" ${faithfulRecord.statut === "decede" ? "selected" : ""}>Décédé</option></select></label>
              <div class="text-xs font-medium text-slate-600">Couleur de la carte<div class="mt-2 grid grid-cols-5 gap-2">${renderCardColorChoices(faithfulRecord.carte_couleur,"profile_carte_couleur")}</div></div>
            </div>
            <fieldset id="profile-death-fields" ${faithfulRecord.statut === "decede" ? "" : "disabled"} class="mt-3 rounded-xl bg-slate-50 p-3"><p class="mb-2 text-xs font-semibold text-slate-600">Date du décès (facultative si inconnue)</p>${partialDateFields("profile-death")}</fieldset>
            <div class="mt-3 flex flex-wrap justify-end gap-2"><button type="button" id="faithful-meta-cancel" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">Annuler</button><button type="submit" class="rounded-lg bg-[var(--enoria-green)] px-3 py-2 text-xs font-semibold text-white">Enregistrer</button></div><p id="faithful-meta-feedback" class="mt-3 hidden rounded-lg p-3 text-sm" role="status"></p>
          </form>` : ""}
        </div>`;
      contentEl.querySelectorAll<HTMLButtonElement>("[data-open-booklet]").forEach((button) => button.addEventListener("click", openLivret));

      if (canManageFaithful) {
        const editor = contentEl.querySelector<HTMLFormElement>("#faithful-meta-form")!;
        const editorFeedback = editor.querySelector<HTMLElement>("#faithful-meta-feedback")!;
        const statusSelect = editor.querySelector<HTMLSelectElement>("#profile-status")!;
        const deathFields = editor.querySelector<HTMLFieldSetElement>("#profile-death-fields")!;
        const precision = editor.querySelector<HTMLSelectElement>("#profile-death-precision")!;
        editor.querySelector<HTMLInputElement>("#profile-death-day")!.value = faithfulRecord.deces_jour?.toString() ?? "";
        editor.querySelector<HTMLInputElement>("#profile-death-month")!.value = faithfulRecord.deces_mois?.toString() ?? "";
        editor.querySelector<HTMLInputElement>("#profile-death-year")!.value = faithfulRecord.deces_annee?.toString() ?? "";
        precision.value = faithfulRecord.deces_precision;
        bindPartialDate(editor,"profile-death");
        contentEl.querySelector<HTMLButtonElement>("#faithful-meta-toggle")!.addEventListener("click",() => editor.classList.toggle("hidden"));
        editor.querySelector<HTMLButtonElement>("#faithful-meta-cancel")!.addEventListener("click",() => editor.classList.add("hidden"));
        statusSelect.addEventListener("change",() => { deathFields.disabled = statusSelect.value !== "decede"; });
        editor.addEventListener("submit",async(event) => {
          event.preventDefault();
          const submit = editor.querySelector<HTMLButtonElement>('button[type="submit"]')!;
          submit.disabled = true; submit.textContent = "Enregistrement…";
          try {
            const nextStatus = statusSelect.value as "vivant" | "decede";
            const date = nextStatus === "decede" ? collectPartialDate(editor,"profile-death") : {precision:"inconnue" as Precision,jour:null,mois:null,annee:null};
            const color = editor.querySelector<HTMLInputElement>('input[name="profile_carte_couleur"]:checked')?.value ?? "rose";
            const {data,error} = await supabase.from("fideles").update({statut:nextStatus,deces_jour:date.jour,deces_mois:date.mois,deces_annee:date.annee,deces_precision:date.precision,carte_couleur:color}).eq("id",faithfulRecord.id).select("*").single();
            if(error) throw error;
            Object.assign(faithfulRecord,data);
            subtitleEl.textContent = (faithfulRecord.sexe === "masculin" ? "Masculin" : "Féminin") + " · " + (faithfulRecord.statut === "decede" ? "Décédé" : "Vivant");
            await renderGeneral(sequence);
          } catch(error) {
            editorFeedback.textContent = error instanceof Error ? error.message : "Modification impossible.";
            editorFeedback.className = "mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"; editorFeedback.classList.remove("hidden");
          } finally { submit.disabled = false; submit.textContent = "Enregistrer"; }
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
          const [sacramentResult, marriageResult, mentionResult, yearResult, communityResult, partnerResult] = await Promise.all([
            supabase.from("sacrements").select("*").eq("fidele_id", faithfulRecord.id).order("annee", { ascending: true }),
            supabase.from("evenements_matrimoniaux").select("*").or("fidele_id.eq." + faithfulRecord.id + ",conjoint_fidele_id.eq." + faithfulRecord.id).order("annee", { ascending: true }),
            supabase.from("mentions_livret").select("*").eq("fidele_id", faithfulRecord.id).order("created_at", { ascending: false }),
            supabase.from("annees_pastorales").select("id,libelle,date_debut,active").eq("paroisse_id", faithfulRecord.paroisse_id).order("date_debut", { ascending: false }),
            supabase.from("communautes").select("id,nom").eq("paroisse_id", faithfulRecord.paroisse_id).order("nom"),
            supabase.from("fideles").select("id,prenom,nom").eq("paroisse_id", faithfulRecord.paroisse_id).order("nom").order("prenom").limit(1000)
          ]);
          if (sequence !== tabSequence) return;
          if (sacramentResult.error) throw sacramentResult.error;
          if (marriageResult.error) throw marriageResult.error;
          if (mentionResult.error) throw mentionResult.error;
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
          const lookupsReady = years.length > 0 && communities.length > 0;

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
            const yearsHtml = years.map((item) => '<option value="' + escapeHtml(item.id) + '" ' + selected(record?.annee_pastorale_id,item.id) + '>' + escapeHtml(item.libelle) + '</option>').join("");
            const communitiesHtml = communities.map((item) => '<option value="' + escapeHtml(item.id) + '" ' + selected(record?.communaute_historique_id,item.id) + '>' + escapeHtml(item.nom) + '</option>').join("");
            return '<form class="sacrament-editor mt-3 space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/30 p-4" data-record-id="' + escapeHtml(id) + '" data-date-prefix="' + escapeHtml(prefix) + '">' +
              '<div class="flex items-center justify-between gap-3"><h4 class="text-sm font-semibold text-slate-900">' + (record ? "Modifier " + escapeHtml(sacramentLabels[record.type]) : "Nouveau sacrement") + '</h4><span class="text-[10px] text-slate-500">' + (record ? "Modification" : "Création") + '</span></div>' +
              '<div class="grid gap-3 sm:grid-cols-3">' + typeControl +
                '<label class="' + fieldLabel + '">Année pastorale<select name="annee_pastorale_id" required class="' + fieldClass + '">' + yearsHtml + '</select></label>' +
                '<label class="' + fieldLabel + '">Communauté de célébration<select name="communaute_historique_id" required class="' + fieldClass + '">' + communitiesHtml + '</select></label></div>' +
              '<div><p class="mb-2 text-xs font-semibold text-slate-600">Date du sacrement</p>' + partialDateFields(prefix) + '</div>' +
              '<div class="grid gap-3 sm:grid-cols-2">' +
                '<label class="' + fieldLabel + '">Lieu<input name="lieu" maxlength="160" value="' + escapeHtml(record?.lieu ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + '">Ministre<input name="ministre" maxlength="160" value="' + escapeHtml(record?.ministre ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + '">Numéro d’acte<input name="numero_acte" maxlength="80" value="' + escapeHtml(record?.numero_acte ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + '">Page du registre<input name="page_registre" maxlength="80" value="' + escapeHtml(record?.page_registre ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + '">Parrain<input name="parrain" maxlength="160" value="' + escapeHtml(record?.parrain ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + '">Marraine<input name="marraine" maxlength="160" value="' + escapeHtml(record?.marraine ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + ' sm:col-span-2">Visa / observation<input name="visa" maxlength="200" value="' + escapeHtml(record?.visa ?? "") + '" class="' + fieldClass + '" /></label>' +
              '</div><p class="text-[11px] leading-5 text-slate-500">Le numéro d’acte et la page sont obligatoires pour le baptême. Le parrain et la marraine sont enregistrés directement sur ce sacrement.</p>' +
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
            const yearsHtml = years.map((item) => '<option value="' + escapeHtml(item.id) + '" ' + selected(record?.annee_pastorale_id,item.id) + '>' + escapeHtml(item.libelle) + '</option>').join("");
            const communitiesHtml = communities.map((item) => '<option value="' + escapeHtml(item.id) + '" ' + selected(record?.communaute_historique_id,item.id) + '>' + escapeHtml(item.nom) + '</option>').join("");
            const partnerHtml = '<option value="">Aucun dossier lié · nom libre</option>' + partners
              .filter((item) => item.id !== faithfulRecord.id)
              .map((item) => '<option value="' + escapeHtml(item.id) + '" ' + selected(record?.conjoint_fidele_id,item.id) + '>' + escapeHtml(item.prenom + " " + item.nom) + '</option>').join("");
            const partnerName = record?.conjoint_fidele_id
              ? partnerNames.get(record.conjoint_fidele_id) ?? record.conjoint_nom ?? ""
              : record?.conjoint_nom ?? "";
            return '<form class="marriage-editor mt-3 space-y-4 rounded-xl border border-amber-100 bg-amber-50/30 p-4" data-record-id="' + escapeHtml(id) + '" data-date-prefix="' + escapeHtml(prefix) + '" data-baptism-prefix="' + escapeHtml(spouseBirthPrefix) + '" data-death-prefix="' + escapeHtml(spouseDeathPrefix) + '">' +
              '<div class="flex items-center justify-between gap-3"><h4 class="text-sm font-semibold text-slate-900">' + (record ? "Modifier l’événement matrimonial" : "Nouvel événement matrimonial") + '</h4><span class="text-[10px] text-slate-500">Mariage · liens de conjoints</span></div>' +
              '<div class="grid gap-3 sm:grid-cols-2">' +
                '<label class="' + fieldLabel + '">Nature de l’événement<select name="type" required class="' + fieldClass + '">' + typeOptions + '</select></label>' +
                '<label class="' + fieldLabel + '">Année pastorale<select name="annee_pastorale_id" required class="' + fieldClass + '">' + yearsHtml + '</select></label>' +
                '<label class="' + fieldLabel + '">Communauté de l’événement<select name="communaute_historique_id" required class="' + fieldClass + '">' + communitiesHtml + '</select></label>' +
                '<label class="' + fieldLabel + '">Lier au dossier d’un fidèle<select name="conjoint_fidele_id" class="' + fieldClass + '">' + partnerHtml + '</select></label>' +
                '<label class="' + fieldLabel + ' sm:col-span-2">Nom du conjoint<input name="conjoint_nom" maxlength="160" value="' + escapeHtml(partnerName) + '" class="' + fieldClass + '" placeholder="À utiliser si le conjoint n’est pas inscrit dans la paroisse" /></label>' +
              '</div>' +
              '<div><p class="mb-2 text-xs font-semibold text-slate-600">Date de l’événement matrimonial</p>' + partialDateFields(prefix) + '</div>' +
              '<div class="grid gap-3 sm:grid-cols-2">' +
                '<label class="' + fieldLabel + '">Lieu<input name="lieu" maxlength="160" value="' + escapeHtml(record?.lieu ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + '">Ministre<input name="ministre" maxlength="160" value="' + escapeHtml(record?.ministre ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + '">Numéro d’acte<input name="numero_acte" maxlength="80" value="' + escapeHtml(record?.numero_acte ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + '">Page du registre<input name="page_registre" maxlength="80" value="' + escapeHtml(record?.page_registre ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + ' sm:col-span-2">Lieu de baptême du conjoint<input name="conjoint_lieu_bapteme" maxlength="160" value="' + escapeHtml(record?.conjoint_lieu_bapteme ?? "") + '" class="' + fieldClass + '" /></label>' +
                '<label class="' + fieldLabel + ' sm:col-span-2">Visa / observation<input name="visa" maxlength="200" value="' + escapeHtml(record?.visa ?? "") + '" class="' + fieldClass + '" /></label>' +
              '</div>' +
              '<div class="rounded-lg border border-slate-200 bg-white p-3"><p class="mb-2 text-xs font-semibold text-slate-700">Baptême du conjoint</p>' + partialDateFields(spouseBirthPrefix) + '</div>' +
              '<fieldset data-spouse-death-fields ' + (record?.type === "obiit_conjux" ? "" : "disabled") + ' class="rounded-lg border border-slate-200 bg-white p-3"><p class="mb-2 text-xs font-semibold text-slate-700">Date de décès du conjoint (si événement de décès)</p>' + partialDateFields(spouseDeathPrefix) + '</fieldset>' +
              '<p class="text-[11px] leading-5 text-slate-500">Le lien sélectionne un dossier de la même paroisse. Pour un conjoint non inscrit, conserve le nom libre : aucun dossier ne sera inventé.</p>' +
              '<p class="editor-feedback hidden rounded-lg p-3 text-sm" role="status"></p>' +
              '<div class="flex justify-end gap-2"><button type="button" data-cancel-editor class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">Annuler</button><button type="submit" class="rounded-lg bg-[var(--enoria-green)] px-4 py-2 text-xs font-semibold text-white">Enregistrer l’événement</button></div></form>';
          };

          const sacramentCards = sacramentRecords.map((item) => {
            const id = item.id;
            const label = sacramentLabels[item.type] ?? item.type;
            return '<article class="rounded-xl border border-slate-200 bg-white p-4">' +
              '<div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-semibold text-slate-900">' + escapeHtml(label) + '</h3>' +
              '<p class="mt-1 text-xs text-slate-500">' + escapeHtml(formatPartialDate(item.jour,item.mois,item.annee,item.precision)) + ' · Acte ' + escapeHtml(item.numero_acte ?? "—") + ' · Page ' + escapeHtml(item.page_registre ?? "—") + '</p>' +
              '<p class="mt-1 text-xs text-slate-600">Parrain : ' + escapeHtml(item.parrain ?? "—") + ' · Marraine : ' + escapeHtml(item.marraine ?? "—") + '</p>' +
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
              '<p class="mt-1 text-xs text-slate-700">Conjoint : <strong>' + escapeHtml(spouseName) + '</strong>' + (partnerId ? ' · <span class="font-semibold text-emerald-700">Dossier relié</span>' : ' · Nom libre') + '</p>' +
              '<p class="mt-1 text-xs text-slate-500">Acte ' + escapeHtml(item.numero_acte ?? "—") + ' · Page ' + escapeHtml(item.page_registre ?? "—") + '</p>' +
              '<p class="mt-1 text-[11px] text-slate-500">Baptême du conjoint : ' + escapeHtml(spouseBirth) + (item.type === "obiit_conjux" ? ' · Décès : ' + escapeHtml(spouseDeath) : "") + '</p>' +
              '<p class="mt-1 text-[11px] text-slate-500">Ministre : ' + escapeHtml(item.ministre ?? "—") + ' · Visa : ' + escapeHtml(item.visa ?? "—") + (isIncoming ? ' · Visible via le dossier matrimonial lié' : "") + '</p></div>' +
              (canWrite && !isIncoming ? '<button type="button" data-edit-marriage="' + escapeHtml(item.id) + '" class="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-amber-50">Modifier</button>' : "") + '</div>' +
              (canWrite && !isIncoming ? '<div id="marriage-editor-' + escapeHtml(item.id) + '" class="hidden">' + marriageFormHtml(item) + '</div>' : "") + '</article>';
          }).join("");

          const mentionsHtml = (mentionResult.data ?? []).map((item) =>
            '<li class="flex justify-between gap-3 py-2 text-xs"><span>' + escapeHtml(item.type_mention) + '</span><span class="text-slate-500">' + escapeHtml(item.statut) + '</span></li>'
          ).join("");
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
                <div class="flex flex-wrap items-center justify-between gap-3"><div><p class="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Vie matrimoniale</p><h2 class="mt-1 font-semibold text-slate-900">Mariages et liens entre fidèles</h2><p class="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Les mariages sont gérés ici avec les sacrements, mais conservent leur table dédiée. Un conjoint déjà inscrit peut être relié à son propre dossier paroissial.</p></div>${canWrite && lookupsReady ? '<button id="add-marriage-toggle" type="button" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">＋ Ajouter un événement / lien</button>' : ""}</div>
                <div id="new-marriage-wrap" class="hidden">${canWrite && lookupsReady ? marriageFormHtml() : ""}</div>
                <div class="mt-4 space-y-3">${marriagesHtml || '<p class="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Aucun mariage ni lien matrimonial enregistré.</p>'}</div>
              </section>
              <section class="page-card p-5"><h2 class="font-semibold text-slate-900">Mentions complémentaires du livret</h2><ul class="mt-3 divide-y divide-slate-100">${mentionsHtml || '<li class="py-2 text-sm text-slate-400">Aucune mention enregistrée.</li>'}</ul></section>
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
            const yearSelect = form.querySelector<HTMLSelectElement>('select[name="annee_pastorale_id"]')!;
            const communitySelect = form.querySelector<HTMLSelectElement>('select[name="communaute_historique_id"]')!;
            if (!yearSelect.value) yearSelect.value = years.find((item) => item.id === activeYear?.id)?.id ?? years.find((item) => item.active)?.id ?? years[0]?.id ?? "";
            if (!communitySelect.value) communitySelect.value = communities.find((item) => item.id === faithfulRecord.communaute_id)?.id ?? communities[0]?.id ?? "";
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
                const page = String(values.get("page_registre") ?? "").trim();
                if (type === "bapteme" && (!act || !page)) throw new Error("Le baptême exige un numéro d’acte et une page de registre.");
                const payload = {
                  annee_pastorale_id:String(values.get("annee_pastorale_id") ?? ""),
                  communaute_historique_id:String(values.get("communaute_historique_id") ?? ""),
                  jour:date.jour, mois:date.mois, annee:date.annee, precision:date.precision,
                  lieu:String(values.get("lieu") ?? "").trim() || null,
                  numero_acte:act || null, page_registre:page || null,
                  reference_registre_requise:type === "bapteme" || Boolean(act && page),
                  ministre:String(values.get("ministre") ?? "").trim() || null,
                  parrain:String(values.get("parrain") ?? "").trim() || null,
                  marraine:String(values.get("marraine") ?? "").trim() || null,
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
            const yearSelect = form.querySelector<HTMLSelectElement>('select[name="annee_pastorale_id"]')!;
            const communitySelect = form.querySelector<HTMLSelectElement>('select[name="communaute_historique_id"]')!;
            if (!yearSelect.value) yearSelect.value = years.find((item) => item.id === activeYear?.id)?.id ?? years.find((item) => item.active)?.id ?? years[0]?.id ?? "";
            if (!communitySelect.value) communitySelect.value = communities.find((item) => item.id === faithfulRecord.communaute_id)?.id ?? communities[0]?.id ?? "";
            const partnerSelect = form.querySelector<HTMLSelectElement>('select[name="conjoint_fidele_id"]')!;
            const partnerNameInput = form.querySelector<HTMLInputElement>('input[name="conjoint_nom"]')!;
            partnerSelect.addEventListener("change",() => {
              const partner = partners.find((item) => item.id === partnerSelect.value);
              if (partner) partnerNameInput.value = partner.prenom + " " + partner.nom;
              else partnerNameInput.value = "";
            });
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
                const page = String(values.get("page_registre") ?? "").trim();
                if ((act && !page) || (!act && page)) throw new Error("Le numéro d’acte et la page doivent être renseignés ensemble.");
                const partnerId = String(values.get("conjoint_fidele_id") ?? "") || null;
                const partner = partnerId ? partners.find((item) => item.id === partnerId) : undefined;
                const partnerName = String(values.get("conjoint_nom") ?? "").trim() || (partner ? partner.prenom + " " + partner.nom : "");
                const payload = {
                  annee_pastorale_id:String(values.get("annee_pastorale_id") ?? ""),
                  communaute_historique_id:String(values.get("communaute_historique_id") ?? ""),
                  type:typeSelect.value as Database["public"]["Enums"]["type_evenement_matrimonial"],
                  jour:date.jour, mois:date.mois, annee:date.annee, precision:date.precision,
                  lieu:String(values.get("lieu") ?? "").trim() || null,
                  numero_acte:act || null, page_registre:page || null,
                  conjoint_fidele_id:partnerId, conjoint_nom:partnerName || null,
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
          const years=new Map((yearResult.data??[]).map((item)=>[item.id,item.libelle]));
          const entries=dimeResult.data??[];
          const totals=new Map<string,number>();
          for(const item of entries)totals.set(item.devise,(totals.get(item.devise)??0)+item.montant);
          const rows=entries.map((item)=>'<tr class="border-b border-slate-100 last:border-0"><td class="px-3 py-3 font-medium text-slate-800">'+escapeHtml(years.get(item.annee_pastorale_id)??"Année inconnue")+'</td><td class="px-3 py-3 text-right tabular-nums">'+escapeHtml(item.montant.toLocaleString("fr-CD",{maximumFractionDigits:2}))+'</td><td class="px-3 py-3">'+escapeHtml(item.devise)+'</td><td class="px-3 py-3 text-slate-500">'+escapeHtml(item.observation??"—")+'</td></tr>').join("");
          contentEl.innerHTML='<div class="space-y-4"><section class="page-card p-5"><div class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="font-semibold text-slate-800">Dîmes du fidèle</h2><p class="mt-1 text-xs text-slate-500">Registre distinct du livret sacramentel · une contribution par année pastorale</p></div><span class="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">'+entries.length+' contribution(s)</span></div><div class="mt-4 grid gap-3 sm:grid-cols-2"><div class="rounded-xl border border-slate-100 bg-slate-50 p-4"><p class="text-xs text-slate-500">Total en USD</p><p class="mt-1 text-xl font-semibold tabular-nums text-slate-900">'+(totals.get("USD")??0).toLocaleString("fr-CD",{maximumFractionDigits:2})+'</p></div><div class="rounded-xl border border-slate-100 bg-slate-50 p-4"><p class="text-xs text-slate-500">Total en FC</p><p class="mt-1 text-xl font-semibold tabular-nums text-slate-900">'+(totals.get("FC")??0).toLocaleString("fr-CD",{maximumFractionDigits:2})+'</p></div></div><div class="mt-5 overflow-x-auto"><table class="w-full min-w-[520px] text-left text-sm"><thead class="border-y border-slate-100 bg-slate-50 text-xs text-slate-500"><tr><th class="px-3 py-3 font-medium">Année pastorale</th><th class="px-3 py-3 text-right font-medium">Montant</th><th class="px-3 py-3 font-medium">Devise</th><th class="px-3 py-3 font-medium">Observation</th></tr></thead><tbody>'+(rows||'<tr><td colspan="4" class="px-3 py-12 text-center text-sm text-slate-400">Aucune dîme enregistrée pour ce fidèle.</td></tr>')+'</tbody></table></div></section></div>';
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
    return closeLivret;
  } catch (error) {
    nameEl.textContent = "Dossier indisponible";
    subtitleEl.textContent = "Les informations ne sont pas accessibles avec ce compte.";
    contentEl.innerHTML = `<section class="page-card p-5 text-sm text-rose-700">${escapeHtml(error instanceof Error ? error.message : "Impossible de charger le dossier.")}</section>`;
    return closeLivret;
  }
}
