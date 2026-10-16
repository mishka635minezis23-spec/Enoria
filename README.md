# Enoria

Registre numérique des sacrements de la paroisse **Notre Dame d'Afrique**. Enoria complète les registres papier, qui restent la référence officielle.

## Phase actuelle

Socle technique et navigation uniquement. La connexion Supabase, les formulaires métier, les PDF et le livret 3D seront développés dans des phases ultérieures. Aucune donnée paroissiale réelle ou simulée n'est incluse.

## Stack

- HTML pour la coque et les vues de chaque module
- TypeScript pour la navigation et la logique
- Tailwind CSS 4 pour le style
- Vite pour le développement et la compilation
- vite-plugin-pwa pour l'installation PWA et le cache des ressources statiques

## Prérequis

Node.js 20.19+ ou 22.12+, puis npm.

## Démarrer

```bash
npm install
npm run dev
```

Pour vérifier le projet :

```bash
npm run typecheck
npm run build
npm run preview
```

## Organisation

- `src/config/app-config.ts` : source centrale de configuration et stockage local des paramètres publics
- `src/lib/supabase.ts` : client Supabase typé, sans clé secrète
- `src/auth/` : authentification et permissions par rôle
- `src/ui/` : écrans de première configuration, connexion et paramètres
- `src/main.ts` : coque persistante, navigation et démarrage PWA
- `src/router.ts` : routes et chargement des vues
- `src/types/database.types.ts` : types générés depuis le schéma Supabase
- `src/styles.css` : styles Tailwind et règles de présentation
- `public/pages/*.html` : une vue HTML par module fonctionnel

Les routes utilisent des fragments (`#/dashboard`, `#/fideles`, etc.). Le menu reste monté pendant le changement de vue et le navigateur peut revenir en arrière ou avancer.

## Modules présents

1. Tableau de bord
2. Organisation paroissiale
3. Gestion des fidèles
4. Gestion des sacrements
5. Gestion des dîmes
6. Rapports
7. Statistiques par année pastorale
8. Paramètres

## Configuration et sécurité

Au premier lancement, un écran de configuration demande le nom de la paroisse, l'URL Supabase et la clé publique publishable (ou anon historique). Ces valeurs sont conservées localement sur le PC, dans une seule source de configuration : `src/config/app-config.ts`. Le curé peut ensuite modifier la configuration depuis Paramètres ; changer de projet Supabase ferme la session et redémarre l'application.

Les comptes ne peuvent pas s'inscrire depuis l'application. Ils doivent être créés par l'administrateur dans Supabase Auth, puis recevoir une affectation dans `affectations_utilisateurs`. Le profil associé est créé par le trigger existant.

Seule l'URL et une clé publique sont utilisées dans le navigateur. **La clé service_role ou une clé sb_secret ne doit jamais être exposée côté client ni commitée dans ce dépôt.** Le menu est filtré par rôle, mais la sécurité réelle reste assurée par les politiques RLS de la base.

Le type `Database` dans `src/types/database.types.ts` a été généré depuis le schéma existant. Il faut le régénérer après toute évolution validée de la base.

Avant d'activer les écritures métier, les points bloquants décrits dans `docs/database-compatibility.md` doivent être traités et validés côté base.

## Politique hors ligne

La PWA met en cache les ressources de l'application et les vues HTML statiques. Aucune route API, réponse Supabase ou donnée personnelle n'est ajoutée à un cache runtime. Les opérations métier seront bloquées sans connexion dans la version prévue ; aucune file de synchronisation hors ligne n'est prévue.

## Déploiement

Le serveur d'hébergement doit servir `index.html` à la racine. Les routes applicatives sont des fragments URL et ne nécessitent pas de règles de réécriture supplémentaires. Servir le site en HTTPS pour activer l'installation PWA.
