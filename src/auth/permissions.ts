import type { RouteKey } from "../router";
import type { EnoriaRole } from "./auth-service";

const MODULE_ACCESS: Record<RouteKey, EnoriaRole[]> = {
  dashboard: ["responsable", "secretaire", "cure"],
  organisation: ["secretaire", "cure"],
  fideles: ["responsable", "secretaire", "cure"],
  sacrements: ["responsable", "secretaire", "cure"],
  dimes: ["secretaire", "cure"],
  rapports: ["secretaire", "cure"],
  statistiques: ["responsable", "secretaire", "cure"],
  parametres: ["secretaire", "cure"]
};

export function canAccessModule(roles: EnoriaRole[], route: RouteKey): boolean {
  return MODULE_ACCESS[route].some((role) => roles.includes(role));
}

export function canCreateFaithful(roles: EnoriaRole[]): boolean {
  return roles.some((role) => ["responsable", "secretaire", "cure"].includes(role));
}

export function canWriteSacraments(roles: EnoriaRole[]): boolean {
  return roles.some((role) => role === "secretaire" || role === "cure");
}

export function canManageOrganization(_roles: EnoriaRole[]): boolean {
  // Les politiques RLS actuelles n'autorisent aucune écriture sur quartiers/communautes.
  // Garder les commandes désactivées jusqu'à validation d'une voie d'écriture côté base.
  return false;
}

export function canManageDimes(roles: EnoriaRole[]): boolean {
  return roles.some((role) => role === "secretaire" || role === "cure");
}

export function canRequestDuplicate(roles: EnoriaRole[]): boolean {
  return roles.some((role) => role === "secretaire" || role === "cure");
}

export function canApproveDuplicate(roles: EnoriaRole[]): boolean {
  return roles.includes("cure");
}

export function canManageSettings(roles: EnoriaRole[]): boolean {
  return roles.includes("cure");
}

/** Les couleurs de marque sont communes à la paroisse et modifiables par le secrétaire ou le curé. */
export function canManageParishTheme(roles: EnoriaRole[]): boolean {
  return roles.some((role) => role === "secretaire" || role === "cure");
}
