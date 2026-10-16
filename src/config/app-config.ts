/**
 * Source unique de configuration de chaque installation Enoria.
 * Les valeurs propres à la paroisse sont conservées localement sur le PC.
 * Seuls l'URL et la clé publique Supabase sont autorisés ici.
 */
export interface AppConfig {
  appName: string;
  parishName: string;
  dioceseName: string;
  locale: string;
  theme: {
    primary: string;
    primaryDark: string;
    surface: string;
  };
  supabase: {
    url: string | null;
    publishableKey: string | null;
  };
}

const STORAGE_KEY = "enoria:installation-config:v1";

export const APP_CONFIG: Readonly<AppConfig> = Object.freeze({
  appName: "Enoria",
  parishName: "Notre Dame d'Afrique",
  dioceseName: "",
  locale: "fr-CD",
  theme: {
    primary: "#168fc4",
    primaryDark: "#102b4e",
    surface: "#f4f8fc"
  },
  supabase: {
    url: null,
    publishableKey: null
  }
});

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function isForbiddenSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_") || key.toLowerCase().includes("service_role")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(payload)) as { role?: string };
    return decoded.role === "service_role";
  } catch {
    return false;
  }
}

function normalizeUrl(value: string): string {
  const parsed = new URL(value.trim());
  const localDevelopment = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(localDevelopment && parsed.protocol === "http:")) {
    throw new Error("L'URL Supabase doit utiliser HTTPS (sauf en développement local).");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Saisis uniquement l'URL racine du projet Supabase.");
  }
  return parsed.origin;
}

export function getAppConfig(): AppConfig {
  const defaults: AppConfig = {
    ...APP_CONFIG,
    theme: { ...APP_CONFIG.theme },
    supabase: { ...APP_CONFIG.supabase }
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as Partial<AppConfig>;
    return {
      ...defaults,
      ...saved,
      theme: { ...defaults.theme, ...(saved.theme ?? {}) },
      supabase: { ...defaults.supabase, ...(saved.supabase ?? {}) }
    };
  } catch {
    return defaults;
  }
}

export function hasSupabaseConfig(config = getAppConfig()): boolean {
  return Boolean(config.supabase.url && config.supabase.publishableKey);
}

export function saveAppConfig(input: Partial<AppConfig>): AppConfig {
  const current = getAppConfig();
  const next: AppConfig = {
    ...current,
    ...input,
    theme: { ...current.theme, ...(input.theme ?? {}) },
    supabase: { ...current.supabase, ...(input.supabase ?? {}) }
  };

  const parishName = next.parishName.trim();
  const url = next.supabase.url?.trim() ?? "";
  const key = next.supabase.publishableKey?.trim() ?? "";

  if (!parishName) throw new Error("Le nom de la paroisse est obligatoire.");
  if (!url || !key) throw new Error("L'URL Supabase et la clé publique sont obligatoires.");
  if (isForbiddenSecretKey(key)) throw new Error("Clé refusée : ne saisis jamais une clé service_role ou sb_secret dans le navigateur.");
  if (!isHexColor(next.theme.primary) || !isHexColor(next.theme.primaryDark) || !isHexColor(next.theme.surface)) {
    throw new Error("Les couleurs doivent être au format hexadécimal #RRGGBB.");
  }

  next.parishName = parishName;
  next.dioceseName = next.dioceseName.trim();
  next.supabase.url = normalizeUrl(url);
  next.supabase.publishableKey = key;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    throw new Error("Impossible d'enregistrer la configuration sur ce PC. Vérifie l'espace disponible et les autorisations du navigateur.");
  }
  return next;
}

export function clearAppConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}
