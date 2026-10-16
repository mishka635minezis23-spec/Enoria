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
- Duplicatas : fonctions `demander_duplicata`, `decider_duplicata` et `marquer_certificat_emis`, avec contrôles de rôle dans les fonctions examinées. L'application passe par ces RPC ; aucun INSERT direct dans `certificats`.
- Dîmes : la contrainte unique `(fidele_id, annee_pastorale_id)` permet une seule ligne par fidèle et par année ; l'interface utilise un upsert protégé par RLS.
- Sacrements : l'interface permet l'ajout d'Eucharistie et de Confirmation pour secrétaire/curé. Elle impose l'acte et la page ; la contrainte SQL existante les vérifie lorsque `reference_registre_requise=true`.
- Transfert de communauté : fonction `transferer_fidele`, réservée au secrétaire/curé et limitée à une communauté de la même paroisse.

## Blocages fonctionnels à résoudre avant les écrans d'écriture

1. **Quartiers et communautés** : seules des politiques SELECT ont été observées. Les actions créer/modifier/désactiver ne doivent pas être activées dans l'interface avant qu'une voie d'écriture sûre soit approuvée et mise en place.
2. **Création fidèle + baptême atomique** : aucune fonction transactionnelle dédiée n'a été trouvée lors de l'inventaire. Les politiques actuelles permettent à un responsable de communauté d'insérer un fidèle, mais pas le sacrement correspondant. Deux appels client séparés ne garantissent pas l'atomicité. Il faudra une fonction transactionnelle contrôlée côté base ou restreindre le parcours à un rôle autorisé ; aucune de ces options ne sera appliquée sans validation.
3. **Mariages** : `evenements_matrimoniaux` ne possède pas de contrainte imposant le numéro d'acte et la page du registre. L'écriture des événements matrimoniaux reste donc désactivée dans l'interface, même si le formulaire pourrait les demander.
4. **Duplicatas de mariage** : les RPC de duplicata acceptent un identifiant de `sacrements`, et la table `certificats` référence `sacrements`. Le parcours de duplicata pour un événement matrimonial nécessite une évolution du modèle et une fonction RPC dédiée.
5. **Création fidèle + baptême atomique** : aucune fonction transactionnelle dédiée n'a été trouvée lors de l'inventaire. Les politiques actuelles permettent l'insertion d'un fidèle selon le rôle et la communauté, mais deux appels client séparés ne garantissent pas l'atomicité. Le bouton d'inscription reste désactivé jusqu'à une fonction transactionnelle contrôlée côté base.
6. **Modification de la carte de baptême** : la modification de l'identité et du baptême touche deux tables. L'interface la laisse désactivée jusqu'à une fonction atomique afin d'éviter une mise à jour partielle.
7. **Organisation** : les quartiers et communautés restent en lecture seule, faute de politiques d'écriture observées.
8. **Profil et comptes** : le profil utilisateur est créé par un trigger depuis Auth ; les affectations de rôle sont gérées séparément. L'interface ne déduit jamais un rôle de `user_metadata`.

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
- Demande, décision et émission de duplicata via les RPC auditées ; PDF généré localement après validation du curé. Aucun PDF ni scan n'est envoyé ou stocké dans Supabase.
- Exports CSV filtrés par les permissions RLS.

## Règle de développement

- Ne jamais exposer `service_role` ou une clé secrète dans le navigateur.
- Le client utilisera uniquement l'URL du projet et une clé publishable/anon.
- Les contrôles visuels de rôle ne remplacent jamais RLS.
- Ne pas créer un fidèle sans preuve de baptême.
- L'inscription du fidèle et du baptême doit être atomique.
- Ne jamais compléter une date incertaine par supposition.
- Toute modification SQL doit être présentée, expliquée et approuvée avant exécution.
