export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      affectations_utilisateurs: {
        Row: {
          active: boolean
          communaute_id: string | null
          created_at: string
          cree_par: string | null
          date_debut: string
          date_fin: string | null
          id: string
          paroisse_id: string
          role: Database["public"]["Enums"]["role_enoria"]
          utilisateur_id: string
        }
        Insert: {
          active?: boolean
          communaute_id?: string | null
          created_at?: string
          cree_par?: string | null
          date_debut?: string
          date_fin?: string | null
          id?: string
          paroisse_id: string
          role: Database["public"]["Enums"]["role_enoria"]
          utilisateur_id: string
        }
        Update: {
          active?: boolean
          communaute_id?: string | null
          created_at?: string
          cree_par?: string | null
          date_debut?: string
          date_fin?: string | null
          id?: string
          paroisse_id?: string
          role?: Database["public"]["Enums"]["role_enoria"]
          utilisateur_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affectations_utilisateurs_communaute_id_paroisse_id_fkey"
            columns: ["communaute_id", "paroisse_id"]
            isOneToOne: false
            referencedRelation: "communautes"
            referencedColumns: ["id", "paroisse_id"]
          },
          {
            foreignKeyName: "affectations_utilisateurs_cree_par_fkey"
            columns: ["cree_par"]
            isOneToOne: false
            referencedRelation: "utilisateurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affectations_utilisateurs_paroisse_id_fkey"
            columns: ["paroisse_id"]
            isOneToOne: false
            referencedRelation: "paroisses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affectations_utilisateurs_utilisateur_id_fkey"
            columns: ["utilisateur_id"]
            isOneToOne: false
            referencedRelation: "utilisateurs"
            referencedColumns: ["id"]
          },
        ]
      }
      annees_pastorales: {
        Row: {
          active: boolean
          cloturee_at: string | null
          created_at: string
          date_debut: string
          date_fin: string
          id: string
          libelle: string
          paroisse_id: string
        }
        Insert: {
          active?: boolean
          cloturee_at?: string | null
          created_at?: string
          date_debut: string
          date_fin: string
          id?: string
          libelle: string
          paroisse_id: string
        }
        Update: {
          active?: boolean
          cloturee_at?: string | null
          created_at?: string
          date_debut?: string
          date_fin?: string
          id?: string
          libelle?: string
          paroisse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "annees_pastorales_paroisse_id_fkey"
            columns: ["paroisse_id"]
            isOneToOne: false
            referencedRelation: "paroisses"
            referencedColumns: ["id"]
          },
        ]
      }
      certificats: {
        Row: {
          annee_pastorale_id: string
          created_at: string
          date_demande: string
          date_emission: string | null
          date_validation: string | null
          demande_par: string
          fidele_id: string
          id: string
          motif_refus: string | null
          numero_duplicata: number
          sacrement_id: string
          statut: Database["public"]["Enums"]["statut_certificat"]
          valide_par: string | null
        }
        Insert: {
          annee_pastorale_id: string
          created_at?: string
          date_demande?: string
          date_emission?: string | null
          date_validation?: string | null
          demande_par: string
          fidele_id: string
          id?: string
          motif_refus?: string | null
          numero_duplicata: number
          sacrement_id: string
          statut?: Database["public"]["Enums"]["statut_certificat"]
          valide_par?: string | null
        }
        Update: {
          annee_pastorale_id?: string
          created_at?: string
          date_demande?: string
          date_emission?: string | null
          date_validation?: string | null
          demande_par?: string
          fidele_id?: string
          id?: string
          motif_refus?: string | null
          numero_duplicata?: number
          sacrement_id?: string
          statut?: Database["public"]["Enums"]["statut_certificat"]
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificats_annee_pastorale_id_fkey"
            columns: ["annee_pastorale_id"]
            isOneToOne: false
            referencedRelation: "annees_pastorales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificats_demande_par_fkey"
            columns: ["demande_par"]
            isOneToOne: false
            referencedRelation: "utilisateurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificats_fidele_id_fkey"
            columns: ["fidele_id"]
            isOneToOne: false
            referencedRelation: "fideles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificats_sacrement_id_fidele_id_fkey"
            columns: ["sacrement_id", "fidele_id"]
            isOneToOne: false
            referencedRelation: "sacrements"
            referencedColumns: ["id", "fidele_id"]
          },
          {
            foreignKeyName: "certificats_valide_par_fkey"
            columns: ["valide_par"]
            isOneToOne: false
            referencedRelation: "utilisateurs"
            referencedColumns: ["id"]
          },
        ]
      }
      communautes: {
        Row: {
          active: boolean
          created_at: string
          id: string
          nom: string
          paroisse_id: string
          quartier_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          nom: string
          paroisse_id: string
          quartier_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          nom?: string
          paroisse_id?: string
          quartier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communautes_paroisse_id_fkey"
            columns: ["paroisse_id"]
            isOneToOne: false
            referencedRelation: "paroisses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communautes_quartier_id_paroisse_id_fkey"
            columns: ["quartier_id", "paroisse_id"]
            isOneToOne: false
            referencedRelation: "quartiers"
            referencedColumns: ["id", "paroisse_id"]
          },
        ]
      }
      dimes: {
        Row: {
          annee_pastorale_id: string
          communaute_paiement_id: string | null
          date_paiement: string | null
          created_at: string
          created_by: string | null
          devise: Database["public"]["Enums"]["devise_dime"]
          fidele_id: string
          id: string
          montant: number
          observation: string | null
          updated_at: string
        }
        Insert: {
          annee_pastorale_id: string
          communaute_paiement_id?: string | null
          date_paiement?: string | null
          created_at?: string
          created_by?: string | null
          devise: Database["public"]["Enums"]["devise_dime"]
          fidele_id: string
          id?: string
          montant: number
          observation?: string | null
          updated_at?: string
        }
        Update: {
          annee_pastorale_id?: string
          communaute_paiement_id?: string | null
          date_paiement?: string | null
          created_at?: string
          created_by?: string | null
          devise?: Database["public"]["Enums"]["devise_dime"]
          fidele_id?: string
          id?: string
          montant?: number
          observation?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dimes_annee_pastorale_id_fkey"
            columns: ["annee_pastorale_id"]
            isOneToOne: false
            referencedRelation: "annees_pastorales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "utilisateurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimes_fidele_id_fkey"
            columns: ["fidele_id"]
            isOneToOne: false
            referencedRelation: "fideles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimes_communaute_paiement_id_fkey"
            columns: ["communaute_paiement_id"]
            isOneToOne: false
            referencedRelation: "communautes"
            referencedColumns: ["id"]
          },
        ]
      }
      enfants: {
        Row: {
          bapteme_annee: number | null
          bapteme_jour: number | null
          bapteme_mois: number | null
          bapteme_precision: Database["public"]["Enums"]["precision_date"]
          confession: string
          created_at: string
          created_by: string | null
          fidele_enfant_id: string | null
          fidele_parent_id: string
          id: string
          lieu_bapteme: string | null
          naissance_annee: number | null
          naissance_jour: number | null
          naissance_mois: number | null
          naissance_precision: Database["public"]["Enums"]["precision_date"]
          nom: string
          numero_acte: string | null
          page_registre: string | null
          prenom: string
          statut_bapteme: string
        }
        Insert: {
          bapteme_annee?: number | null
          bapteme_jour?: number | null
          bapteme_mois?: number | null
          bapteme_precision?: Database["public"]["Enums"]["precision_date"]
          confession?: string
          created_at?: string
          created_by?: string | null
          fidele_enfant_id?: string | null
          fidele_parent_id: string
          id?: string
          lieu_bapteme?: string | null
          naissance_annee?: number | null
          naissance_jour?: number | null
          naissance_mois?: number | null
          naissance_precision?: Database["public"]["Enums"]["precision_date"]
          nom: string
          numero_acte?: string | null
          page_registre?: string | null
          prenom: string
          statut_bapteme?: string
        }
        Update: {
          bapteme_annee?: number | null
          bapteme_jour?: number | null
          bapteme_mois?: number | null
          bapteme_precision?: Database["public"]["Enums"]["precision_date"]
          confession?: string
          created_at?: string
          created_by?: string | null
          fidele_enfant_id?: string | null
          fidele_parent_id?: string
          id?: string
          lieu_bapteme?: string | null
          naissance_annee?: number | null
          naissance_jour?: number | null
          naissance_mois?: number | null
          naissance_precision?: Database["public"]["Enums"]["precision_date"]
          nom?: string
          numero_acte?: string | null
          page_registre?: string | null
          prenom?: string
          statut_bapteme?: string
        }
        Relationships: [
          {
            foreignKeyName: "enfants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "utilisateurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enfants_fidele_enfant_id_fkey"
            columns: ["fidele_enfant_id"]
            isOneToOne: true
            referencedRelation: "fideles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enfants_fidele_parent_id_fkey"
            columns: ["fidele_parent_id"]
            isOneToOne: false
            referencedRelation: "fideles"
            referencedColumns: ["id"]
          },
        ]
      }
      evenements_matrimoniaux: {
        Row: {
          annee: number | null
          annee_pastorale_id: string
          communaute_historique_id: string
          conjoint_bapteme_annee: number | null
          conjoint_bapteme_jour: number | null
          conjoint_bapteme_mois: number | null
          conjoint_bapteme_precision: Database["public"]["Enums"]["precision_date"]
          conjoint_lieu_bapteme: string | null
          conjoint_fidele_id: string | null
          conjoint_nom: string | null
          created_at: string
          created_by: string | null
          deces_conjoint_annee: number | null
          deces_conjoint_jour: number | null
          deces_conjoint_mois: number | null
          deces_conjoint_precision: Database["public"]["Enums"]["precision_date"]
          fidele_id: string
          id: string
          jour: number | null
          lieu: string | null
          ministre: string | null
          mois: number | null
          numero_acte: string | null
          page_registre: string | null
          paroisse_id: string
          precision: Database["public"]["Enums"]["precision_date"]
          type: Database["public"]["Enums"]["type_evenement_matrimonial"]
          updated_at: string
          visa: string | null
        }
        Insert: {
          annee?: number | null
          annee_pastorale_id: string
          communaute_historique_id: string
          conjoint_bapteme_annee?: number | null
          conjoint_bapteme_jour?: number | null
          conjoint_bapteme_mois?: number | null
          conjoint_bapteme_precision?: Database["public"]["Enums"]["precision_date"]
          conjoint_lieu_bapteme?: string | null
          conjoint_fidele_id?: string | null
          conjoint_nom?: string | null
          created_at?: string
          created_by?: string | null
          deces_conjoint_annee?: number | null
          deces_conjoint_jour?: number | null
          deces_conjoint_mois?: number | null
          deces_conjoint_precision?: Database["public"]["Enums"]["precision_date"]
          fidele_id: string
          id?: string
          jour?: number | null
          lieu?: string | null
          ministre?: string | null
          mois?: number | null
          numero_acte?: string | null
          page_registre?: string | null
          paroisse_id: string
          precision?: Database["public"]["Enums"]["precision_date"]
          type: Database["public"]["Enums"]["type_evenement_matrimonial"]
          updated_at?: string
          visa?: string | null
        }
        Update: {
          annee?: number | null
          annee_pastorale_id?: string
          communaute_historique_id?: string
          conjoint_bapteme_annee?: number | null
          conjoint_bapteme_jour?: number | null
          conjoint_bapteme_mois?: number | null
          conjoint_bapteme_precision?: Database["public"]["Enums"]["precision_date"]
          conjoint_lieu_bapteme?: string | null
          conjoint_fidele_id?: string | null
          conjoint_nom?: string | null
          created_at?: string
          created_by?: string | null
          deces_conjoint_annee?: number | null
          deces_conjoint_jour?: number | null
          deces_conjoint_mois?: number | null
          deces_conjoint_precision?: Database["public"]["Enums"]["precision_date"]
          fidele_id?: string
          id?: string
          jour?: number | null
          lieu?: string | null
          ministre?: string | null
          mois?: number | null
          numero_acte?: string | null
          page_registre?: string | null
          paroisse_id?: string
          precision?: Database["public"]["Enums"]["precision_date"]
          type?: Database["public"]["Enums"]["type_evenement_matrimonial"]
          updated_at?: string
          visa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evenements_matrimoniaux_annee_pastorale_id_fkey"
            columns: ["annee_pastorale_id"]
            isOneToOne: false
            referencedRelation: "annees_pastorales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evenements_matrimoniaux_communaute_historique_id_fkey"
            columns: ["communaute_historique_id"]
            isOneToOne: false
            referencedRelation: "communautes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evenements_matrimoniaux_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "utilisateurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evenements_matrimoniaux_conjoint_paroisse_fkey"
            columns: ["conjoint_fidele_id", "paroisse_id"]
            isOneToOne: false
            referencedRelation: "fideles"
            referencedColumns: ["id", "paroisse_id"]
          },
          {
            foreignKeyName: "evenements_matrimoniaux_fidele_id_fkey"
            columns: ["fidele_id"]
            isOneToOne: false
            referencedRelation: "fideles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evenements_matrimoniaux_paroisse_id_fkey"
            columns: ["paroisse_id"]
            isOneToOne: false
            referencedRelation: "paroisses"
            referencedColumns: ["id"]
          },
        ]
      }
      fideles: {
        Row: {
          carte_couleur: string
          code_simulation: string | null
          communaute_depuis: string
          communaute_id: string
          created_at: string
          created_by: string | null
          deces_annee: number | null
          deces_jour: number | null
          deces_mois: number | null
          deces_precision: Database["public"]["Enums"]["precision_date"]
          id: string
          lieu_naissance: string | null
          naissance_annee: number | null
          naissance_jour: number | null
          naissance_mois: number | null
          naissance_precision: Database["public"]["Enums"]["precision_date"]
          nom: string
          nom_mere: string | null
          nom_pere: string | null
          paroisse_id: string
          prenom: string
          sexe: string
          statut: Database["public"]["Enums"]["statut_vie"]
          updated_at: string
          uuid_client: string | null
        }
        Insert: {
          carte_couleur?: string
          code_simulation?: string | null
          communaute_depuis?: string
          communaute_id: string
          created_at?: string
          created_by?: string | null
          deces_annee?: number | null
          deces_jour?: number | null
          deces_mois?: number | null
          deces_precision?: Database["public"]["Enums"]["precision_date"]
          id?: string
          lieu_naissance?: string | null
          naissance_annee?: number | null
          naissance_jour?: number | null
          naissance_mois?: number | null
          naissance_precision?: Database["public"]["Enums"]["precision_date"]
          nom: string
          nom_mere?: string | null
          nom_pere?: string | null
          paroisse_id: string
          prenom: string
          sexe: string
          statut?: Database["public"]["Enums"]["statut_vie"]
          updated_at?: string
          uuid_client?: string | null
        }
        Update: {
          carte_couleur?: string
          code_simulation?: string | null
          communaute_depuis?: string
          communaute_id?: string
          created_at?: string
          created_by?: string | null
          deces_annee?: number | null
          deces_jour?: number | null
          deces_mois?: number | null
          deces_precision?: Database["public"]["Enums"]["precision_date"]
          id?: string
          lieu_naissance?: string | null
          naissance_annee?: number | null
          naissance_jour?: number | null
          naissance_mois?: number | null
          naissance_precision?: Database["public"]["Enums"]["precision_date"]
          nom?: string
          nom_mere?: string | null
          nom_pere?: string | null
          paroisse_id?: string
          prenom?: string
          sexe?: string
          statut?: Database["public"]["Enums"]["statut_vie"]
          updated_at?: string
          uuid_client?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fideles_communaute_id_paroisse_id_fkey"
            columns: ["communaute_id", "paroisse_id"]
            isOneToOne: false
            referencedRelation: "communautes"
            referencedColumns: ["id", "paroisse_id"]
          },
          {
            foreignKeyName: "fideles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "utilisateurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fideles_paroisse_id_fkey"
            columns: ["paroisse_id"]
            isOneToOne: false
            referencedRelation: "paroisses"
            referencedColumns: ["id"]
          },
        ]
      }
      historique_actions: {
        Row: {
          action: string
          cible_id: string | null
          created_at: string
          details: Json
          fidele_id: string | null
          id: string
          table_cible: string
          utilisateur_id: string | null
        }
        Insert: {
          action: string
          cible_id?: string | null
          created_at?: string
          details?: Json
          fidele_id?: string | null
          id?: string
          table_cible: string
          utilisateur_id?: string | null
        }
        Update: {
          action?: string
          cible_id?: string | null
          created_at?: string
          details?: Json
          fidele_id?: string | null
          id?: string
          table_cible?: string
          utilisateur_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historique_actions_fidele_id_fkey"
            columns: ["fidele_id"]
            isOneToOne: false
            referencedRelation: "fideles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historique_actions_utilisateur_id_fkey"
            columns: ["utilisateur_id"]
            isOneToOne: false
            referencedRelation: "utilisateurs"
            referencedColumns: ["id"]
          },
        ]
      }
      historique_affectations_fideles: {
        Row: {
          ancienne_communaute_id: string | null
          annee_pastorale_id: string | null
          created_at: string
          date_debut: string
          date_fin: string | null
          effectue_par: string | null
          fidele_id: string
          id: string
          motif: string | null
          nouvelle_communaute_id: string
        }
        Insert: {
          ancienne_communaute_id?: string | null
          annee_pastorale_id?: string | null
          created_at?: string
          date_debut: string
          date_fin?: string | null
          effectue_par?: string | null
          fidele_id: string
          id?: string
          motif?: string | null
          nouvelle_communaute_id: string
        }
        Update: {
          ancienne_communaute_id?: string | null
          annee_pastorale_id?: string | null
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          effectue_par?: string | null
          fidele_id?: string
          id?: string
          motif?: string | null
          nouvelle_communaute_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historique_affectations_fideles_ancienne_communaute_id_fkey"
            columns: ["ancienne_communaute_id"]
            isOneToOne: false
            referencedRelation: "communautes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historique_affectations_fideles_annee_pastorale_id_fkey"
            columns: ["annee_pastorale_id"]
            isOneToOne: false
            referencedRelation: "annees_pastorales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historique_affectations_fideles_effectue_par_fkey"
            columns: ["effectue_par"]
            isOneToOne: false
            referencedRelation: "utilisateurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historique_affectations_fideles_fidele_id_fkey"
            columns: ["fidele_id"]
            isOneToOne: false
            referencedRelation: "fideles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historique_affectations_fideles_nouvelle_communaute_id_fkey"
            columns: ["nouvelle_communaute_id"]
            isOneToOne: false
            referencedRelation: "communautes"
            referencedColumns: ["id"]
          },
        ]
      }
      mentions_livret: {
        Row: {
          created_at: string
          created_by: string | null
          fidele_id: string
          id: string
          observation: string | null
          statut: string
          type_mention: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fidele_id: string
          id?: string
          observation?: string | null
          statut?: string
          type_mention: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fidele_id?: string
          id?: string
          observation?: string | null
          statut?: string
          type_mention?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentions_livret_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "utilisateurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentions_livret_fidele_fk"
            columns: ["fidele_id"]
            isOneToOne: false
            referencedRelation: "fideles"
            referencedColumns: ["id"]
          },
        ]
      }
      paroisses: {
        Row: {
          code: string | null
          created_at: string
          id: string
          nom: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          nom: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          nom?: string
        }
        Relationships: []
      }
      quartiers: {
        Row: {
          created_at: string
          id: string
          nom: string
          paroisse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nom: string
          paroisse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nom?: string
          paroisse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quartiers_paroisse_id_fkey"
            columns: ["paroisse_id"]
            isOneToOne: false
            referencedRelation: "paroisses"
            referencedColumns: ["id"]
          },
        ]
      }
      sacrements: {
        Row: {
          annee: number | null
          annee_pastorale_id: string
          communaute_historique_id: string
          created_at: string
          created_by: string | null
          fidele_id: string
          id: string
          jour: number | null
          lieu: string | null
          marraine: string | null
          ministre: string | null
          mois: number | null
          numero_acte: string | null
          page_registre: string | null
          paroisse_id: string
          parrain: string | null
          precision: Database["public"]["Enums"]["precision_date"]
          reference_registre_requise: boolean
          type: Database["public"]["Enums"]["type_sacrement"]
          updated_at: string
          visa: string | null
        }
        Insert: {
          annee?: number | null
          annee_pastorale_id: string
          communaute_historique_id: string
          created_at?: string
          created_by?: string | null
          fidele_id: string
          id?: string
          jour?: number | null
          lieu?: string | null
          marraine?: string | null
          ministre?: string | null
          mois?: number | null
          numero_acte?: string | null
          page_registre?: string | null
          paroisse_id: string
          parrain?: string | null
          precision?: Database["public"]["Enums"]["precision_date"]
          reference_registre_requise?: boolean
          type: Database["public"]["Enums"]["type_sacrement"]
          updated_at?: string
          visa?: string | null
        }
        Update: {
          annee?: number | null
          annee_pastorale_id?: string
          communaute_historique_id?: string
          created_at?: string
          created_by?: string | null
          fidele_id?: string
          id?: string
          jour?: number | null
          lieu?: string | null
          marraine?: string | null
          ministre?: string | null
          mois?: number | null
          numero_acte?: string | null
          page_registre?: string | null
          paroisse_id?: string
          parrain?: string | null
          precision?: Database["public"]["Enums"]["precision_date"]
          reference_registre_requise?: boolean
          type?: Database["public"]["Enums"]["type_sacrement"]
          updated_at?: string
          visa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sacrements_annee_pastorale_id_fkey"
            columns: ["annee_pastorale_id"]
            isOneToOne: false
            referencedRelation: "annees_pastorales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sacrements_communaute_historique_id_fkey"
            columns: ["communaute_historique_id"]
            isOneToOne: false
            referencedRelation: "communautes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sacrements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "utilisateurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sacrements_fidele_id_fkey"
            columns: ["fidele_id"]
            isOneToOne: false
            referencedRelation: "fideles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sacrements_paroisse_id_fkey"
            columns: ["paroisse_id"]
            isOneToOne: false
            referencedRelation: "paroisses"
            referencedColumns: ["id"]
          },
        ]
      }
      signatures: {
        Row: {
          annee_pastorale_id: string
          created_at: string
          created_by: string | null
          fidele_id: string
          id: string
          signee: boolean
          updated_at: string
        }
        Insert: {
          annee_pastorale_id: string
          created_at?: string
          created_by?: string | null
          fidele_id: string
          id?: string
          signee?: boolean
          updated_at?: string
        }
        Update: {
          annee_pastorale_id?: string
          created_at?: string
          created_by?: string | null
          fidele_id?: string
          id?: string
          signee?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signatures_annee_pastorale_id_fkey"
            columns: ["annee_pastorale_id"]
            isOneToOne: false
            referencedRelation: "annees_pastorales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "utilisateurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_fidele_id_fkey"
            columns: ["fidele_id"]
            isOneToOne: false
            referencedRelation: "fideles"
            referencedColumns: ["id"]
          },
        ]
      }
      utilisateurs: {
        Row: {
          actif: boolean
          created_at: string
          id: string
          nom_complet: string | null
          telephone: string | null
        }
        Insert: {
          actif?: boolean
          created_at?: string
          id: string
          nom_complet?: string | null
          telephone?: string | null
        }
        Update: {
          actif?: boolean
          created_at?: string
          id?: string
          nom_complet?: string | null
          telephone?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      stats_fideles_par_communaute: {
        Row: {
          communaute_id: string | null
          fideles_actifs: number | null
          fideles_decedes: number | null
          paroisse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fideles_communaute_id_paroisse_id_fkey"
            columns: ["communaute_id", "paroisse_id"]
            isOneToOne: false
            referencedRelation: "communautes"
            referencedColumns: ["id", "paroisse_id"]
          },
          {
            foreignKeyName: "fideles_paroisse_id_fkey"
            columns: ["paroisse_id"]
            isOneToOne: false
            referencedRelation: "paroisses"
            referencedColumns: ["id"]
          },
        ]
      }
      stats_sacrements_par_annee: {
        Row: {
          annee_pastorale_id: string | null
          communaute_historique_id: string | null
          paroisse_id: string | null
          total: number | null
          type: Database["public"]["Enums"]["type_sacrement"] | null
        }
        Relationships: [
          {
            foreignKeyName: "sacrements_annee_pastorale_id_fkey"
            columns: ["annee_pastorale_id"]
            isOneToOne: false
            referencedRelation: "annees_pastorales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sacrements_communaute_historique_id_fkey"
            columns: ["communaute_historique_id"]
            isOneToOne: false
            referencedRelation: "communautes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sacrements_paroisse_id_fkey"
            columns: ["paroisse_id"]
            isOneToOne: false
            referencedRelation: "paroisses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      a_role: {
        Args: {
          p_paroisse: string
          p_roles: Database["public"]["Enums"]["role_enoria"][]
        }
        Returns: boolean
      }
      autoriser_correction_annee: {
        Args: { p_annee: string; p_motif: string }
        Returns: undefined
      }
      claim_community: { Args: { p_communaute: string }; Returns: string }
      decider_duplicata: {
        Args: { p_accepter: boolean; p_certificat: string; p_motif?: string }
        Returns: undefined
      }
      demander_duplicata: { Args: { p_sacrement: string }; Returns: string }
      enregistrer_fidele_baptise: { Args: { p_donnees: Json }; Returns: string }
      est_annee_ouverte: { Args: { p_annee: string }; Returns: boolean }
      est_responsable_communaute: {
        Args: { p_communaute: string }
        Returns: boolean
      }
      marquer_certificat_emis: {
        Args: { p_certificat: string }
        Returns: undefined
      }
      peut_lire_fidele: { Args: { p_fidele: string }; Returns: boolean }
      peut_modifier_fidele: { Args: { p_fidele: string }; Returns: boolean }
      synchroniser_mention_livret: {
        Args: {
          p_fidele_id: string
          p_observation?: string
          p_statut: string
          p_type_mention: string
        }
        Returns: string
      }
      transferer_fidele: {
        Args: {
          p_date_debut: string
          p_fidele: string
          p_motif?: string
          p_nouvelle_communaute: string
        }
        Returns: undefined
      }
    }
    Enums: {
      devise_dime: "USD" | "FC"
      precision_date: "exacte" | "mois" | "annee" | "inconnue"
      role_enoria: "responsable" | "secretaire" | "cure"
      statut_certificat: "attente" | "valide" | "refuse" | "emis"
      statut_vie: "vivant" | "decede"
      type_evenement_matrimonial:
        | "ante_baptismum"
        | "post_baptismum"
        | "obiit_conjux"
        | "novas_nuptias"
      type_sacrement: "bapteme" | "eucharistie" | "confirmation"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      devise_dime: ["USD", "FC"],
      precision_date: ["exacte", "mois", "annee", "inconnue"],
      role_enoria: ["responsable", "secretaire", "cure"],
      statut_certificat: ["attente", "valide", "refuse", "emis"],
      statut_vie: ["vivant", "decede"],
      type_evenement_matrimonial: [
        "ante_baptismum",
        "post_baptismum",
        "obiit_conjux",
        "novas_nuptias",
      ],
      type_sacrement: ["bapteme", "eucharistie", "confirmation"],
    },
  },
} as const
