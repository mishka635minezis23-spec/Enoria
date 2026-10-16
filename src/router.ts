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

export function getCurrentRoute(): RouteKey {
  const key = window.location.hash.replace(/^#\/?/, "").split(/[?&]/)[0] as RouteKey;
  return key && key in ROUTES ? key : "dashboard";
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

export async function loadRouteContent(route: RouteKey): Promise<string> {
  const response = await fetch(`/pages/${ROUTES[route].file}`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Impossible de charger la page (${response.status}).`);
  return response.text();
}
