-- Date effective du versement, distincte de la date technique d'enregistrement.
-- Les historiques restent NULL tant que la vraie date de paiement n'a pas été vérifiée.
ALTER TABLE public.dimes
  ADD COLUMN IF NOT EXISTS date_paiement date;

COMMENT ON COLUMN public.dimes.date_paiement IS
  'Date effective du versement. NULL signifie que la date historique n''est pas connue ou vérifiée.';

CREATE INDEX IF NOT EXISTS idx_dimes_annee_date_paiement
  ON public.dimes (annee_pastorale_id, date_paiement DESC);