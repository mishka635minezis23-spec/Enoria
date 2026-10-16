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

- `src/config/app-config.ts` : source centrale de configuration de l'installation
- `src/main.ts` : coque persistante, menu et démarrage PWA
- `src/router.ts` : routes et chargement des vues
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

La source centrale est `src/config/app-config.ts`. Les paramètres Supabase sont volontairement vides à ce stade. Seule une URL et une clé publique (publishable/anon) pourront être utilisées dans le navigateur. **La clé service_role ne doit jamais être exposée côté client ni commitée dans ce dépôt.**

Les règles d'accès devront être appliquées dans Supabase avec RLS et validations côté base avant toute ouverture des fonctions métier.

## Politique hors ligne

La PWA met en cache les ressources de l'application et les vues HTML statiques. Aucune route API, réponse Supabase ou donnée personnelle n'est ajoutée à un cache runtime. Les opérations métier seront bloquées sans connexion dans la version prévue ; aucune file de synchronisation hors ligne n'est prévue.

## Déploiement

Le serveur d'hébergement doit servir `index.html` à la racine. Les routes applicatives sont des fragments URL et ne nécessitent pas de règles de réécriture supplémentaires. Servir le site en HTTPS pour activer l'installation PWA.
