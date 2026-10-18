-- Conserver le territoire du fidèle au moment de chaque versement.
-- Les anciens enregistrements restent NULL car leur quartier historique n'est pas vérifiable.
ALTER TABLE public.dimes
  ADD COLUMN IF NOT EXISTS communaute_paiement_id uuid;

DO $$
BEGIN
  ALTER TABLE public.dimes
    ADD CONSTRAINT dimes_communaute_paiement_id_fkey
    FOREIGN KEY (communaute_paiement_id)
    REFERENCES public.communautes(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.dimes.communaute_paiement_id IS
  'Communauté de rattachement au moment du versement ; NULL pour les anciens enregistrements non documentés.';

CREATE INDEX IF NOT EXISTS idx_dimes_communaute_paiement_id
  ON public.dimes (communaute_paiement_id);