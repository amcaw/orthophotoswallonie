# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Liens et intégration

Chaque vue garde son état dans le fragment de l'URL, sans créer d'entrée dans l'historique :

```
#latitude,longitude,zoomz,annéeA,annéeB
```

- Avant/après et Loupe : `annéeA` est l'année de gauche (ou du haut, ou de la loupe), `annéeB` celle de droite (ou du bas, ou du fond).
- Voyage : seule `annéeA` est utilisée.
- Une année s'écrit comme dans le sélecteur (`1971`, `2022`, `2012-2013`). Pour une seule saison, on utilise l'identifiant de la couche (`ortho-2022-ete`).

Exemple : `/timelapse/#50.465,4.867,15z,1971,2026`.

Le sélecteur de mode (Avant/après · Loupe · Voyage) est masqué avec `?modes=0`, pour les articles qui imposent un mode : `/lens/?modes=0#50.465,4.867,15z,1971,2026`.
