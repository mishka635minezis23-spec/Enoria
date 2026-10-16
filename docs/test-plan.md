# Plan de recette Enoria

Ce plan sert à vérifier l'application avant son utilisation avec les registres réels. Privilégier une base de test et des dossiers de démonstration autorisés ; ne pas créer de données dans la base de production sans validation préalable.

## 1. Installation et configuration

1. Ouvrir l'application hébergée en HTTPS dans Chrome ou Edge sur le PC Windows paroissial.
2. Au premier lancement, saisir le nom de la paroisse, l'URL Supabase et uniquement la clé publique publishable/anon.
3. Vérifier que le test de connexion réussit.
4. Vérifier qu'aucune clé `service_role` ou `sb_secret` n'est présente dans les fichiers distribués.
5. Installer Enoria depuis le menu du navigateur et vérifier l'icône, le nom et le mode autonome.
6. Fermer puis rouvrir l'application : la configuration locale doit être conservée.

## 2. Comptes et rôles

Tester avec trois comptes distincts :

- Responsable : tableau de bord, fidèles, sacrements en lecture, statistiques limitées à sa communauté selon RLS.
- Secrétaire : organisation en lecture, fidèles, sacrements, dîmes, rapports et demandes de duplicata.
- Curé : tous les modules, paramètres, validation et émission des duplicatas.

Pour chaque rôle, vérifier aussi l'accès direct par URL à un module interdit. Le menu masqué n'est pas une preuve de sécurité : la requête doit être refusée par RLS.

## 3. Fidèles et navigation

1. Rechercher par prénom puis par nom.
2. Combiner quartier, communauté, sexe et statut.
3. Passer à la page suivante puis ouvrir une fiche.
4. Utiliser « Retour à la liste » et le bouton précédent du navigateur.
5. Vérifier que les filtres et la page sont conservés.
6. Actualiser directement une URL de fiche et vérifier que la fiche se recharge.
7. Tester les cinq onglets : informations générales, sacrements, famille, historique, documents.
8. Vérifier qu'un responsable ne voit pas l'historique ou les documents réservés aux rôles autorisés.

L'ajout d'un fidèle reste volontairement désactivé jusqu'à la mise en place d'une fonction transactionnelle qui enregistre ensemble le fidèle et son baptême.

## 4. Sacrements et références papier

Avec un compte secrétaire ou curé :

1. Ouvrir une fiche puis l'onglet Sacrements.
2. Ajouter une Eucharistie ou une Confirmation dans une année et une communauté autorisées.
3. Tester les précisions exacte, mois, année et inconnue.
4. Vérifier que le numéro d'acte et la page sont obligatoires.
5. Tenter d'ajouter deux fois le même type : l'unicité de la base doit refuser le doublon.
6. Vérifier que la date partielle est affichée sans inventer de jour ou de mois.

L'édition de la carte de baptême et l'écriture des événements matrimoniaux restent désactivées : les opérations atomiques et/ou contraintes de registre nécessaires ne sont pas encore garanties par le schéma.

## 5. Dîmes

1. Choisir un fidèle accessible et saisir un montant en USD.
2. Saisir une seconde fois une contribution pour le même fidèle et la même année.
3. Vérifier que la ligne est mise à jour au lieu de créer un doublon.
4. Refaire le test en FC.
5. Vérifier que le responsable n'accède pas au module.

## 6. Duplicatas PDF

1. Avec la secrétaire, demander un duplicata pour un sacrement existant.
2. Vérifier que la demande apparaît « En attente ».
3. Avec un compte secrétaire, tenter de valider : l'action doit être absente ou refusée.
4. Avec le curé, valider une demande ; tester également un refus avec motif obligatoire.
5. Émettre le PDF uniquement après validation.
6. Vérifier le numéro du duplicata, le nom, la date selon sa précision, le lieu, le numéro d'acte et la page.
7. Vérifier que le PDF est téléchargé localement et qu'aucun document ni scan n'est stocké dans Supabase.

Le PDF émis n'est pas conservé sur le serveur. En cas de perte, une nouvelle demande doit être créée pour préserver la traçabilité.

## 7. Livret 3D

1. Ouvrir « Voir le livret 3D » depuis une fiche.
2. Faire glisser le livre à la souris et au doigt.
3. Vérifier les informations personnelles et les sacrements visibles selon les droits.
4. Désactiver WebGL ou utiliser un navigateur non compatible : la vue 2D de secours doit apparaître.
5. Fermer le livret puis quitter la fiche : le rendu WebGL doit être libéré.

## 8. Statistiques et rapports

1. Changer d'année pastorale.
2. Filtrer par quartier puis par communauté.
3. Vérifier les tranches d'âge ; les dates inconnues doivent être exclues.
4. Exporter la synthèse CSV et vérifier les totaux.
5. Exporter chaque type de rapport CSV avec un compte secrétaire ou curé.
6. Vérifier que l'export demande une confirmation et que les fichiers ne sont pas mis en cache par la PWA.

Les tranches d'âge restent estimatives lorsque la précision de naissance n'est pas exacte.

## 9. Hors connexion et sécurité

1. Charger l'application en ligne, puis couper le réseau.
2. Vérifier que la coque et les vues statiques restent accessibles.
3. Vérifier qu'une opération métier ne peut pas être enregistrée hors ligne.
4. Revenir en ligne et vérifier le fonctionnement normal.
5. Dans les outils réseau du navigateur, vérifier qu'aucune réponse Supabase n'est servie depuis un cache runtime.
6. Tester une session expirée, un profil désactivé et une affectation arrivée à expiration.
7. Vérifier qu'un compte sans rôle actif ne peut pas entrer dans l'application.

## Vérifications techniques

- `npm run typecheck`
- `npm run build`
- Vérifier le succès du workflow GitHub Actions « Build Enoria ».
- Vérifier que le manifeste PWA contient les icônes PNG 192×192 et 512×512 générées au build.
