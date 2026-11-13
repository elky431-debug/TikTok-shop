# Session 5 · bloc 4 — Studio de scripts

## Décisions

- **A1 · Stockage.** Une génération = une fiche `studio_script` (`user_records`), source de vérité : réglages, accroches,
  3 scripts, version précédente, versions, traductions, notes, favori. La ligne `scripts` d'origine est gardée comme
  trace (compteur de l'espace formateur `coach_students()`, export de tout l'historique) ; son texte complet, ses
  accroches et son favori sont tenus à jour à chaque changement. Les générations d'avant la session 5 sont listées
  dans l'historique et reprises en fiche à leur première ouverture (une seule fois). Pas de nouvelle table.
- **A2 · Huit formats.** Type `StudioFormat` dans `lib/ai/formats.ts` (5 anciens + comparaison, routine, top 3).
  La contrainte SQL est élargie par `supabase/migrations/20261115000410_studio_huit_formats.sql` ; le type
  `ScriptFormat` de `lib/db/types.ts` (hors périmètre) n'en liste que 5 : conversion à un seul endroit
  (`lib/studio/store.ts`).
- **A3 · Réglages.** Durée 15, 30 ou 60 s (acceptées 10–22, 15–45, 40–75 s ; 3–4, 4–6, 6–9 plans), ton (énergique,
  calme, humour, expert), angle (problème résolu, transformation, objection levée, rapport qualité-prix) plus
  « Varié » par défaut (un angle par script). Ils vont dans le message (prompt système stable pour le cache) et le
  générateur simulé les suit (durées, plans, accroches, phrases). Formulaire pré-rempli avec les derniers réglages.
- **A4 · Mention de collaboration commerciale** (loi n° 2023-451, art. 5 : « Publicité » ou « Collaboration
  commerciale » visible pendant toute la vidéo). Garde-fou `commercialMentionIssues` / `ensureCommercialMention`
  (`lib/ai/guard.ts`) : `#publicité` en tête des hashtags et rappel de la mention à l'écran, appliqués à chaque
  génération, retouche et traduction (version locale : `#Werbung`, `#pubblicità`, `#publicidad`). Ajouté par le
  serveur, jamais laissé au modèle.
- **A5 · Top 3 sans « n°1 ».** Le garde-fou refuse « n°1 » / « numéro un » (superlatif) : le format compte 3, 2, 1.
- **A6 · Plans de coupe.** Champ `broll` du schéma, nullable et facultatif (JSON Schema strict d'OpenAI, anciens
  échanges) ; complété par ceux du format si l'IA en donne moins de 2.
- **A7 · Style personnel** (Pro et Pro+). 3 à 5 textes de 40 caractères au moins ; profil (résumé, ton, longueur des
  phrases, tutoiement, expressions, débuts, fins, à garder, à éviter) tiré par `askStructured`, nettoyé (interdits,
  doublons, longueurs). Sans clé : vraie analyse simple du texte (comptages, expressions présentes dans 2 textes au
  moins), affichée « Analyse simple, sans IA ». Modifiable à la main, mise en pause, suppression (efface les textes).
  Quota : 5 analyses par jour en Pro, 20 en Pro+, comptées dans un journal `style_analyse` sans texte (supprimer son
  style ne remet pas le compteur à zéro).
- **A8 · Quotas des fiches.** `reserveToday` (`lib/studio/quota.ts`, sur `remainingToday` du socle) crée la fiche puis
  recompte : jamais au-delà de la limite (au pire, un refus en cas de course) ; la place est rendue si l'IA échoue.
  Les écritures de scripts gardent le compteur atomique existant (`incrementUsage`).
