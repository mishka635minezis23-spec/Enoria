# Compatibilité avec le schéma Supabase existant

État vérifié le 17 octobre 2026. Les politiques RLS et privilèges décrits ci-dessous correspondent aux modifications appliquées dans le projet Supabase PNDA et versionnées dans supabase/migrations/.

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
- Modification et suppression d'un fidèle : secrétaire/curé dans leur paroisse.
- Écriture des sacrements : secrétaire/curé. Le responsable de communauté a une politique de lecture, pas d'écriture.
- Dîmes : lecture et écriture secrétaire/curé.
- Quartiers et communautés : création, consultation, modification et suppression par le secrétaire/curé de la paroisse concernée. Les responsables de communauté ne disposent pas des droits d'administration territoriale.
- Certificats : gestion par secrétaire/curé uniquement lorsque le sacrement lié appartient à leur paroisse et que le fidèle correspond au sacrement.
- Affectations utilisateurs : gestion complète par le curé ; le secrétaire peut gérer les affectations ordinaires mais ne peut pas attribuer ni modifier le rôle cure.
- Profils utilisateurs : le secrétaire/curé peut lire les profils affectés à sa paroisse et modifier uniquement le nom complet et le téléphone. La création et la suppression des profils restent hors de l'API cliente.
- Historique : les entrées existantes de l'historique restent non modifiables ; le rôle administrateur peut ajouter une entrée de journal liée à un fidèle de sa paroisse.
- Mentions du livret : écriture via la fonction `synchroniser_mention_livret`.
- Duplicatas : fonctions `demander_duplicata`, `decider_duplicata` et `marquer_certificat_emis`, avec contrôles de rôle dans les fonctions examinées. L'application passe par ces RPC ; aucun INSERT direct dans `certificats`.
- Dîmes : la contrainte unique `(fidele_id, annee_pastorale_id)` permet une seule ligne par fidèle et par année ; l'interface utilise un upsert protégé par RLS.
- Sacrements : l'interface permet l'ajout d'Eucharistie et de Confirmation pour secrétaire/curé. Elle impose l'acte et la page ; la contrainte SQL existante les vérifie lorsque `reference_registre_requise=true`.
- Transfert de communauté : fonction `transferer_fidele`, réservée au secrétaire/curé et limitée à une communauté de la même paroisse.

## Blocages fonctionnels qui restent à résoudre

1. **Création fidèle + baptême atomique** : aucune fonction transactionnelle dédiée n'a été trouvée. Les politiques permettent à un responsable de communauté d'insérer un fidèle, mais pas le sacrement correspondant. Deux appels client séparés ne garantissent pas l'atomicité ; ce parcours doit rester limité à un rôle autorisé ou passer par une fonction transactionnelle contrôlée côté base.
2. **Mariages** : l'interface garde l'écriture des événements matrimoniaux désactivée car le modèle n'impose pas le numéro d'acte et la page du registre. Une règle métier explicite est nécessaire avant d'activer ce parcours.
3. **Duplicatas de mariage** : les RPC de duplicata acceptent un identifiant de sacrements, et la table certificats référence sacrements. Le parcours de duplicata pour un événement matrimonial nécessite une évolution du modèle et une fonction RPC dédiée.
4. **Modification de la carte de baptême** : la modification de l'identité et du baptême touche deux tables. L'interface la laisse désactivée jusqu'à une fonction atomique afin d'éviter une mise à jour partielle.
5. **Organisation** : la création des quartiers et communautés est maintenant disponible pour le curé et le secrétaire. La modification, la désactivation et la suppression depuis l'interface ne sont pas encore implémentées ; les politiques RLS et les privilèges SQL restent en place comme deuxième niveau de protection.
6. **Profil et comptes** : le profil utilisateur est créé par un trigger depuis Auth ; les affectations de rôle sont gérées séparément. L'interface ne déduit jamais un rôle de user_metadata.

## Alertes de l'analyse Supabase

L'analyse de sécurité a signalé :
- l'extension `btree_gist` installée dans `public` ;
- 10 fonctions `SECURITY DEFINER` exécutables par `authenticated`. Plusieurs fonctions métier examinées contiennent des contrôles d'authentification et de rôle, mais l'exposition RPC de chaque fonction reste à revoir ;
- des alertes de performance : clés étrangères sans index couvrant, certaines expressions Auth réévaluées par ligne et politiques permissives multiples.

Les vues statistiques examinées utilisent `security_invoker=true`, ce qui est le comportement attendu pour ne pas contourner les politiques RLS.

## Fonctionnalités déjà branchées à la base

- Connexion Supabase Auth par mot de passe, chargement du profil et des affectations actives.
- Navigation filtrée par rôle ; RLS reste la protection réelle.
- Tableau de bord et statistiques calculés depuis les vues existantes.
- Liste et fiche du fidèle, avec les cinq onglets prévus.
- Ajout d'Eucharistie et de Confirmation via INSERT contrôlé par RLS et contraintes existantes.
- Dîmes via upsert sur la contrainte unique.
- Demande, décision et émission de duplicata via les RPC auditées ; PDF généré localement après validation du curé. Aucun PDF ni scan n'est envoyé ou stocké dans Supabase ; si le fichier émis est perdu, une nouvelle demande doit être créée afin de conserver la traçabilité.
- Exports CSV filtrés par les permissions RLS.

## Règle de développement

- Ne jamais exposer `service_role` ou une clé secrète dans le navigateur.
- Le client utilisera uniquement l'URL du projet et une clé publishable/anon.
- Les contrôles visuels de rôle ne remplacent jamais RLS.
- Ne pas créer un fidèle sans preuve de baptême.
- L'inscription du fidèle et du baptême doit être atomique.
- Ne jamais compléter une date incertaine par supposition.
- Toute modification SQL doit être présentée, expliquée et approuvée avant exécution.
