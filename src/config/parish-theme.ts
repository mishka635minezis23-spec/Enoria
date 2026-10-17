import type { Json } from "../types/database.types";
import { getSupabaseClient } from "../lib/supabase";

export interface ParishTheme {
  primary: string;
  secondary: string;
  primarySoft: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
}

export const DEFAULT_PARISH_THEME: ParishTheme = {
  primary: "#061AAC",
  secondary: "#33A3F8",
  primarySoft: "#EAF5FF",
  background: "#F7F9FC",
  surface: "#FFFFFF",
  text: "#282C30",
  textMuted: "#667085",
  border: "#E5EAF0"
};

const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const THEME_KEYS = Object.keys(DEFAULT_PARISH_THEME) as (keyof ParishTheme)[];

export function validateParishTheme(value: unknown): ParishTheme {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("La palette reçue est invalide.");
  }
  const candidate = value as Record<string, unknown>;
  const next = { ...DEFAULT_PARISH_THEME };
  for (const key of THEME_KEYS) {
    const color = candidate[key];
    if (typeof color !== "string" || !COLOR_PATTERN.test(color)) {
      throw new Error(`La couleur « ${key} » doit être au format #RRGGBB.`);
    }
    next[key] = color.toUpperCase();
  }
  return next;
}

export async function loadParishTheme(parishId: string): Promise<ParishTheme> {
  const { data, error } = await getSupabaseClient()
    .from("paroisses")
    .select("theme")
    .eq("id", parishId)
    .single();
  if (error) throw error;
  return validateParishTheme(data.theme);
}

export async function saveParishTheme(parishId: string, theme: ParishTheme): Promise<ParishTheme> {
  const validated = validateParishTheme(theme);
  const { data, error } = await getSupabaseClient()
    .from("paroisses")
    .update({ theme: validated as unknown as Json })
    .eq("id", parishId)
    .select("theme")
    .single();
  if (error) throw error;
  return validateParishTheme(data.theme);
}