- **A9 · Série de 20.** L'IA propose 20 angles (titre, accroche, format, type, phrase). Doublons contrôlés par le code
  (indice de Jaccard sur les mots significatifs, sans accents ni mots vides : titre ≥ 0,6, accroche ≥ 0,7, même
  format + même type + même idée ≥ 0,6), entre eux et avec les séries précédentes du même produit ; un seul tour de
  remplaçants, puis complément par des angles simulés (signalé). Une série ne se supprime pas (le quota se
  contournerait). Un angle → une génération en un clic (une écriture du jour, réglages = derniers utilisés + type de
  l'angle) ; un second clic rouvre la même génération sans crédit.
- **A10 · Retouches.** Réécrire une ligne (voix + texte à l'écran d'un plan), raccourcir (60 → 30 → 15 s), rendre plus
  percutant : `askStructured`, un nouvel essai si un interdit reste, puis retrait des phrases fautives ; une version
  « raccourcie » plus longue est refusée. La version précédente est gardée (bouton « Revenir », échange annulable).
  Limite par génération : Gratuit 5, Pro 20, Pro+ 60 (dans `lib/studio/limits.ts`, faute de champ dans
  `lib/plans.ts`) ; accroches : 5 par génération, inchangé.
- **A11 · Traduction** (Pro+, `scriptTranslation`) : voix, texte à l'écran, appel à l'action, légende et hashtags ;
  indications de tournage gardées en français ; « du », « tu », « tú ». Marquée « À refaire » si le script change
  ensuite. Compte comme une retouche. Sans clé : texte français marqué `[DE]`, signalé « Simulée ».
- **A12 · Téléprompteur.** Calque plein écran (portail ; `requestFullscreen` quand le navigateur le permet, sinon
  calque fixe, ex. iPhone), écran maintenu allumé (Wake Lock), vitesse 1 à 10, 6 tailles de texte, pause et reprise
  (bouton, toucher, barre d'espace), compte à rebours de 3 s, repère de lecture. Avec `prefers-reduced-motion` :
  « une phrase à la fois », changements sans animation (à la main ou au rythme choisi) ; le défilement continu reste
  activable volontairement.
- **A13 · Notes.** Par script : 1 à 5 étoiles et « Il a vendu ? » (oui, non, pas encore). À chaque génération, 3
  exemples au plus (vendu d'abord, puis la note, puis le plus récent ; seulement ≥ 4/5 ou vendu) entrent dans le
  message ; ceux notés 1 ou 2 sont cités « à ne pas refaire ». En simulé, l'accroche du meilleur revient parmi les 10.
- **A14 · Export PDF côté serveur, sans dépendance** (`lib/studio/pdf.ts`, ~250 lignes) : un vrai fichier .pdf,
  identique sur téléphone et ordinateur (Safari sur iPhone cache l'enregistrement en PDF de `window.print()`, et la
  mise en page de l'appli n'a pas à être neutralisée) ; polices standard Helvetica (rien à embarquer), encodage WinAnsi
  (accents FR/DE/IT/ES, guillemets, €), retour à la ligne avec les largeurs officielles, pages numérotées, fichier
  ASCII donc table xref exacte (vérifiée par les tests). Export texte et PDF (génération entière, un script, ou sa
  traduction) réservés à Pro+ (droit `export`, comme la décision 33) ; « Copier » reste ouvert à tous.
- **A15 · Historique.** Filtres Tous / Favoris / Ont vendu, 30 lignes puis « afficher les plus anciens » ; note,
  « a vendu », favori et série visibles sur chaque ligne.

## État

| Point | État | Plan | Quota (côté serveur) |
| --- | --- | --- | --- |
| 1. Huit formats | marche en réel et en simulé | tous | écritures du jour : 3 / 30 / illimité |
| 2. Réglages (durée, ton, angle) | marche en réel et en simulé | tous | compris dans l'écriture |
| 3. Style personnel | marche en réel ; en simulé, analyse simple sans IA (signalée) | Pro, Pro+ | analyses : 5 / jour (Pro), 20 (Pro+) |
| 4. Script complet + mention commerciale | marche en réel et en simulé | tous | écritures du jour |
| 5. Série de 20 vidéos | marche en réel et en simulé (angles simulés signalés) | Pro, Pro+ | `anglesSeriesPerDay` : 3 / 20 ; chaque angle écrit = 1 écriture |
| 6. Édition fine : ligne, raccourcir, plus percutant | marche en réel et en simulé | tous | retouches par génération : 5 / 20 / 60 |
| 6. Édition fine : traduction DE, IT, ES | marche en réel ; en simulé, texte français marqué (signalé) | Pro+ | compte comme une retouche |
| 7. Téléprompteur | marche (aucune donnée nécessaire) | tous | — |
| 8. Notation réutilisée | marche en réel et en simulé | tous | — |
| 9. Historique et favoris | marche | tous | — |
| 9. Export texte et PDF | marche | Pro+ | — |

Tests : `tests/unit/studio*.test.ts` (7 fichiers, au moins un test par point).
