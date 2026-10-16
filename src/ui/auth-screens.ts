import { getAppConfig, saveAppConfig, type AppConfig } from "../config/app-config";
import { signIn } from "../auth/auth-service";

export function renderSetupScreen(
  root: HTMLElement,
  current: AppConfig,
  onSaved: () => void
): void {
  root.innerHTML = `
    <main class="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section class="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div class="flex items-center gap-3">
          <div class="grid h-12 w-12 place-items-center rounded-xl bg-[var(--enoria-deep)] text-xl font-bold text-white">E</div>
          <div><p class="text-xl font-semibold text-slate-900">Enoria</p><p class="text-xs text-slate-500">Installation paroissiale</p></div>
        </div>
        <p class="mt-7 text-xs font-semibold uppercase tracking-widest text-emerald-700">Première configuration</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Configurer cette installation</h1>
        <p class="mt-2 text-sm leading-6 text-slate-600">Ces paramètres concernent uniquement ce PC. Chaque paroisse utilise sa propre base Supabase.</p>
        <form id="setup-form" class="mt-6 space-y-5">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block text-sm font-medium text-slate-700">Nom de la paroisse
              <input name="parishName" id="setup-parish" required maxlength="120" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" />
            </label>
            <label class="block text-sm font-medium text-slate-700">Diocèse
              <input name="dioceseName" id="setup-diocese" maxlength="120" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" />
            </label>
          </div>
          <div class="border-t border-slate-100 pt-5">
            <h2 class="font-semibold text-slate-800">Connexion Supabase</h2>
            <p class="mt-1 text-xs leading-5 text-slate-500">Utilise l'URL du projet et sa clé publishable (ou l'ancienne clé anon). Ne saisis jamais la clé service_role ou une clé sb_secret.</p>
            <label class="mt-4 block text-sm font-medium text-slate-700">URL du projet
              <input name="supabaseUrl" id="setup-url" type="url" required placeholder="https://xxxxxxxx.supabase.co" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" />
            </label>
            <label class="mt-4 block text-sm font-medium text-slate-700">Clé publique Supabase
              <input name="publishableKey" id="setup-key" type="password" autocomplete="off" placeholder="sb_publishable_…" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" />
            </label>
            <p class="mt-1 text-[11px] text-slate-400">Si une clé est déjà enregistrée, laisse ce champ vide pour la conserver.</p>
          </div>
          <div class="border-t border-slate-100 pt-5">
            <h2 class="font-semibold text-slate-800">Couleurs de l'application</h2>
            <div class="mt-3 grid gap-4 sm:grid-cols-2">
              <label class="block text-sm font-medium text-slate-700">Couleur principale
                <input name="primary" id="setup-primary" type="color" class="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white p-1" />
              </label>
              <label class="block text-sm font-medium text-slate-700">Couleur sombre
                <input name="primaryDark" id="setup-dark" type="color" class="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white p-1" />
              </label>
            </div>
          </div>
          <p id="setup-error" class="hidden rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert"></p>
          <button id="setup-submit" type="submit" class="w-full rounded-lg bg-[var(--enoria-green)] px-4 py-3 text-sm font-semibold text-white hover:bg-[#125443]">Enregistrer la configuration</button>
        </form>
        <p class="mt-5 text-[11px] leading-5 text-slate-400">Les paramètres publics sont conservés dans le stockage local de ce navigateur. Les données des fidèles ne seront jamais stockées dans ce stockage local.</p>
      </section>
    </main>`;

  const parish = root.querySelector<HTMLInputElement>("#setup-parish")!;
  const diocese = root.querySelector<HTMLInputElement>("#setup-diocese")!;
  const url = root.querySelector<HTMLInputElement>("#setup-url")!;
  const key = root.querySelector<HTMLInputElement>("#setup-key")!;
  const primary = root.querySelector<HTMLInputElement>("#setup-primary")!;
  const dark = root.querySelector<HTMLInputElement>("#setup-dark")!;
  parish.value = current.parishName;
  diocese.value = current.dioceseName;
  url.value = current.supabase.url ?? "";
  primary.value = current.theme.primary;
  dark.value = current.theme.primaryDark;

  root.querySelector<HTMLFormElement>("#setup-form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    const errorNode = root.querySelector<HTMLElement>("#setup-error")!;
    const button = root.querySelector<HTMLButtonElement>("#setup-submit")!;
    errorNode.classList.add("hidden");
    button.disabled = true;
    button.textContent = "Enregistrement…";
    try {
      if (url.value.trim() !== current.supabase.url && !key.value.trim()) {
        throw new Error("Si tu changes de projet Supabase, saisis aussi la nouvelle clé publique.");
      }
      const next: Partial<AppConfig> = {
        parishName: parish.value,
        dioceseName: diocese.value,
        theme: { ...current.theme, primary: primary.value, primaryDark: dark.value },
        supabase: {
          url: url.value,
          publishableKey: key.value.trim() || current.supabase.publishableKey
        }
      };
      saveAppConfig(next);
      onSaved();
    } catch (error) {
      errorNode.textContent = error instanceof Error ? error.message : "La configuration n'a pas pu être enregistrée.";
      errorNode.classList.remove("hidden");
      button.disabled = false;
      button.textContent = "Enregistrer la configuration";
    }
  });
}

