import "./styles.css";
import { getAppConfig, hasSupabaseConfig } from "./config/app-config";
import { loadActivePastoralYear, loadUserContext, signOut, type ActivePastoralYear, type UserContext } from "./auth/auth-service";
import { canAccessModule } from "./auth/permissions";
import { getCurrentRoute, getFaithfulIdFromRoute, loadRouteContent, navigateTo, ROUTES, type RouteKey } from "./router";
import { mountFaithfulList, mountFaithfulProfile } from "./features/fideles/fideles-ui";
import { mountDashboard } from "./features/dashboard/dashboard-ui";
import { mountSacramentsPage } from "./features/sacrements/sacrements-ui";
import { renderLoginScreen, renderSetupScreen } from "./ui/auth-screens";
import { mountSettingsPage } from "./ui/settings";
import { registerSW } from "virtual:pwa-register";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Le conteneur principal #app est introuvable.");
const appRoot: HTMLDivElement = root;

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  };
  return value.replace(/[&<>"']/g, (character) => replacements[character] ?? character);
}

function applyTheme(): void {
  const config = getAppConfig();
  document.documentElement.style.setProperty("--enoria-green", config.theme.primary);
  document.documentElement.style.setProperty("--enoria-deep", config.theme.primaryDark);
  document.documentElement.style.setProperty("--enoria-surface", config.theme.surface);
  document.body.style.backgroundColor = config.theme.surface;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", config.theme.primaryDark);
}

let removeAppListeners: (() => void) | null = null;

async function bootstrap(): Promise<void> {
  if (removeAppListeners) {
    removeAppListeners();
    removeAppListeners = null;
  }
  applyTheme();
  const config = getAppConfig();

  if (!hasSupabaseConfig(config)) {
    renderSetupScreen(appRoot, config, () => window.location.reload());
    return;
  }

  try {
    const context = await loadUserContext();
    if (!context) {
      renderLoginScreen(appRoot, config, () => void bootstrap());
      return;
    }
    let activePastoralYear: ActivePastoralYear | null = null;
    try {
      activePastoralYear = await loadActivePastoralYear(context.assignments[0].paroisse_id);
    } catch (error) {
      console.warn("Année pastorale active indisponible :", error);
    }
    renderApplication(context, activePastoralYear);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Connexion impossible. Vérifie le réseau et les paramètres Supabase.";
    try { await signOut(); } catch { /* La session sera revérifiée à la prochaine connexion. */ }
    renderLoginScreen(appRoot, config, () => void bootstrap(), message);
  }
}

function renderApplication(context: UserContext, activePastoralYear: ActivePastoralYear | null): void {
  if (removeAppListeners) removeAppListeners();

  const config = getAppConfig();
  const roleLabels: Record<string, string> = {
    responsable: "Responsable de communauté",
    secretaire: "Secrétaire",
    cure: "Curé"
  };
  const rolesLabel = context.roles.map((role) => roleLabels[role] ?? role).join(" · ");
  const initials = context.displayName.trim().charAt(0).toLocaleUpperCase("fr-CD") || "U";

  const navItems = (Object.entries(ROUTES) as [RouteKey, (typeof ROUTES)[RouteKey]][])
    .filter(([key]) => canAccessModule(context.roles, key))
    .map(([key, item]) => `
      <a class="sidebar-link" href="#/${key}" data-route="${key}">
        <span class="nav-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>
      </a>`)
    .join("");

  appRoot.innerHTML = `
    <div id="enoria-shell" class="min-h-screen md:flex">
      <aside class="sidebar flex min-h-screen flex-col bg-[var(--enoria-deep)] text-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0" id="sidebar" data-open="false">
        <div class="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <div class="grid h-11 w-11 place-items-center rounded-xl bg-white text-lg font-bold text-[var(--enoria-green)]">E</div>
          <div class="min-w-0"><p class="text-lg font-semibold tracking-wide">Enoria</p><p class="truncate text-xs text-emerald-100/70">${escapeHtml(config.parishName)}</p></div>
          <button class="ml-auto rounded-lg p-2 text-white/70 hover:bg-white/10 md:hidden" id="close-menu" aria-label="Fermer le menu">✕</button>
        </div>
        <div class="px-5 pb-2 pt-6 text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-100/50">Espace paroissial</div>
        <nav class="flex-1 space-y-1 px-3" aria-label="Navigation principale">${navItems}</nav>
        <div class="m-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <p class="text-xs font-medium text-white/90">Registres papier</p>
          <p class="mt-1 text-[11px] leading-relaxed text-emerald-100/60">Les registres physiques restent la référence officielle.</p>
        </div>
        <div class="border-t border-white/10 px-5 py-4 text-[11px] text-emerald-100/50">Enoria · Version 0.1.0</div>
      </aside>
      <button class="sidebar-backdrop" id="sidebar-backdrop" aria-label="Fermer le menu" data-open="false"></button>
      <div class="flex min-h-screen min-w-0 flex-1 flex-col">
        <header class="sticky top-0 z-20 flex min-h-[4.25rem] items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-2 backdrop-blur md:px-8">
          <div class="flex min-w-0 items-center gap-3">
            <button class="mobile-nav rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700" id="open-menu" aria-label="Ouvrir le menu">☰</button>
            <div class="min-w-0"><p class="text-xs text-slate-400">Paroisse</p><p class="truncate text-sm font-semibold text-slate-700">${escapeHtml(config.parishName)}</p><p class="truncate text-[10px] text-slate-500">${activePastoralYear ? `Année active : ${escapeHtml(activePastoralYear.libelle)}` : "Aucune année pastorale active"}</p></div>
          </div>
          <div class="flex shrink-0 items-center gap-2 sm:gap-3">
            <span class="hidden text-xs text-slate-500 xl:inline" id="today"></span>
            <div class="hidden text-right lg:block"><p class="max-w-48 truncate text-xs font-semibold text-slate-700">${escapeHtml(context.displayName)}</p><p class="text-[10px] text-slate-400">${escapeHtml(rolesLabel)}</p></div>
            <div class="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-800" aria-label="Compte utilisateur">${escapeHtml(initials)}</div>
            <button id="signout" class="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50" title="Fermer la session">Sortir</button>
          </div>
        </header>
        <main class="w-full flex-1 px-4 py-6 md:px-8 md:py-8">
          <div id="page-content" class="mx-auto max-w-7xl" aria-live="polite">
            <div class="page-card p-8 text-sm text-slate-500">Chargement…</div>
          </div>
        </main>
        <footer class="border-t border-slate-200/80 bg-white px-4 py-4 text-center text-[11px] text-slate-400 md:px-8">
          Enoria accompagne les registres papier ; il ne les remplace pas.
        </footer>
      </div>
    </div>`;

  const shell = appRoot.querySelector<HTMLElement>("#enoria-shell")!;
  const content = appRoot.querySelector<HTMLElement>("#page-content")!;
  const sidebar = appRoot.querySelector<HTMLElement>("#sidebar")!;
  const backdrop = appRoot.querySelector<HTMLElement>("#sidebar-backdrop")!;
  const dateNode = appRoot.querySelector<HTMLElement>("#today");
  if (dateNode) {
    dateNode.textContent = new Intl.DateTimeFormat(config.locale, { dateStyle: "full" }).format(new Date());
  }

  function closeMenu(): void {
    sidebar.dataset.open = "false";
    backdrop.dataset.open = "false";
  }

  function updateActiveLink(route: RouteKey): void {
    shell.querySelectorAll<HTMLAnchorElement>("[data-route]").forEach((link) => {
      if (link.dataset.route === route) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  let renderSequence = 0;
  async function renderRoute(): Promise<void> {
    const sequence = ++renderSequence;
    const route = getCurrentRoute();
    const faithfulId = route === "fideles" ? getFaithfulIdFromRoute() : null;
    updateActiveLink(route);
    closeMenu();

    if (!canAccessModule(context.roles, route)) {
      content.innerHTML = `
        <section class="page-card p-6">
          <h1 class="text-xl font-semibold text-slate-900">Accès non autorisé</h1>
          <p class="mt-2 text-sm text-slate-600">Ton rôle actuel ne permet pas d'ouvrir ce module.</p>
        </section>`;
      return;
    }

    try {
      const markup = await loadRouteContent(route, faithfulId);
      if (sequence !== renderSequence) return;
      content.innerHTML = markup;
      document.title = faithfulId ? "Fiche fidèle — Enoria" : `${ROUTES[route].label} — Enoria`;
      if (route === "parametres") {
        mountSettingsPage(content, context, () => window.location.reload());
      } else if (route === "dashboard") {
        void mountDashboard(content, context, activePastoralYear);
      } else if (route === "sacrements") {
        mountSacramentsPage(content);
      } else if (route === "fideles" && faithfulId) {
        void mountFaithfulProfile(content, context, faithfulId);
      } else if (route === "fideles") {
        mountFaithfulList(content);
      }
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch {
      if (sequence !== renderSequence) return;
      content.innerHTML = `
        <section class="page-card p-6 md:p-8">
          <p class="text-sm font-semibold text-rose-700">Page indisponible</p>
          <h1 class="mt-2 text-xl font-semibold text-slate-900">Connexion ou fichier indisponible</h1>
          <p class="mt-2 max-w-xl text-sm leading-6 text-slate-600">Cette page n'a pas pu être chargée. Vérifie la connexion puis réessaie. Aucune donnée personnelle n'est enregistrée hors ligne dans cette version.</p>
          <button id="retry-page" class="mt-5 rounded-lg bg-[var(--enoria-green)] px-4 py-2.5 text-sm font-medium text-white">Réessayer</button>
        </section>`;
      content.querySelector<HTMLButtonElement>("#retry-page")?.addEventListener("click", () => void renderRoute());
    }
  }

  const handleClick = async (event: Event): Promise<void> => {
    const target = event.target as HTMLElement;
    const link = target.closest<HTMLAnchorElement>("[data-route]");
    if (link) {
      event.preventDefault();
      navigateTo(link.dataset.route as RouteKey);
      return;
    }
    if (target.closest("#open-menu")) {
      sidebar.dataset.open = "true";
      backdrop.dataset.open = "true";
      return;
    }
    if (target.closest("#close-menu") || target.closest("#sidebar-backdrop")) {
      closeMenu();
      return;
    }
    if (target.closest("#signout")) {
      const button = shell.querySelector<HTMLButtonElement>("#signout")!;
      button.disabled = true;
      button.textContent = "…";
      try {
        await signOut();
        await bootstrap();
      } catch (error) {
        button.disabled = false;
        button.textContent = "Sortir";
        window.alert(error instanceof Error ? error.message : "La déconnexion a échoué.");
      }
    }
  };

  shell.addEventListener("click", (event) => void handleClick(event));
  const handleHashChange = (): void => { void renderRoute(); };
  window.addEventListener("hashchange", handleHashChange);
  removeAppListeners = () => window.removeEventListener("hashchange", handleHashChange);
  void renderRoute();
}

const updateSW = registerSW({
  onNeedRefresh() {
    if (document.querySelector("#update-banner")) return;
    const banner = document.createElement("div");
    banner.id = "update-banner";
    banner.className = "fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-emerald-200 bg-white p-4 shadow-xl";
    const message = document.createElement("p");
    message.className = "text-sm text-slate-700";
    message.textContent = "Une mise à jour d'Enoria est prête.";
    const button = document.createElement("button");
    button.className = "shrink-0 rounded-lg bg-[var(--enoria-green)] px-3 py-2 text-xs font-semibold text-white";
    button.textContent = "Actualiser";
    button.addEventListener("click", () => void updateSW(true));
    banner.append(message, button);
    document.body.append(banner);
  },
  onOfflineReady() {
    console.info("Enoria : les ressources statiques sont disponibles hors ligne.");
  }
});

void bootstrap();

window.addEventListener("offline", () => {
  if (document.querySelector("#offline-banner")) return;
  const banner = document.createElement("div");
  banner.id = "offline-banner";
  banner.className = "fixed bottom-4 left-4 z-40 rounded-lg bg-amber-100 px-4 py-3 text-xs font-medium text-amber-900 shadow";
  banner.textContent = "Hors connexion : les opérations métier sont suspendues.";
  document.body.append(banner);
});
window.addEventListener("online", () => document.querySelector("#offline-banner")?.remove());
