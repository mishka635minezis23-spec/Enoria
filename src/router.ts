export const ROUTES = {
  dashboard: { label: "Tableau de bord", file: "dashboard.html", icon: "▦" },
  organisation: { label: "Organisation paroissiale", file: "organisation.html", icon: "⌂" },
  fideles: { label: "Gestion des fidèles", file: "fideles.html", icon: "♙" },
  sacrements: { label: "Gestion des sacrements", file: "sacrements.html", icon: "✝" },
  dimes: { label: "Gestion des dîmes", file: "dimes.html", icon: "♡" },
  rapports: { label: "Rapports", file: "rapports.html", icon: "▤" },
  statistiques: { label: "Statistiques pastorales", file: "statistiques.html", icon: "▥" },
  parametres: { label: "Paramètres", file: "parametres.html", icon: "⚙" }
} as const;

export type RouteKey = keyof typeof ROUTES;

function getHashPath(): string {
  return window.location.hash.replace(/^#\/?/, "").split("?")[0];
}

export function getCurrentRoute(): RouteKey {
  const key = getHashPath().split("/")[0] as RouteKey;
  return key && key in ROUTES ? key : "dashboard";
}

export function getFaithfulIdFromRoute(): string | null {
  const parts = getHashPath().split("/");
  if (parts[0] !== "fideles" || !parts[1]) return null;
  try { return decodeURIComponent(parts[1]); } catch { return null; }
}

export function getFaithfulReturnHash(): string {
  return new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("return") ?? "#/fideles";
}

export function navigateBackFromFaithful(): void {
  const returnHash = getFaithfulReturnHash();
  window.location.hash = returnHash.startsWith("#/") ? returnHash : "#/fideles";
}

export function getFaithfulListQuery(): string {
  if (getFaithfulIdFromRoute()) {
    const returnHash = getFaithfulReturnHash();
    return returnHash.startsWith("#/fideles?") ? returnHash.split("?")[1] : "";
  }
  return window.location.hash.split("?")[1] ?? "";
}

export function updateFaithfulListQuery(params: URLSearchParams): void {
  const query = params.toString();
  const hash = `#/fideles${query ? `?${query}` : ""}`;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
}

export type FaithfulProfileTab = "general" | "sacrements" | "famille" | "historique" | "documents";

export function getFaithfulInitialTab(): FaithfulProfileTab {
  const tab = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("tab");
  return tab === "sacrements" || tab === "famille" || tab === "historique" || tab === "documents" ? tab : "general";
}

export function navigateToFaithful(id: string, tab: FaithfulProfileTab = "general"): void {
  const returnHash = window.location.hash || "#/fideles";
  const params = new URLSearchParams({ return, tab });
  window.location.hash = `#/fideles/${encodeURIComponent(id)}?${params.toString()}`;
}

export function navigateToFaithfulList(query = ""): void {
  window.location.hash = `#/fideles${query ? `?${query}` : ""}`;
}

export function navigateTo(route: RouteKey): void {
  if (!(route in ROUTES)) return;
  const nextHash = `#/${route}`;
  if (window.location.hash === nextHash) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  window.location.hash = nextHash;
}

export async function loadRouteContent(route: RouteKey, faithfulId: string | null = null): Promise<string> {
  const file = route === "fideles" && faithfulId ? "fideles-profile.html" : ROUTES[route].file;
  const response = await fetch(`/pages/${file}`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Impossible de charger la page (${response.status}).`);
  return response.text();
}
