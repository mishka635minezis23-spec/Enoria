-- Link a matrimonial event to the other faithful's parish record.
-- The composite FK guarantees that both records belong to the same parish.
CREATE UNIQUE INDEX IF NOT EXISTS fideles_id_paroisse_id_unique_idx
  ON public.fideles (id, paroisse_id);

ALTER TABLE public.evenements_matrimoniaux
  ADD COLUMN IF NOT EXISTS conjoint_fidele_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evenements_matrimoniaux_conjoint_paroisse_fkey'
      AND conrelid = 'public.evenements_matrimoniaux'::regclass
  ) THEN
    ALTER TABLE public.evenements_matrimoniaux
      ADD CONSTRAINT evenements_matrimoniaux_conjoint_paroisse_fkey
      FOREIGN KEY (conjoint_fidele_id, paroisse_id)
      REFERENCES public.fideles (id, paroisse_id)
      ON DELETE SET NULL (conjoint_fidele_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evenements_matrimoniaux_conjoint_distinct_check'
      AND conrelid = 'public.evenements_matrimoniaux'::regclass
  ) THEN
    ALTER TABLE public.evenements_matrimoniaux
      ADD CONSTRAINT evenements_matrimoniaux_conjoint_distinct_check
      CHECK (conjoint_fidele_id IS NULL OR conjoint_fidele_id <> fidele_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS evenements_matrimoniaux_conjoint_idx
  ON public.evenements_matrimoniaux (conjoint_fidele_id)
  WHERE conjoint_fidele_id IS NOT NULL;
