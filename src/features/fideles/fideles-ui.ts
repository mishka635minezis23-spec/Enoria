import type { Database, Tables } from "../../types/database.types";
import type { UserContext } from "../../auth/auth-service";
import { getSupabaseClient } from "../../lib/supabase";
import {
  getFaithfulListQuery,
  getFaithfulReturnQuery,
  navigateToFaithful,
  navigateToFaithfulList,
  updateFaithfulListQuery
} from "../../router";

type Precision = Database["public"]["Enums"]["precision_date"];
type Fidele = Tables<"fideles">;
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

  const params = readListParams();
  search.value = params.get("q") ?? "";
  quartierSelect.value = params.get("quartier") ?? "";
  communitySelect.value = params.get("communaute") ?? "";
  sexSelect.value = params.get("sexe") ?? "";
  statusSelect.value = params.get("statut") ?? "";

  let communities: Pick<Community, "id" | "nom" | "quartier_id">[] = [];
  let quartiers: Pick<Quartier, "id" | "nom">[] = [];
  let requestSequence = 0;

  function syncOptions(): void {
    const selectedQuartier = quartierSelect.value;
    const selectedCommunity = communitySelect.value;
    quartierSelect.innerHTML = '<option value="">Tous les quartiers</option>' +
      quartiers.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nom)}</option>`).join("");
    communitySelect.innerHTML = '<option value="">Toutes les communautés</option>' +
      communities
        .filter((item) => !selectedQuartier || item.quartier_id === selectedQuartier)
        .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nom)}</option>`)
        .join("");
    quartierSelect.value = selectedQuartier;
    communitySelect.value = selectedCommunity;
    if (communitySelect.value && ![...communitySelect.options].some((option) => option.value === communitySelect.value)) {
      communitySelect.value = "";
    }
  }

  function persistFilters(resetPage: boolean): void {
    const nextParams = new URLSearchParams();
    const term = safeSearchTerm(search.value);
    if (term) nextParams.set("q", term);
    if (quartierSelect.value) nextParams.set("quartier", quartierSelect.value);
    if (communitySelect.value) nextParams.set("communaute", communitySelect.value);
    if (sexSelect.value) nextParams.set("sexe", sexSelect.value);
    if (statusSelect.value) nextParams.set("statut", statusSelect.value);
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
    feedback.classList.add("hidden");
    rowsNode.innerHTML = '<tr><td colspan="7" class="px-3 py-12 text-center text-sm text-slate-400">Chargement du registre…</td></tr>';
    previous.disabled = true;
    next.disabled = true;
    countNode.textContent = "Chargement…";
    pageNode.textContent = `Page ${page}`;

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
      if (current.get("statut")) query = query.eq("statut", current.get("statut")!);
      if (current.get("communaute")) {
        query = query.eq("communaute_id", current.get("communaute")!);
      } else if (current.get("quartier")) {
        const communityIds = communities
          .filter((item) => item.quartier_id === current.get("quartier"))
          .map((item) => item.id);
        if (communityIds.length === 0) {
          rowsNode.innerHTML = '<tr><td colspan="7" class="px-3 py-12 text-center text-sm text-slate-400">Aucun fidèle dans ce quartier.</td></tr>';
          countNode.textContent = "0 résultat";
          previous.disabled = page <= 1;
          next.disabled = true;
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
        rowsNode.innerHTML = '<tr><td colspan="7" class="px-3 py-12 text-center text-sm text-slate-400">Aucun fidèle ne correspond à cette recherche.</td></tr>';
      } else {
        rowsNode.innerHTML = data.map((item, index) => {
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
      countNode.textContent = `${total.toLocaleString("fr-CD")} fidèle(s)`;
      pageNode.textContent = `Page ${page}`;
      previous.disabled = page <= 1;
      next.disabled = from + data.length >= total;
    } catch (error) {
      if (sequence !== requestSequence) return;
      rowsNode.innerHTML = '<tr><td colspan="7" class="px-3 py-12 text-center text-sm text-rose-600">Impossible de charger le registre.</td></tr>';
      setFeedback(feedback, error instanceof Error ? error.message : "Erreur de lecture du registre.", "error");
      feedback.classList.remove("hidden");
      countNode.textContent = "Registre indisponible";
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    persistFilters(true);
    void loadRows();
  });
  for (const select of [quartierSelect, communitySelect, sexSelect, statusSelect]) {
    select.addEventListener("change", () => {
      if (select === quartierSelect) {
        communitySelect.value = "";
        syncOptions();
      }
      persistFilters(true);
      void loadRows();
    });
  }
  previous.addEventListener("click", () => {
    const current = readListParams();
    current.set("page", String(Math.max(1, Number(current.get("page") ?? "1") - 1)));
    writeListParams(current);
    void loadRows();
  });
  next.addEventListener("click", () => {
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

export async function mountFaithfulProfile(
  container: HTMLElement,
  context: UserContext,
  faithfulId: string
): Promise<void> {
  const returnQuery = getFaithfulReturnQuery();
  container.querySelector<HTMLButtonElement>("#faithful-back")?.addEventListener("click", () => navigateToFaithfulList(returnQuery));
  const nameNode = container.querySelector<HTMLElement>("#profile-name");
  const subtitleNode = container.querySelector<HTMLElement>("#profile-subtitle");
  const contentNode = container.querySelector<HTMLElement>("#profile-content");
  const feedback = container.querySelector<HTMLElement>("#profile-feedback");
  if (!nameNode || !subtitleNode || !contentNode || !feedback) return;

  const supabase = getSupabaseClient();
  try {
    const { data: faithful, error } = await supabase.from("fideles").select("*").eq("id", faithfulId).maybeSingle();
    if (error) throw error;
    if (!faithful) throw new Error("Fidèle introuvable ou accès non autorisé.");

    const communityResult = await supabase
      .from("communautes")
      .select("id,nom,quartier_id")
      .eq("id", faithful.communaute_id)
      .maybeSingle();
    if (communityResult.error) throw communityResult.error;
    const community = communityResult.data;
    let quartierName = "—";
    if (community) {
      const q = await supabase.from("quartiers").select("id,nom").eq("id", community.quartier_id).maybeSingle();
      if (!q.error && q.data) quartierName = q.data.nom;
    }

    nameNode.textContent = `${faithful.prenom} ${faithful.nom}`;
    subtitleNode.textContent = `${faithful.sexe === "masculin" ? "Masculin" : faithful.sexe === "feminin" ? "Féminin" : "Sexe non précisé"} · ${faithful.statut === "decede" ? "Décédé" : "Vivant"}`;

    const tabs = [...container.querySelectorAll<HTMLButtonElement>("[data-tab]")];
    let activeTab = "general";
    let tabSequence = 0;

    const renderGeneral = (): void => {
      const birth = formatPartialDate(faithful.naissance_jour, faithful.naissance_mois, faithful.naissance_annee, faithful.naissance_precision);
      const death = formatPartialDate(faithful.deces_jour, faithful.deces_mois, faithful.deces_annee, faithful.deces_precision);
      contentNode.innerHTML = `
        <div class="grid gap-4 lg:grid-cols-2">
          <section class="page-card p-5"><h2 class="font-semibold text-slate-800">Identité</h2><div class="mt-4 grid gap-3 sm:grid-cols-2">
            ${renderField("Prénom", faithful.prenom)}${renderField("Nom", faithful.nom)}${renderField("Sexe", faithful.sexe === "masculin" ? "Masculin" : "Féminin")}${renderField("Statut", faithful.statut === "decede" ? "Décédé" : "Vivant")}
            ${renderField("Date de naissance", birth)}${renderField("Lieu de naissance", faithful.lieu_naissance)}
            ${faithful.statut === "decede" ? renderField("Date de décès", death) : ""}
          </div></section>
          <section class="page-card p-5"><h2 class="font-semibold text-slate-800">Famille et appartenance</h2><div class="mt-4 grid gap-3 sm:grid-cols-2">
            ${renderField("Nom du père", faithful.nom_pere)}${renderField("Nom de la mère", faithful.nom_mere)}
            ${renderField("Quartier", quartierName)}${renderField("Communauté actuelle", community?.nom ?? "—")}
            ${renderField("Depuis le", faithful.communaute_depuis)}
          </div></section>
        </div>`;
    };

    async function renderTab(tab: string): Promise<void> {
      activeTab = tab;
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
      contentNode.innerHTML = '<div class="page-card p-6 text-sm text-slate-500">Chargement de cet onglet…</div>';
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
          contentNode.innerHTML = `
            <div class="space-y-4"><section class="page-card p-5"><h2 class="font-semibold text-slate-800">Sacrements</h2><div class="mt-4 space-y-3">${sacramentsHtml || '<p class="text-sm text-slate-400">Aucun sacrement lisible pour ce dossier.</p>'}</div></section>
            <section class="page-card p-5"><h2 class="font-semibold text-slate-800">Événements matrimoniaux</h2><div class="mt-4 space-y-3">${marriageHtml || '<p class="text-sm text-slate-400">Aucun événement matrimonial lisible.</p>'}</div></section>
            <section class="page-card p-5"><h2 class="font-semibold text-slate-800">Mentions du livret</h2><ul class="mt-3 divide-y divide-slate-100">${mentionsHtml || '<li class="py-2 text-sm text-slate-400">Aucune mention enregistrée.</li>'}</ul></section></div>`;
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
          contentNode.innerHTML = `<section class="page-card p-5"><h2 class="font-semibold text-slate-800">Enfants</h2><div class="mt-4 space-y-3">${html || '<p class="text-sm text-slate-400">Aucun enfant enregistré dans ce dossier.</p>'}</div></section>`;
          return;
        }

        if (tab === "historique") {
          if (!context.roles.some((role) => role === "secretaire" || role === "cure")) {
            contentNode.innerHTML = '<section class="page-card p-5 text-sm text-slate-500">L’historique des transferts est réservé à la secrétaire et au curé.</section>';
            return;
          }
          const { data, error } = await supabase.from("historique_affectations_fideles").select("*").eq("fidele_id", faithfulId).order("date_debut", { ascending: false });
          if (sequence !== tabSequence) return;
          if (error) throw error;
          const html = (data ?? []).map((item) => `
            <article class="rounded-xl border border-slate-100 p-4"><p class="text-sm font-semibold text-slate-800">Changement de communauté</p>
            <p class="mt-2 text-xs text-slate-500">Du ${escapeHtml(item.date_debut)} au ${escapeHtml(item.date_fin ?? "en cours")} · Motif : ${escapeHtml(item.motif ?? "Non précisé")}</p></article>`).join("");
          contentNode.innerHTML = `<section class="page-card p-5"><h2 class="font-semibold text-slate-800">Historique des affectations</h2><div class="mt-4 space-y-3">${html || '<p class="text-sm text-slate-400">Aucun transfert enregistré.</p>'}</div></section>`;
          return;
        }

        if (tab === "documents") {
          if (!context.roles.some((role) => role === "secretaire" || role === "cure")) {
            contentNode.innerHTML = '<section class="page-card p-5 text-sm text-slate-500">Les demandes et duplicatas sont réservés à la secrétaire et au curé.</section>';
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
          contentNode.innerHTML = `<section class="page-card p-5"><h2 class="font-semibold text-slate-800">Demandes de duplicata</h2><div class="mt-4 space-y-3">${html || '<p class="text-sm text-slate-400">Aucune demande de duplicata.</p>'}</div></section>`;
        }
      } catch (error) {
        if (sequence !== tabSequence) return;
        contentNode.innerHTML = `<section class="page-card p-5 text-sm text-rose-700">${escapeHtml(error instanceof Error ? error.message : "Impossible de charger cet onglet.")}</section>`;
      }
    }

    tabs.forEach((button) => button.addEventListener("click", () => void renderTab(button.dataset.tab ?? "general")));
    renderGeneral();
    void renderTab(activeTab);
  } catch (error) {
    nameNode.textContent = "Dossier indisponible";
    subtitleNode.textContent = "Les informations ne sont pas accessibles avec ce compte.";
    contentNode.innerHTML = `<section class="page-card p-5 text-sm text-rose-700">${escapeHtml(error instanceof Error ? error.message : "Impossible de charger le dossier.")}</section>`;
  }
}
