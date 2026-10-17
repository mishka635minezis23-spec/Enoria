-- Enoria : couleurs de carte et inscription atomique d'un fidèle avec son baptême.
-- Le rose est le thème par défaut. La liste est volontairement limitée à cinq clés.

ALTER TABLE public.fideles
  ADD COLUMN IF NOT EXISTS carte_couleur text NOT NULL DEFAULT 'rose';

ALTER TABLE public.fideles
  DROP CONSTRAINT IF EXISTS fideles_carte_couleur_check;

ALTER TABLE public.fideles
  ADD CONSTRAINT fideles_carte_couleur_check
  CHECK (carte_couleur = ANY (ARRAY['rose','bleu','lavande','sauge','or']::text[]));

CREATE OR REPLACE FUNCTION public.enregistrer_fidele_baptise(p_donnees jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_paroisse_id uuid := NULLIF(p_donnees->>'paroisse_id','')::uuid;
  v_communaute_id uuid := NULLIF(p_donnees->>'communaute_id','')::uuid;
  v_fidele_id uuid;
  v_bapteme jsonb := p_donnees->'bapteme';
  v_item jsonb;
  v_year_id uuid;
  v_historic_community uuid;
  v_type text;
  v_couleur text := COALESCE(NULLIF(p_donnees->>'carte_couleur',''),'rose');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Une session utilisateur valide est nécessaire.';
  END IF;
  IF v_paroisse_id IS NULL OR v_communaute_id IS NULL THEN
    RAISE EXCEPTION 'La paroisse et la communauté du fidèle sont obligatoires.';
  END IF;
  IF NOT public.a_role(v_paroisse_id, ARRAY['secretaire','cure']::public.role_enoria[]) THEN
    RAISE EXCEPTION 'Seule la secrétaire ou le curé peut enregistrer un fidèle avec son baptême.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.communautes c
    WHERE c.id = v_communaute_id AND c.paroisse_id = v_paroisse_id AND c.active
  ) THEN
    RAISE EXCEPTION 'Choisis une communauté active de cette paroisse.';
  END IF;
  IF NULLIF(BTRIM(p_donnees->>'prenom'),'') IS NULL
     OR NULLIF(BTRIM(p_donnees->>'nom'),'') IS NULL THEN
    RAISE EXCEPTION 'Le prénom et le nom sont obligatoires.';
  END IF;
  IF v_couleur <> ALL (ARRAY['rose','bleu','lavande','sauge','or']::text[]) THEN
    RAISE EXCEPTION 'Couleur de carte non autorisée.';
  END IF;
  IF v_bapteme IS NULL OR jsonb_typeof(v_bapteme) <> 'object' THEN
    RAISE EXCEPTION 'Les informations de baptême sont obligatoires pour créer le dossier.';
  END IF;
  IF NULLIF(BTRIM(v_bapteme->>'numero_acte'),'') IS NULL
     OR NULLIF(BTRIM(v_bapteme->>'page_registre'),'') IS NULL THEN
    RAISE EXCEPTION 'Le numéro d’acte et la page du registre de baptême sont obligatoires.';
  END IF;

  INSERT INTO public.fideles (
    paroisse_id, communaute_id, communaute_depuis, prenom, nom, sexe,
    naissance_jour, naissance_mois, naissance_annee, naissance_precision,
    lieu_naissance, nom_pere, nom_mere, statut,
    deces_jour, deces_mois, deces_annee, deces_precision,
    carte_couleur, created_by
  ) VALUES (
    v_paroisse_id, v_communaute_id,
    COALESCE(NULLIF(p_donnees->>'communaute_depuis','')::date, CURRENT_DATE),
    BTRIM(p_donnees->>'prenom'), BTRIM(p_donnees->>'nom'),
    (p_donnees->>'sexe'),
    NULLIF(p_donnees->>'naissance_jour','')::smallint,
    NULLIF(p_donnees->>'naissance_mois','')::smallint,
    NULLIF(p_donnees->>'naissance_annee','')::integer,
    COALESCE(NULLIF(p_donnees->>'naissance_precision',''), 'inconnue')::public.precision_date,
    NULLIF(BTRIM(p_donnees->>'lieu_naissance'),''),
    NULLIF(BTRIM(p_donnees->>'nom_pere'),''),
    NULLIF(BTRIM(p_donnees->>'nom_mere'),''),
    COALESCE(NULLIF(p_donnees->>'statut',''),'vivant')::public.statut_vie,
    NULLIF(p_donnees->>'deces_jour','')::smallint,
    NULLIF(p_donnees->>'deces_mois','')::smallint,
    NULLIF(p_donnees->>'deces_annee','')::integer,
    COALESCE(NULLIF(p_donnees->>'deces_precision',''),'inconnue')::public.precision_date,
    v_couleur, v_user_id
  )
  RETURNING id INTO v_fidele_id;

  v_year_id := NULLIF(v_bapteme->>'annee_pastorale_id','')::uuid;
  v_historic_community := NULLIF(v_bapteme->>'communaute_historique_id','')::uuid;
  IF v_year_id IS NULL OR v_historic_community IS NULL THEN
    RAISE EXCEPTION 'L’année pastorale et la communauté de célébration du baptême sont obligatoires.';
  END IF;

  INSERT INTO public.sacrements (
    fidele_id, paroisse_id, type, annee_pastorale_id, communaute_historique_id,
    jour, mois, annee, "precision", lieu, numero_acte, page_registre,
    reference_registre_requise, ministre, parrain, marraine, created_by
  ) VALUES (
    v_fidele_id, v_paroisse_id, 'bapteme'::public.type_sacrement,
    v_year_id, v_historic_community,
    NULLIF(v_bapteme->>'jour','')::smallint,
    NULLIF(v_bapteme->>'mois','')::smallint,
    NULLIF(v_bapteme->>'annee','')::integer,
    COALESCE(NULLIF(v_bapteme->>'precision',''),'inconnue')::public.precision_date,
    NULLIF(BTRIM(v_bapteme->>'lieu'),''),
    BTRIM(v_bapteme->>'numero_acte'), BTRIM(v_bapteme->>'page_registre'),
    true, NULLIF(BTRIM(v_bapteme->>'ministre'),''),
    NULLIF(BTRIM(v_bapteme->>'parrain'),''),
    NULLIF(BTRIM(v_bapteme->>'marraine'),''), v_user_id
  );

  IF p_donnees ? 'sacrements' AND jsonb_typeof(p_donnees->'sacrements') <> 'array' THEN
    RAISE EXCEPTION 'Les sacrements complémentaires doivent être une liste.';
  END IF;
  FOR v_item IN
    SELECT value FROM pg_catalog.jsonb_array_elements(COALESCE(p_donnees->'sacrements','[]'::jsonb)) AS entries(value)
  LOOP
    v_type := v_item->>'type';
    IF v_type NOT IN ('eucharistie','confirmation') THEN
      RAISE EXCEPTION 'Type de sacrement complémentaire non autorisé.';
    END IF;
    IF NULLIF(BTRIM(v_item->>'numero_acte'),'') IS NULL
       OR NULLIF(BTRIM(v_item->>'page_registre'),'') IS NULL THEN
      RAISE EXCEPTION 'Pour chaque sacrement complémentaire renseigné, le numéro d’acte et la page sont obligatoires.';
    END IF;
    v_year_id := NULLIF(v_item->>'annee_pastorale_id','')::uuid;
    v_historic_community := NULLIF(v_item->>'communaute_historique_id','')::uuid;
    IF v_year_id IS NULL OR v_historic_community IS NULL THEN
      RAISE EXCEPTION 'L’année pastorale et la communauté sont requises pour chaque sacrement.';
    END IF;
    INSERT INTO public.sacrements (
      fidele_id, paroisse_id, type, annee_pastorale_id, communaute_historique_id,
      jour, mois, annee, "precision", lieu, numero_acte, page_registre,
      reference_registre_requise, ministre, parrain, marraine, created_by
    ) VALUES (
      v_fidele_id, v_paroisse_id, v_type::public.type_sacrement,
      v_year_id, v_historic_community,
      NULLIF(v_item->>'jour','')::smallint,
      NULLIF(v_item->>'mois','')::smallint,
      NULLIF(v_item->>'annee','')::integer,
      COALESCE(NULLIF(v_item->>'precision',''),'inconnue')::public.precision_date,
      NULLIF(BTRIM(v_item->>'lieu'),''),
      BTRIM(v_item->>'numero_acte'), BTRIM(v_item->>'page_registre'),
      true, NULLIF(BTRIM(v_item->>'ministre'),''),
      NULLIF(BTRIM(v_item->>'parrain'),''),
      NULLIF(BTRIM(v_item->>'marraine'),''), v_user_id
    );
  END LOOP;

  IF p_donnees ? 'mariages' AND jsonb_typeof(p_donnees->'mariages') <> 'array' THEN
    RAISE EXCEPTION 'Les événements matrimoniaux doivent être une liste.';
  END IF;
  FOR v_item IN
    SELECT value FROM pg_catalog.jsonb_array_elements(COALESCE(p_donnees->'mariages','[]'::jsonb)) AS entries(value)
  LOOP
    v_type := v_item->>'type';
    IF v_type NOT IN ('ante_baptismum','post_baptismum','obiit_conjux','novas_nuptias') THEN
      RAISE EXCEPTION 'Type d’événement matrimonial non autorisé.';
    END IF;
    IF (NULLIF(BTRIM(v_item->>'numero_acte'),'') IS NULL) <>
       (NULLIF(BTRIM(v_item->>'page_registre'),'') IS NULL) THEN
      RAISE EXCEPTION 'Le numéro d’acte et la page doivent être renseignés ensemble.';
    END IF;
    v_year_id := NULLIF(v_item->>'annee_pastorale_id','')::uuid;
    v_historic_community := NULLIF(v_item->>'communaute_historique_id','')::uuid;
    IF v_year_id IS NULL OR v_historic_community IS NULL THEN
      RAISE EXCEPTION 'L’année pastorale et la communauté sont requises pour chaque événement matrimonial.';
    END IF;
    INSERT INTO public.evenements_matrimoniaux (
      fidele_id, paroisse_id, annee_pastorale_id, communaute_historique_id,
      type, jour, mois, annee, "precision", lieu, numero_acte, page_registre,
      conjoint_nom, conjoint_lieu_bapteme, conjoint_bapteme_jour,
      conjoint_bapteme_mois, conjoint_bapteme_annee, conjoint_bapteme_precision,
      deces_conjoint_jour, deces_conjoint_mois, deces_conjoint_annee,
      deces_conjoint_precision, ministre, visa, created_by
    ) VALUES (
      v_fidele_id, v_paroisse_id, v_year_id, v_historic_community,
      v_type::public.type_evenement_matrimonial,
      NULLIF(v_item->>'jour','')::smallint,
      NULLIF(v_item->>'mois','')::smallint,
      NULLIF(v_item->>'annee','')::integer,
      COALESCE(NULLIF(v_item->>'precision',''),'inconnue')::public.precision_date,
      NULLIF(BTRIM(v_item->>'lieu'),''),
      NULLIF(BTRIM(v_item->>'numero_acte'),''),
      NULLIF(BTRIM(v_item->>'page_registre'),''),
      NULLIF(BTRIM(v_item->>'conjoint_nom'),''),
      NULLIF(BTRIM(v_item->>'conjoint_lieu_bapteme'),''),
      NULLIF(v_item->>'conjoint_bapteme_jour','')::smallint,
      NULLIF(v_item->>'conjoint_bapteme_mois','')::smallint,
      NULLIF(v_item->>'conjoint_bapteme_annee','')::integer,
      COALESCE(NULLIF(v_item->>'conjoint_bapteme_precision',''),'inconnue')::public.precision_date,
      NULLIF(v_item->>'deces_conjoint_jour','')::smallint,
      NULLIF(v_item->>'deces_conjoint_mois','')::smallint,
      NULLIF(v_item->>'deces_conjoint_annee','')::integer,
      COALESCE(NULLIF(v_item->>'deces_conjoint_precision',''),'inconnue')::public.precision_date,
      NULLIF(BTRIM(v_item->>'ministre'),''),
      NULLIF(BTRIM(v_item->>'visa'),''), v_user_id
    );
  END LOOP;

  IF p_donnees ? 'enfants' AND jsonb_typeof(p_donnees->'enfants') <> 'array' THEN
    RAISE EXCEPTION 'Les enfants doivent être transmis dans une liste.';
  END IF;
  FOR v_item IN
    SELECT value FROM pg_catalog.jsonb_array_elements(COALESCE(p_donnees->'enfants','[]'::jsonb)) AS entries(value)
  LOOP
    IF NULLIF(BTRIM(v_item->>'prenom'),'') IS NULL
       OR NULLIF(BTRIM(v_item->>'nom'),'') IS NULL THEN
      RAISE EXCEPTION 'Chaque enfant enregistré doit avoir un prénom et un nom.';
    END IF;
    IF (NULLIF(BTRIM(v_item->>'numero_acte'),'') IS NULL) <>
       (NULLIF(BTRIM(v_item->>'page_registre'),'') IS NULL) THEN
      RAISE EXCEPTION 'Pour le baptême d’un enfant, le numéro d’acte et la page doivent être renseignés ensemble.';
    END IF;
    INSERT INTO public.enfants (
      fidele_parent_id, prenom, nom,
      naissance_jour, naissance_mois, naissance_annee, naissance_precision,
      lieu_bapteme, bapteme_jour, bapteme_mois, bapteme_annee, bapteme_precision,
      numero_acte, page_registre, statut_bapteme, confession, created_by
    ) VALUES (
      v_fidele_id, BTRIM(v_item->>'prenom'), BTRIM(v_item->>'nom'),
      NULLIF(v_item->>'naissance_jour','')::smallint,
      NULLIF(v_item->>'naissance_mois','')::smallint,
      NULLIF(v_item->>'naissance_annee','')::integer,
      COALESCE(NULLIF(v_item->>'naissance_precision',''),'inconnue')::public.precision_date,
      NULLIF(BTRIM(v_item->>'lieu_bapteme'),''),
      NULLIF(v_item->>'bapteme_jour','')::smallint,
      NULLIF(v_item->>'bapteme_mois','')::smallint,
      NULLIF(v_item->>'bapteme_annee','')::integer,
      COALESCE(NULLIF(v_item->>'bapteme_precision',''),'inconnue')::public.precision_date,
      NULLIF(BTRIM(v_item->>'numero_acte'),''),
      NULLIF(BTRIM(v_item->>'page_registre'),''),
      COALESCE(NULLIF(v_item->>'statut_bapteme',''),'inconnu'),
      COALESCE(NULLIF(v_item->>'confession',''),'inconnue'), v_user_id
    );
  END LOOP;

  RETURN v_fidele_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.enregistrer_fidele_baptise(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enregistrer_fidele_baptise(jsonb) TO authenticated;
COMMENT ON FUNCTION public.enregistrer_fidele_baptise(jsonb) IS
  'Enregistrement transactionnel d’un fidèle avec son baptême, sacrements complémentaires, enfants et événements matrimoniaux. Appelable par secrétaire/curé autorisé.';
