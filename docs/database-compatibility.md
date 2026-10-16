# Compatibilité avec le schéma Supabase existant

État vérifié le 16 octobre 2026 en lecture seule. Ce document décrit les capacités observées ; il ne constitue pas une autorisation de modifier la base.

## Modèle déjà présent

- `fideles` : identité, naissance, décès, communauté actuelle et statut de vie.
- `sacrements` : baptême, eucharistie et confirmation ; date à précision contrôlée, communauté historique, numéro d'acte et page.
- `evenements_matrimoniaux` : événements matrimoniaux et informations du conjoint.
- `quartiers` et `communautes` : structure territoriale.
- `annees_pastorales` : années et année active.
- `dimes`, `enfants`, `mentions_livret`, `certificats`, `signatures`, `historique_actions` et `historique_affectations_fideles`.
- Les vues `stats_fideles_par_communaute` et `stats_sacrements_par_annee` sont déjà présentes et déclarées `security_invoker=true`.

Les types TypeScript de cette structure sont générés dans `src/types/database.types.ts`. Ils devront être régénérés après toute évolution validée du schéma.

## Règles RLS observées

Toutes les tables publiques examinées ont RLS activé. Les rôles existants sont `responsable`, `secretaire` et `cure`.

- Lecture des fidèles : secrétaire/curé ou responsable de leur communauté.
- Insertion d'un fidèle : secrétaire/curé ou responsable de sa communauté, si la communauté est active.
- Modification d'un fidèle : secrétaire/curé.
- Écriture des sacrements : secrétaire/curé. Le responsable de communauté a une politique de lecture, pas d'écriture.
- Dîmes : lecture et écriture secrétaire/curé.
- Mentions du livret : écriture via la fonction `synchroniser_mention_livret`.
- Duplicatas : fonctions `demander_duplicata`, `decider_duplicata` et `marquer_certificat_emis`, avec contrôles de rôle dans les fonctions examinées.
- Transfert de communauté : fonction `transferer_fidele`, réservée au secrétaire/curé et limitée à une communauté de la même paroisse.

## Blocages fonctionnels à résoudre avant les écrans d'écriture

1. **Quartiers et communautés** : seules des politiques SELECT ont été observées. Les actions créer/modifier/désactiver ne doivent pas être activées dans l'interface avant qu'une voie d'écriture sûre soit approuvée et mise en place.
2. **Création fidèle + baptême atomique** : aucune fonction transactionnelle dédiée n'a été trouvée lors de l'inventaire. Les politiques actuelles permettent à un responsable de communauté d'insérer un fidèle, mais pas le sacrement correspondant. Deux appels client séparés ne garantissent pas l'atomicité. Il faudra une fonction transactionnelle contrôlée côté base ou restreindre le parcours à un rôle autorisé ; aucune de ces options ne sera appliquée sans validation.
3. **Certificats** : la table ne présente qu'une politique de lecture dans l'inventaire. L'interface devra passer par les fonctions RPC prévues, jamais par un INSERT direct.
4. **Profil et comptes** : le profil utilisateur est créé par un trigger depuis Auth ; les affectations de rôle sont gérées séparément. L'interface ne doit jamais déduire un rôle de `user_metadata`.

## Alertes de l'analyse Supabase

L'analyse de sécurité a signalé :
- l'extension `btree_gist` installée dans `public` ;
- 10 fonctions `SECURITY DEFINER` exécutables par `authenticated`. Plusieurs fonctions métier examinées contiennent des contrôles d'authentification et de rôle, mais l'exposition RPC de chaque fonction reste à revoir ;
- des alertes de performance : clés étrangères sans index couvrant, certaines expressions Auth réévaluées par ligne et politiques permissives multiples.

Les vues statistiques examinées utilisent `security_invoker=true`, ce qui est le comportement attendu pour ne pas contourner les politiques RLS.

## Règle de développement

- Ne jamais exposer `service_role` ou une clé secrète dans le navigateur.
- Le client utilisera uniquement l'URL du projet et une clé publishable/anon.
- Les contrôles visuels de rôle ne remplacent jamais RLS.
- Ne pas créer un fidèle sans preuve de baptême.
- L'inscription du fidèle et du baptême doit être atomique.
- Ne jamais compléter une date incertaine par supposition.
- Toute modification SQL doit être présentée, expliquée et approuvée avant exécution.
