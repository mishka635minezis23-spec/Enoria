# Enoria

Registre numérique des sacrements de la paroisse **Notre Dame d'Afrique**. Enoria complète les registres papier, qui restent la référence officielle.

## État du projet

Le socle PWA, l'authentification, la navigation, les principales lectures métier et plusieurs écritures sécurisées sont en place. Les évolutions du schéma sont appliquées par migrations versionnées dans `supabase/migrations/` et vérifiées sur le projet Supabase Enoria.

## Stack

- HTML : coque persistante et une vue distincte par module
- TypeScript : navigation, validations et logique métier
- Tailwind CSS 4 : styles compilés
- Vite : développement et compilation
- Supabase Auth + Postgres/RLS : authentification et données
- vite-plugin-pwa : installation PWA et cache des seuls assets statiques
- pdf-lib : génération locale des duplicatas PDF après validation
- Three.js : livret 3D généré à partir des données, avec vue 2D de secours

## Prérequis et démarrage

Node.js 20.19+ ou 22.12+, puis npm.

```bash
npm install
npm run dev
```

Vérification et compilation :

```bash
npm run typecheck
npm run build
npm run preview
```

Les scripts `predev` et `prebuild` génèrent automatiquement les icônes PNG PWA à partir des couleurs de l'application. Les icônes générées ne contiennent aucune donnée personnelle.

## Organisation du code

- `src/config/app-config.ts` : source centrale de configuration et stockage local des paramètres publics
- `src/lib/supabase.ts` : client Supabase typé, sans clé secrète
- `src/auth/` : authentification, chargement des affectations et permissions par rôle
- `src/features/` : logique des modules (fidèles, sacrements, dîmes, statistiques, rapports, livret)
- `src/ui/` : première configuration, connexion et paramètres
- `src/main.ts` : coque persistante, navigation et démarrage PWA
- `src/router.ts` : routes et chargement des vues
- `src/types/database.types.ts` : types générés depuis le schéma Supabase
- `public/pages/*.html` : une vue HTML par module fonctionnel
- `scripts/generate-icons.mjs` : génération des icônes d'installation

Les routes utilisent des fragments (`#/dashboard`, `#/fideles`, etc.). Le menu reste monté pendant le changement de vue. Les filtres de la liste des fidèles sont conservés lorsqu'on ouvre une fiche puis qu'on revient à la liste.

## Les huit modules

1. **Tableau de bord** : indicateurs calculés depuis les vues statistiques sécurisées.
2. **Organisation paroissiale** : consultation et création des quartiers et communautés par le curé et la secrétaire ; la modification, la désactivation et la suppression depuis l'interface restent à développer.
3. **Gestion des fidèles** : recherche et filtres ; inscription progressive en trois étapes ; fiche-livret en trois colonnes ; statut vivant/décédé et couleur de carte modifiables ; onglets Sacrements, Dîmes, Famille, Historique et Documents. Le fidèle et son baptême sont enregistrés dans une même transaction.
4. **Gestion des sacrements** : recherche, consultation du dossier, ajout d'Eucharistie et de Confirmation. Le livret 3D est généré à partir des données structurées ; une vue 2D est disponible si WebGL ne fonctionne pas.
5. **Gestion des dîmes** : saisie et mise à jour d'une contribution par fidèle et par année pastorale.
6. **Rapports** : exports CSV des fidèles, sacrements, événements matrimoniaux et dîmes. Les duplicatas PDF passent par les fonctions RPC de demande, validation du curé et émission.
7. **Statistiques pastorales** : filtres par année, quartier et communauté, tranches d'âge estimées à partir des années de naissance connues, export de synthèse CSV.
8. **Paramètres** : configuration de l'installation et identité paroissiale ; accessible au curé.

## Configuration et sécurité

Au premier lancement, l'écran de configuration demande le nom de la paroisse, l'URL Supabase et la clé publique publishable (ou anon historique). Ces valeurs publiques sont conservées localement sur le PC, dans une seule source de configuration : `src/config/app-config.ts`. Les paramètres ne sont pas partagés entre installations. Seul le curé peut modifier la configuration depuis Paramètres ; changer de projet Supabase ferme la session et redémarre l'application.

Les comptes ne peuvent pas s'inscrire depuis l'application. Ils doivent être créés par l'administrateur dans Supabase Auth, puis recevoir une affectation dans `affectations_utilisateurs`. Le profil associé est créé par le trigger existant.

Seule l'URL et une clé publique sont utilisées dans le navigateur. **La clé service_role ou une clé sb_secret ne doit jamais être exposée côté client ni commitée dans ce dépôt.** Le menu est filtré par rôle, mais la sécurité réelle reste assurée par les politiques RLS de la base.

Les écritures activées utilisent les voies contrôlées par la base : inscription fidèle + baptême, dîmes via upsert protégé par RLS, Eucharistie/Confirmation via contraintes de registre et duplicatas via RPC sécurisées. La fonction `enregistrer_fidele_baptise(jsonb)` est `SECURITY INVOKER`, réservée aux comptes authentifiés et vérifie le rôle secrétaire/curé. Les couleurs autorisées sont `rose`, `bleu`, `lavande`, `sauge` et `or` ; `rose` est la valeur par défaut. Voir [docs/database-compatibility.md](docs/database-compatibility.md).

Le type `Database` dans `src/types/database.types.ts` a été généré depuis le schéma existant. Il doit être régénéré après toute évolution validée de la base. Le [plan de recette](docs/test-plan.md) décrit les vérifications manuelles à effectuer par rôle et par module.

## Politique hors ligne

La PWA met en cache les ressources de l'application et les vues HTML statiques. Aucune route API, réponse Supabase ou donnée personnelle n'est ajoutée à un cache runtime. Les opérations métier sont suspendues sans connexion ; aucune file de synchronisation hors ligne n'est prévue.

## Installation et déploiement

L'application est prévue pour être installée sur le PC Windows de la paroisse via Chrome ou Edge. L'hébergement doit servir le site en HTTPS et exposer `index.html` à la racine. Les routes applicatives sont des fragments URL et ne nécessitent pas de règles de réécriture supplémentaires.
