import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAppConfig, hasSupabaseConfig } from "../config/app-config";
import type { Database } from "../types/database.types";

let client: SupabaseClient<Database> | null = null;
let clientIdentity = "";

export function getSupabaseClient(): SupabaseClient<Database> {
  const config = getAppConfig();
  if (!hasSupabaseConfig(config) || !config.supabase.url || !config.supabase.publishableKey) {
    throw new Error("La connexion Supabase n'est pas configurée.");
  }

  const identity = `${config.supabase.url}|${config.supabase.publishableKey}`;
  if (!client || clientIdentity !== identity) {
    client = createClient<Database>(config.supabase.url, config.supabase.publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    });
    clientIdentity = identity;
  }
  return client;
}

export function resetSupabaseClient(): void {
  client = null;
  clientIdentity = "";
}
