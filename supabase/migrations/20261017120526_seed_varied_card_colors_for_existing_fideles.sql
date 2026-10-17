-- Préremplissage visuel déterministe d'une petite partie des cartes existantes.
-- La couleur est purement décorative et ne dépend d'aucune donnée personnelle.
-- Les nouveaux fidèles conservent le rose par défaut.

UPDATE public.fideles
SET carte_couleur = CASE mod(get_byte(decode(md5(id::text),'hex'),0),20)
  WHEN 0 THEN 'bleu'
  WHEN 1 THEN 'lavande'
  WHEN 2 THEN 'sauge'
  WHEN 3 THEN 'or'
  ELSE 'rose'
END
WHERE mod(get_byte(decode(md5(id::text),'hex'),0),20) IN (0,1,2,3);
