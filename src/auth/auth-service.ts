import type { User } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";
import { getSupabaseClient } from "../lib/supabase";

export type EnoriaRole = Database["public"]["Enums"]["role_enoria"];
type AssignmentRow = Database["public"]["Tables"]["affectations_utilisateurs"]["Row"];

export interface UserContext {
  user: User;
  displayName: string;
  telephone: string | null;
  roles: EnoriaRole[];
  assignments: AssignmentRow[];
}

export async function signIn(email: string, password: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadUserContext(): Promise<UserContext | null> {
  const supabase = getSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) {
    if (authError.name === "AuthSessionMissingError") return null;
    throw authError;
  }
  if (!authData.user) return null;

  const [profileResult, assignmentResult] = await Promise.all([
    supabase
      .from("utilisateurs")
      .select("id, nom_complet, telephone, actif")
      .eq("id", authData.user.id)
      .maybeSingle(),
    supabase
      .from("affectations_utilisateurs")
      .select("id, utilisateur_id, paroisse_id, communaute_id, role, active, date_debut, date_fin, cree_par, created_at")
      .eq("utilisateur_id", authData.user.id)
      .eq("active", true)
  ]);

  if (profileResult.error) throw profileResult.error;
  if (assignmentResult.error) throw assignmentResult.error;
  if (!profileResult.data || !profileResult.data.actif) {
    throw new Error("Le profil paroissial est absent ou désactivé. Contacte l'administrateur.");
  }

  const now = Date.now();
  const isStillValid = (dateFin: string | null): boolean => {
    if (!dateFin) return true;
    const end = new Date(dateFin);
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(dateFin)) end.setUTCHours(23, 59, 59, 999);
    return end.getTime() >= now;
  };
  const assignments = assignmentResult.data.filter((item) =>
    item.active &&
    new Date(item.date_debut).getTime() <= now &&
    isStillValid(item.date_fin)
  );
  if (assignments.length === 0) {
    throw new Error("Aucun rôle paroissial actif n'est attribué à ce compte.");
  }

  const roles = [...new Set(assignments.map((item) => item.role))];
  return {
    user: authData.user,
    displayName: profileResult.data.nom_complet || authData.user.email || "Utilisateur",
    telephone: profileResult.data.telephone,
    roles,
    assignments
  };
}

export interface ActivePastoralYear {
  id: string;
  libelle: string;
  date_debut: string;
  date_fin: string;
}

export async function loadActivePastoralYear(parishId: string): Promise<ActivePastoralYear | null> {
  const { data, error } = await getSupabaseClient()
    .from("annees_pastorales")
    .select("id,libelle,date_debut,date_fin")
    .eq("paroisse_id", parishId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}
