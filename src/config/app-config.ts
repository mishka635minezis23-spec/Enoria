/**
 * Source unique de configuration de l'installation Enoria.
 * Les valeurs propres à une paroisse seront administrées depuis Paramètres.
 * Aucune clé secrète ne doit être placée dans ce fichier ou dans le navigateur.
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

export const APP_CONFIG: Readonly<AppConfig> = Object.freeze({
  appName: "Enoria",
  parishName: "Notre Dame d'Afrique",
  dioceseName: "Diocèse à configurer",
  locale: "fr-CD",
  theme: {
    primary: "#176653",
    primaryDark: "#123b32",
    surface: "#f8fafc"
  },
  // Valeurs volontairement vides en phase 1. La connexion sera configurée plus tard.
  supabase: {
    url: null,
    publishableKey: null
  }
});