export function renderLoginScreen(
  root: HTMLElement,
  config: AppConfig,
  onSignedIn: () => void,
  initialError = ""
): void {
  root.innerHTML = `
    <main class="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div class="flex items-center gap-3">
          <div class="grid h-12 w-12 place-items-center rounded-xl bg-[var(--enoria-deep)] text-xl font-bold text-white">E</div>
          <div><p class="text-xl font-semibold text-slate-900">Enoria</p><p class="max-w-[16rem] truncate text-xs text-slate-500" id="login-parish"></p></div>
        </div>
        <p class="mt-8 text-xs font-semibold uppercase tracking-widest text-emerald-700">Espace sécurisé</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Connexion</h1>
        <p class="mt-2 text-sm leading-6 text-slate-600">Connecte-toi avec le compte paroissial qui t'a été attribué.</p>
        <form id="login-form" class="mt-6 space-y-4">
          <label class="block text-sm font-medium text-slate-700">Adresse e-mail
            <input name="email" type="email" required autocomplete="username" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" />
          </label>
          <label class="block text-sm font-medium text-slate-700">Mot de passe
            <input name="password" type="password" required autocomplete="current-password" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" />
          </label>
          <p id="login-error" class="hidden rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert"></p>
          <button id="login-submit" type="submit" class="w-full rounded-lg bg-[var(--enoria-green)] px-4 py-3 text-sm font-semibold text-white hover:bg-[#125443]">Se connecter</button>
        </form>
        <p class="mt-5 text-center text-xs leading-5 text-slate-400">Les comptes sont créés par l'administrateur. L'inscription publique est désactivée.</p>
        <button id="edit-config" type="button" class="mt-4 w-full text-xs font-medium text-slate-500 underline underline-offset-4">Modifier la configuration de cette installation</button>
      </section>
    </main>`;

  root.querySelector<HTMLElement>("#login-parish")!.textContent = config.parishName;
  const errorNode = root.querySelector<HTMLElement>("#login-error")!;
  if (initialError) {
    errorNode.textContent = initialError;
    errorNode.classList.remove("hidden");
  }

  root.querySelector<HTMLFormElement>("#login-form")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const button = root.querySelector<HTMLButtonElement>("#login-submit")!;
    errorNode.classList.add("hidden");
    button.disabled = true;
    button.textContent = "Connexion…";
    try {
      await signIn(String(values.get("email") ?? ""), String(values.get("password") ?? ""));
      onSignedIn();
    } catch (error) {
      errorNode.textContent = error instanceof Error ? error.message : "Connexion impossible. Vérifie tes identifiants et la connexion.";
      errorNode.classList.remove("hidden");
      button.disabled = false;
      button.textContent = "Se connecter";
    }
  });

  root.querySelector<HTMLButtonElement>("#edit-config")!.addEventListener("click", () => {
    if (!window.confirm("Modifier la base Supabase utilisée par cette installation ? La session actuelle ne sera plus utilisée.")) return;
    renderSetupScreen(root, getAppConfig(), () => window.location.reload());
  });
}
