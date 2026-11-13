# Refonte de l'appli : captures et comparaison avec EtSmart

Captures Playwright du 13 novembre 2026, mode local (produits fictifs signalés comme tels), à 390 px (`-mobile`,
affichées en 2×) et 1440 px (`-desktop`). Régénérer : `npm run dev`, puis
`node scripts/screenshots.mjs --base http://localhost:3000 --email <compte> --out docs/captures/refonte-app --format jpeg --pages /app,/app/radar,…`.

Pages : `dashboard`, `radar`, `produit_…` (fiche produit), `studio`, `recherche`, `alertes`, `comparer`, `recap`,
`preparation`, `plan`, `gains`, `offres` (propositions de marques, verrouillé en Pro), `analyse` (verrouillé en Pro),
`parrainage`, `compte`, `mes-produits`, `notifications`, `formateur`, `admin`, `admin_utilisateurs`, et
`onboarding-…` (questions 1, 3, 4, 6, 8, 9, écran « On prépare ton radar », arrivée sur le dashboard).

## Pourquoi pas de capture d'EtSmart à côté

L'appli EtSmart (`elky431-debug/Etsmart`, `/dashboard`) ne s'ouvre qu'avec un compte connecté à son propre Supabase ;
ses dépendances et ses clés ne sont pas dans cette session. La comparaison a donc été faite **dans le code**,
composant par composant, en recopiant les classes d'EtSmart. Pour une comparaison en images, il suffit d'un compte de
démonstration EtSmart : les mêmes pages se capturent alors en une commande.

## Correspondance composant par composant

| Élément | EtSmart (code source) | Tracktout | Écart voulu |
| --- | --- | --- | --- |
| Barre latérale | `dashboard/page.tsx` : fixe, `w-16` → `group-hover:w-64`, `transition-[width] duration-300 ease-out`, sections en capitales `text-xs tracking-wider` | `components/app/shell.tsx` `AppSidebar` : mêmes valeurs, s'ouvre aussi au focus clavier | entrée active en dégradé cyan → rose au lieu de bleu → turquoise |
| En-tête et menu mobiles | en-tête `h-16`, menu déroulant animé 0,2 s, barre du bas `h-16 bg-black/95 backdrop-blur-md` | `AppMobileHeader`, `AppBottomNav` | onglet actif cyan |
| Conteneur de page | `mx-auto max-w-7xl space-y-8 px-3 py-4 sm:px-6 sm:py-6 md:px-8 md:py-10 lg:px-10` | `app/app/layout.tsx` | — |
| En-tête de page | étiquette `text-[10px] tracking-[0.2em]`, `h1 text-3xl font-bold tracking-tight md:text-[2rem]`, phrase `text-sm max-w-xl`, `border-b pb-8` | `PageHeader` (`components/ui/surface.tsx`) | phrase en `--text-muted` (#8A8B91, 6:1) au lieu de blanc 50 % (4,4:1) |
| Cartes | `rounded-2xl border border-white/10 bg-black p-6 md:p-8`, halo `0 0 40px -12px` au survol | `Card`, cartes du dashboard | halo cyan TikTok |
| Pastille d'icône | `h-9 w-9 rounded-lg border border-[#00d4ff]/30 bg-[#00d4ff]/10` | `IconChip` | cyan #25F4EE |
| Champs | `rounded-xl border-white/10 bg-black px-4 py-3 text-sm focus:border-cyan/45 focus:ring-1` | `Input`, `Select`, `Textarea` (`field.tsx`) | contour clavier cyan gardé |
| Bouton secondaire | `rounded-full border-white/20 px-5 py-2.5`, survol cyan | « Ouvrir le radar » du dashboard | — |
| Pastille de variation | `rounded-full border px-3 py-1 text-sm font-semibold` | `TrendPill` | — |
| Titre de section | étiquette 10 px + trait `bg-gradient-to-r from-white/20 to-transparent` | `SectionTitle` | — |
| Indicateurs | grille 2 → 4 colonnes, chiffre `text-3xl`, icône en haut à droite | grille 2 → 5 colonnes (`KpiCard`) | 5 indicateurs demandés |
| Grand chiffre | `text-[2.5rem] md:text-[2.85rem] lg:text-[3.25rem]` en dégradé | gains du mois | dégradé cyan → rose |
| Onglets | trait `h-0.5` en dégradé sous l'onglet actif, `layoutId`, ressort 500 / 30 | `Tabs` (dashboard), onglets du studio et de l'admin | — |
| Graphiques | Recharts `AreaChart`, `linearGradient` 0,4 → 0, axes 11 px, info-bulle `#1a1a1a / #333` | `GainsChart` | axes en #8A8B91 au lieu de #666 (contraste) |
| Squelettes | Motion, opacité 0,5 → 1 → 0,5 en 1,5 s | `Skeleton` (`animate-skeleton`) | — |
| Entrées | `opacity 0, y 20 → 1, 0` en 0,3 s | `app/app/template.tsx`, cartes en cascade (0,4 s, décalage 60 ms) | sans déplacement si « moins d'animations » |

## Vérifications

- Audit axe (WCAG 2.1 AA) : 0 erreur sur les 17 pages de l'appli, l'admin (3 pages), l'espace formateur et
  l'onboarding, à 390 et 1440 px.
- Onboarding : chaque écran tient dans 390 × 844 sans défiler (hauteur du contenu = hauteur visible, mesurée).
