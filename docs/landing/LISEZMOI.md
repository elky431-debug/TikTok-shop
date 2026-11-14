# Captures fournies à la main pour le défilé de l'accueil

Une image posée ici sous le nom d'une carte du défilé remplace la capture automatique de cette carte :

- `analyse.png` (ou `.jpg`, `.jpeg`, `.webp`) : carte « Analyse de vidéo ».

Les autres noms possibles sont ceux de `LANDING_SHOTS` dans `scripts/screenshots-landing.ts` (`dashboard`, `radar`,
`fiche-produit`, `studio`, `serie`, `teleprompteur`, `plan`, `recap`, `propositions`, `analyse`, `alertes`,
`comparateur`).

L'image est recadrée par le haut au format des cartes (640 × 416), puis écrite en WebP aux deux tailles dans
`public/landing/` (640 et 320 px de large) :

```bash
npm run screenshots:landing -- --sources
```

`npm run screenshots:landing` (toutes les captures) l'utilise aussi à la place de la capture automatique.
