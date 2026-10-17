import { getAppConfig, saveAppConfig, type AppConfig } from "../config/app-config";
import { signOut, type UserContext } from "../auth/auth-service";
import { canManageParishTheme, canManageSettings } from "../auth/permissions";
import {
  DEFAULT_PARISH_THEME,
  saveParishTheme,
  type ParishTheme
} from "../config/parish-theme";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character] ?? character);
}

const THEME_FIELDS: { key: keyof ParishTheme; label: string }[] = [
  { key: "primary", label: "Couleur principale" },
  { key: "secondary", label: "Couleur secondaire" },
  { key: "primarySoft", label: "Fond de sélection" },
  { key: "background", label: "Fond général" },
  { key: "surface", label: "Surface des cartes" },
  { key: "text", label: "Texte principal" },
  { key: "textMuted", label: "Texte secondaire" },
  { key: "border", label: "Bordures" }
];

export function mountSettingsPage(
  container: HTMLElement,
  context: UserContext,
  currentTheme: ParishTheme,
  onSaved: () => void
): void {
  const canEditTheme = canManageParishTheme(context.roles);
  const canEditInstallation = canManageSettings(context.roles);
  if (!canEditTheme && !canEditInstallation) {
    container.innerHTML = `
      <section class="page-card p-6">
        <h1 class="text-xl font-semibold">Accès réservé</h1>
        <p class="mt-2 text-sm text-slate-600">Tu n'as pas les droits nécessaires pour modifier ces paramètres.</p>
      </section>`;
    return;
  }

  const config = getAppConfig();
  const parishId = context.assignments[0]?.paroisse_id;
  const themeFields = THEME_FIELDS.map(({ key, label }) => `
    <label class="block text-sm font-medium text-slate-700">${label}
      <span class="mt-1.5 flex items-center gap-3 rounded-lg border border-slate-200 p-2">
        <input data-theme-color="${key}" type="color" value="${currentTheme[key]}" class="h-9 w-12 cursor-pointer border-0 bg-transparent p-0" aria-label="${label}" />
        <code data-theme-value="${key}" class="text-xs text-slate-500">${currentTheme[key]}</code>
      </span>
    </label>`).join("");

  container.innerHTML = `
    <section class="space-y-6">
      <header>
        <p class="text-xs font-semibold uppercase tracking-widest text-[var(--enoria-primary)]">Configuration paroissiale</p>
        <h1 class="mt-2 text-2xl font-semibold">Paramètres</h1>
        <p class="mt-1 text-sm text-slate-500">Les préférences d'apparence sont communes à tous les utilisateurs de la paroisse.</p>
      </header>
      ${canEditInstallation ? `
      <form id="settings-installation-form" class="page-card space-y-5 p-5 sm:p-6">
        <div>
          <h2 class="font-semibold">Identité paroissiale</h2>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <label class="block text-sm font-medium text-slate-700">Nom de la paroisse
              <input id="settings-parish" required maxlength="120" value="${escapeHtml(config.parishName)}" class="mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm" />
            </label>
            <label class="block text-sm font-medium text-slate-700">Diocèse
              <input id="settings-diocese" maxlength="120" value="${escapeHtml(config.dioceseName)}" class="mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm" />
            </label>
          </div>
        </div>
        <div class="border-t border-slate-100 pt-5">
          <h2 class="font-semibold">Connexion Supabase</h2>
          <p class="mt-1 text-xs leading-5 text-slate-500">Modifier cette connexion change la base utilisée par ce navigateur.</p>
          <label class="mt-4 block text-sm font-medium text-slate-700">URL du projet
            <input id="settings-url" type="url" required value="${escapeHtml(config.supabase.url ?? "")}" class="mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm" />
          </label>
          <label class="mt-4 block text-sm font-medium text-slate-700">Nouvelle clé publique (facultatif)
            <input id="settings-key" type="password" autocomplete="off" placeholder="Laisser vide pour conserver la clé actuelle" class="mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm" />
          </label>
          <p class="mt-1 text-[11px] text-slate-400">Clé publishable ou anon historique uniquement. Jamais service_role / sb_secret.</p>
        </div>
        <p id="settings-installation-error" class="hidden rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert"></p>
        <button type="submit" class="rounded-lg bg-[var(--enoria-primary)] px-4 py-2.5 text-sm font-semibold text-white">Enregistrer l'installation</button>
      </form>` : ""}
      <form id="settings-theme-form" class="page-card space-y-5 p-5 sm:p-6">
        <div>
          <h2 class="font-semibold">Identité visuelle</h2>
          <p class="mt-1 text-sm leading-6 text-slate-500">Toute modification sera appliquée à l'ensemble des utilisateurs de cette paroisse.</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">${themeFields}</div>
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <button type="button" id="settings-theme-reset" class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700">Réinitialiser la palette</button>
          <button type="submit" id="settings-theme-save" class="rounded-lg bg-[var(--enoria-primary)] px-4 py-2.5 text-sm font-semibold text-white">Enregistrer les couleurs</button>
        </div>
        <p id="settings-theme-error" class="hidden rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert"></p>
        <p id="settings-theme-success" class="hidden rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status"></p>
        <p class="text-xs leading-5 text-slate-400">Les couleurs de succès, d'avertissement et d'erreur restent fixes pour préserver leur signification.</p>
      </form>
      <article class="page-card p-5">
        <h2 class="font-semibold">Droits de personnalisation</h2>
        <p class="mt-1 text-sm text-slate-500">Curé et secrétaire : modification. Responsable de communauté : consultation de l'apparence appliquée.</p>
      </article>
    </section>`;

  const themeForm = container.querySelector<HTMLFormElement>("#settings-theme-form")!;
  themeForm.querySelectorAll<HTMLInputElement>("[data-theme-color]").forEach((input) => {
    input.addEventListener("input", () => {
      const value = themeForm.querySelector<HTMLElement>(`[data-theme-value="${input.dataset.themeColor}"]`);
      if (value) value.textContent = input.value.toUpperCase();
    });
  });

  themeForm.querySelector<HTMLButtonElement>("#settings-theme-reset")!.addEventListener("click", () => {
    themeForm.querySelectorAll<HTMLInputElement>("[data-theme-color]").forEach((input) => {
      const key = input.dataset.themeColor as keyof ParishTheme;
      input.value = DEFAULT_PARISH_THEME[key];
      const value = themeForm.querySelector<HTMLElement>(`[data-theme-value="${key}"]`);
      if (value) value.textContent = input.value;
    });
  });

  themeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorNode = themeForm.querySelector<HTMLElement>("#settings-theme-error")!;
    const successNode = themeForm.querySelector<HTMLElement>("#settings-theme-success")!;
    const button = themeForm.querySelector<HTMLButtonElement>("#settings-theme-save")!;
    errorNode.classList.add("hidden");
    successNode.classList.add("hidden");
    if (!parishId) {
      errorNode.textContent = "Aucune paroisse active n'est associée à ce compte.";
      errorNode.classList.remove("hidden");
      return;
    }
    const nextTheme = { ...currentTheme };
    themeForm.querySelectorAll<HTMLInputElement>("[data-theme-color]").forEach((input) => {
      const key = input.dataset.themeColor as keyof ParishTheme;
      nextTheme[key] = input.value.toUpperCase();
    });
    button.disabled = true;
    button.textContent = "Enregistrement…";
    try {
      await saveParishTheme(parishId, nextTheme);
      successNode.textContent = "Palette enregistrée pour toute la paroisse. L'application va actualiser l'apparence.";
      successNode.classList.remove("hidden");
      window.setTimeout(onSaved, 350);
    } catch (error) {
      errorNode.textContent = error instanceof Error ? error.message : "Impossible d'enregistrer la palette.";
      errorNode.classList.remove("hidden");
      button.disabled = false;
      button.textContent = "Enregistrer les couleurs";
    }
  });

  if (canEditInstallation) {
    const form = container.querySelector<HTMLFormElement>("#settings-installation-form")!;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorNode = form.querySelector<HTMLElement>("#settings-installation-error")!;
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      errorNode.classList.add("hidden");
      const url = form.querySelector<HTMLInputElement>("#settings-url")!.value.trim();
      const keyInput = form.querySelector<HTMLInputElement>("#settings-key")!;
      if (url !== config.supabase.url && !keyInput.value.trim()) {
        errorNode.textContent = "Si tu changes de projet Supabase, saisis aussi la nouvelle clé publique.";
        errorNode.classList.remove("hidden");
        return;
      }
      const newKey = keyInput.value.trim() || config.supabase.publishableKey;
      const connectionChanged = url !== config.supabase.url || newKey !== config.supabase.publishableKey;
      button.disabled = true;
      button.textContent = "Enregistrement…";
      try {
        if (connectionChanged) await signOut();
        const next: Partial<AppConfig> = {
          parishName: form.querySelector<HTMLInputElement>("#settings-parish")!.value,
          dioceseName: form.querySelector<HTMLInputElement>("#settings-diocese")!.value,
          supabase: { url, publishableKey: newKey }
        };
        saveAppConfig(next);
        window.setTimeout(onSaved, 350);
      } catch (error) {
        errorNode.textContent = error instanceof Error ? error.message : "Impossible d'enregistrer les paramètres.";
        errorNode.classList.remove("hidden");
        button.disabled = false;
        button.textContent = "Enregistrer l'installation";
      }
    });
  }
}
