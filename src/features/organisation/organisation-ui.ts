import type { UserContext } from "../../auth/auth-service";
import { canManageOrganization } from "../../auth/permissions";
import { getSupabaseClient } from "../../lib/supabase";

function esc(value: unknown): string {
  const map: Record<string,string> = { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" };
  return String(value ?? "").replace(/[&<>"']/g,(c)=>map[c]??c);
}

function showFeedback(node: HTMLElement, message: string, kind: "success" | "error" | "info" = "info"): void {
  const classes: Record<typeof kind, string> = {
    success: "rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800",
    error: "rounded-lg bg-rose-50 p-3 text-sm text-rose-700",
    info: "rounded-lg bg-slate-50 p-3 text-sm text-slate-600"
  };
  node.textContent = message;
  node.className = classes[kind];
}

export async function mountOrganisation(container: HTMLElement, context: UserContext): Promise<void> {
  const list = container.querySelector<HTMLElement>("#organisation-list");
  const feedback = container.querySelector<HTMLElement>("#organisation-feedback");
  const addQuartierButton = container.querySelector<HTMLButtonElement>("#organisation-add-quartier");
  if (!list || !feedback) return;
  const listEl: HTMLElement = list;
  const feedbackEl: HTMLElement = feedback;

  const canWrite = canManageOrganization(context.roles);
  const adminAssignment = context.assignments.find((item) => item.role === "cure" || item.role === "secretaire")
    ?? context.assignments[0];
  if (!adminAssignment) {
    showFeedback(feedbackEl, "Aucune affectation paroissiale active n'est associée à ce compte.", "error");
    return;
  }
  const parishId = adminAssignment.paroisse_id;
  const db = getSupabaseClient();

  if (addQuartierButton) {
    addQuartierButton.disabled = !canWrite;
    addQuartierButton.className = canWrite
      ? "w-fit rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800"
      : "w-fit cursor-not-allowed rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-400";
    addQuartierButton.title = canWrite ? "Créer un quartier dans cette paroisse" : "Action réservée au curé et au secrétaire";
  }

  async function loadOrganisation(): Promise<void> {
    listEl.innerHTML = '<div class="page-card p-6 text-sm text-slate-500">Chargement des quartiers…</div>';
    const [quartiers, communities] = await Promise.all([
      db.from("quartiers").select("id,nom").eq("paroisse_id", parishId).order("nom"),
      db.from("communautes").select("id,nom,quartier_id,active").eq("paroisse_id", parishId).order("nom")
    ]);
    if (quartiers.error) throw quartiers.error;
    if (communities.error) throw communities.error;

    const rows = quartiers.data.map((quartier) => {
      const items = communities.data.filter((community) => community.quartier_id === quartier.id);
      const activeCount = items.filter((community) => community.active).length;
      const children = items.length ? items.map((community) => `
        <li class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-3">
          <span class="text-sm text-slate-700">${esc(community.nom)}</span>
          <span class="rounded-full px-2.5 py-1 text-[10px] font-medium ${community.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}">${community.active ? "Active" : "Désactivée"}</span>
        </li>`).join("") : '<li class="border-t border-slate-100 py-3 text-xs text-slate-400">Aucune communauté rattachée.</li>';
      return `
        <article class="page-card overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-3 p-5">
            <div><h2 class="font-semibold text-slate-800">${esc(quartier.nom)}</h2><p class="mt-1 text-xs text-slate-500">${items.length} communauté(s) · ${activeCount} active(s)</p></div>
            <button type="button" data-add-community="${esc(quartier.id)}" class="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50" ${canWrite ? "" : "disabled"} title="${canWrite ? "Créer une communauté dans ce quartier" : "Action réservée au curé et au secrétaire"}">＋ Ajouter une communauté</button>
          </div>
          <ul class="px-5 pb-2">${children}</ul>
        </article>`;
    }).join("");
    listEl.innerHTML = rows || '<div class="page-card p-8 text-center text-sm text-slate-400">Aucun quartier n’est enregistré. Utilise « Ajouter un quartier » pour commencer.</div>';
  }

  async function refresh(): Promise<void> {
    try {
      await loadOrganisation();
    } catch (error) {
      listEl.innerHTML = '<div class="page-card p-6 text-sm text-rose-700">Impossible de charger l’organisation paroissiale.</div>';
      showFeedback(feedbackEl, error instanceof Error ? error.message : "Erreur de lecture de l'organisation paroissiale.", "error");
    }
  }

  async function createQuartier(): Promise<void> {
    if (!canWrite) {
      showFeedback(feedbackEl, "La création d'un quartier est réservée au curé et au secrétaire.", "error");
      return;
    }
    const rawName = window.prompt("Nom du nouveau quartier :");
    if (rawName === null) return;
    const nom = rawName.trim();
    if (!nom) {
      showFeedback(feedbackEl, "Saisis le nom du quartier avant de l'enregistrer.", "error");
      return;
    }
    if (nom.length > 120) {
      showFeedback(feedbackEl, "Le nom du quartier ne peut pas dépasser 120 caractères.", "error");
      return;
    }
    if (addQuartierButton) addQuartierButton.disabled = true;
    try {
      const { error } = await db.from("quartiers").insert({ paroisse_id: parishId, nom });
      if (error) throw error;
      showFeedback(feedbackEl, `Le quartier « ${nom} » a été créé.`, "success");
      await loadOrganisation();
    } catch (error) {
      showFeedback(feedbackEl, error instanceof Error ? error.message : "Échec de la création du quartier.", "error");
    } finally {
      if (addQuartierButton) addQuartierButton.disabled = !canWrite;
    }
  }

  async function createCommunity(quartierId: string): Promise<void> {
    if (!canWrite) {
      showFeedback(feedbackEl, "La création d'une communauté est réservée au curé et au secrétaire.", "error");
      return;
    }
    const rawName = window.prompt("Nom de la nouvelle communauté :");
    if (rawName === null) return;
    const nom = rawName.trim();
    if (!nom) {
      showFeedback(feedbackEl, "Saisis le nom de la communauté avant de l'enregistrer.", "error");
      return;
    }
    if (nom.length > 120) {
      showFeedback(feedbackEl, "Le nom de la communauté ne peut pas dépasser 120 caractères.", "error");
      return;
    }
    const button = container.querySelector<HTMLButtonElement>(`[data-add-community="${CSS.escape(quartierId)}"]`);
    if (button) button.disabled = true;
    try {
      const { error } = await db.from("communautes").insert({
        paroisse_id: parishId,
        quartier_id: quartierId,
        nom,
        active: true
      });
      if (error) throw error;
      showFeedback(feedbackEl, `La communauté « ${nom} » a été créée.`, "success");
      await loadOrganisation();
    } catch (error) {
      showFeedback(feedbackEl, error instanceof Error ? error.message : "Échec de la création de la communauté.", "error");
    } finally {
      const currentButton = container.querySelector<HTMLButtonElement>(`[data-add-community="${CSS.escape(quartierId)}"]`);
      if (currentButton) currentButton.disabled = !canWrite;
    }
  }

  addQuartierButton?.addEventListener("click", () => void createQuartier());
  listEl.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-add-community]");
    if (button?.dataset.addCommunity) void createCommunity(button.dataset.addCommunity);
  });

  await refresh();
}
