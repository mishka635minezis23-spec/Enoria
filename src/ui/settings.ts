import { getAppConfig, saveAppConfig, type AppConfig } from "../config/app-config";
import { signOut, type UserContext } from "../auth/auth-service";
import { canManageSettings } from "../auth/permissions";

export function mountSettingsPage(
  container: HTMLElement,
  context: UserContext,
  onSaved: () => void
): void {
  if (!canManageSettings(context.roles)) {
    container.innerHTML = `
      <section class="page-card p-6">
        <h1 class="text-xl font-semibold text-slate-900">Accès réservé</h1>
        <p class="mt-2 text-sm text-slate-600">Seul le curé peut modifier la configuration de cette installation.</p>
      </section>`;
    return;
  }

  const config = getAppConfig();
  container.innerHTML = `
    <section class="space-y-6">
      <header><p class="text-xs font-semibold uppercase tracking-widest text-emerald-700">Configuration de l'installation</p><h1 class="mt-2 text-2xl font-semibold">Paramètres</h1><p class="mt-1 text-sm text-slate-500">Configuration locale de cette installation paroissiale.</p></header>
      <form id="settings-form" class="page-card space-y-6 p-5 sm:p-6">
        <div>
          <h2 class="font-semibold text-slate-800">Identité paroissiale</h2>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <label class="block text-sm font-medium text-slate-700">Nom de la paroisse<input id="settings-parish" required maxlength="120" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
            <label class="block text-sm font-medium text-slate-700">Diocèse<input id="settings-diocese" maxlength="120" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
          </div>
        </div>
        <div class="border-t border-slate-100 pt-5">
          <h2 class="font-semibold text-slate-800">Connexion Supabase</h2>
          <p class="mt-1 text-xs leading-5 text-slate-500">La modification de l'URL ou de la clé déconnectera la session et fera pointer cette installation vers une autre base.</p>
          <label class="mt-4 block text-sm font-medium text-slate-700">URL du projet<input id="settings-url" type="url" required class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
          <label class="mt-4 block text-sm font-medium text-slate-700">Nouvelle clé publique (facultatif)<input id="settings-key" type="password" autocomplete="off" placeholder="Laisser vide pour conserver la clé actuelle" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
          <p class="mt-1 text-[11px] text-slate-400">Clé publishable ou anon historique uniquement. Jamais service_role / sb_secret.</p>
        </div>
        <div class="border-t border-slate-100 pt-5">
          <h2 class="font-semibold text-slate-800">Apparence</h2>
          <div class="mt-3 grid gap-4 sm:grid-cols-2">
            <label class="block text-sm font-medium text-slate-700">Couleur principale<input id="settings-primary" type="color" class="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white p-1" /></label>
            <label class="block text-sm font-medium text-slate-700">Couleur sombre<input id="settings-dark" type="color" class="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white p-1" /></label>
          </div>
        </div>
        <p id="settings-error" class="hidden rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert"></p>
        <p id="settings-success" class="hidden rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status"></p>
        <div class="flex flex-wrap items-center justify-end gap-3">
          <button type="submit" id="settings-save" class="rounded-lg bg-[var(--enoria-green)] px-4 py-2.5 text-sm font-semibold text-white">Enregistrer les paramètres</button>
        </div>
      </form>
      <article class="page-card border border-amber-200 bg-amber-50 p-5">
        <h2 class="font-semibold text-amber-900">Sécurité de la configuration</h2>
        <p class="mt-1 text-sm leading-6 text-amber-800">L'URL et la clé publique sont conservées sur ce PC. Elles ne donnent pas à elles seules accès aux dossiers : l'authentification et les politiques RLS restent obligatoires. La clé service_role ne doit jamais être saisie ici.</p>
      </article>
    </section>`;

  const parish = container.querySelector<HTMLInputElement>("#settings-parish")!;
  const diocese = container.querySelector<HTMLInputElement>("#settings-diocese")!;
  const url = container.querySelector<HTMLInputElement>("#settings-url")!;
  const key = container.querySelector<HTMLInputElement>("#settings-key")!;
  const primary = container.querySelector<HTMLInputElement>("#settings-primary")!;
  const dark = container.querySelector<HTMLInputElement>("#settings-dark")!;
  parish.value = config.parishName;
  diocese.value = config.dioceseName;
  url.value = config.supabase.url ?? "";
  primary.value = config.theme.primary;
  dark.value = config.theme.primaryDark;

  container.querySelector<HTMLFormElement>("#settings-form")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorNode = container.querySelector<HTMLElement>("#settings-error")!;
    const successNode = container.querySelector<HTMLElement>("#settings-success")!;
    const button = container.querySelector<HTMLButtonElement>("#settings-save")!;
    errorNode.classList.add("hidden");
    successNode.classList.add("hidden");
    button.disabled = true;
    button.textContent = "Enregistrement…";

    if (url.value.trim() !== config.supabase.url && !key.value.trim()) {
      errorNode.textContent = "Si tu changes de projet Supabase, saisis aussi la nouvelle clé publique.";
      errorNode.classList.remove("hidden");
      button.disabled = false;
      button.textContent = "Enregistrer les paramètres";
      return;
    }
    const newKey = key.value.trim() || config.supabase.publishableKey;
    const connectionChanged = url.value.trim() !== config.supabase.url || newKey !== config.supabase.publishableKey;
    try {
      if (connectionChanged) await signOut();
      const next: Partial<AppConfig> = {
        parishName: parish.value,
        dioceseName: diocese.value,
        theme: { ...config.theme, primary: primary.value, primaryDark: dark.value },
        supabase: { url: url.value, publishableKey: newKey }
      };
      saveAppConfig(next);
      successNode.textContent = connectionChanged
        ? "Configuration enregistrée. La session a été fermée et l'application va redémarrer."
        : "Paramètres enregistrés. L'application va redémarrer.";
      successNode.classList.remove("hidden");
      window.setTimeout(onSaved, 500);
    } catch (error) {
      errorNode.textContent = error instanceof Error ? error.message : "Impossible d'enregistrer les paramètres.";
      errorNode.classList.remove("hidden");
      button.disabled = false;
      button.textContent = "Enregistrer les paramètres";
    }
  });
}
