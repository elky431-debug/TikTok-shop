'use client';

import {
  ArrowLeft,
  Baby,
  Check,
  Dumbbell,
  Hand,
  Mic,
  PawPrint,
  Shirt,
  Smartphone,
  Sofa,
  Sparkles,
  SplitSquareHorizontal,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { LogoMark } from '@/components/brand/logo';
import { ButtonArrow, buttonClasses } from '@/components/ui/button';
import { NICHES, type NicheId } from '@/lib/niches';
import {
  MAX_NICHES,
  OPTIONAL_STEPS,
  stepError,
  type OnboardingAnswers,
  type OnboardingStep,
} from '@/lib/onboarding-steps';
import {
  AFFILIATE_STATUSES,
  AFFILIATE_THRESHOLD,
  EXPERIENCE_LEVELS,
  FOLLOWER_RANGES,
  VIDEO_STYLES,
  VIDEOS_PER_WEEK,
  type VideoStyleId,
} from '@/lib/profile-rules';
import type { FollowerRange } from '@/lib/db/types';
import { cn, formatCompact, formatInt } from '@/lib/utils';
import { completeOnboardingAction, previewCreatorAction, type CreatorPreview } from './actions';

const NICHE_ICONS: Record<NicheId, LucideIcon> = {
  beaute: Sparkles,
  maison: Sofa,
  mode: Shirt,
  tech: Smartphone,
  sport: Dumbbell,
  animaux: PawPrint,
  bebe: Baby,
};

const STYLE_ICONS: Record<VideoStyleId, LucideIcon> = {
  face_camera: Video,
  voix_off: Mic,
  mains: Hand,
  avant_apres: SplitSquareHorizontal,
};

const GOAL_PRESETS = [100, 300, 500, 1000, 2000];

/** Tranche proposée à partir d'un nombre exact d'abonnés (aperçu du compte). */
function rangeFor(followers: number): FollowerRange {
  if (followers < 1000) return '0-1000';
  if (followers < 5000) return '1000-5000';
  if (followers < 20000) return '5000-20000';
  if (followers < 100000) return '20000-100000';
  return '100000+';
}

const STORAGE_KEY = 'tracktout-onboarding';

/* Carte cliquable : grande, bordée, cochée en cyan (style des cartes d'EtSmart). */
function OptionCard({
  selected,
  onSelect,
  role,
  disabled,
  children,
  hint,
  icon: Icon,
  compact,
  bare,
}: {
  selected: boolean;
  onSelect: (byPointer: boolean) => void;
  role: 'radio' | 'checkbox';
  disabled?: boolean;
  children: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  compact?: boolean;
  /** Sans pastille de coche (montants) : le contour cyan suffit. */
  bare?: boolean;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      onClick={(e) => {
        if (disabled) return;
        onSelect(e.detail > 0);
      }}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-2xl border text-left transition-all duration-200 active:scale-[0.99]',
        compact ? 'px-3.5 py-3' : 'px-4 py-4',
        selected
          ? 'border-cyan-ink/60 bg-cyan-ink/[0.07] shadow-[0_0_40px_-12px_rgb(var(--cyan)/0.35)]'
          : 'border-line bg-bg hover:border-line-strong hover:bg-fg/[0.03]',
        disabled && 'cursor-not-allowed opacity-40 hover:border-line hover:bg-bg',
      )}
    >
      {Icon ? (
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors',
            selected ? 'border-cyan-ink/40 bg-cyan-ink/15 text-cyan-ink' : 'border-fg/12 bg-fg/[0.04] text-muted',
          )}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate font-semibold leading-snug', bare && 'whitespace-nowrap text-center')}>{children}</span>
        {hint ? <span className="mt-0.5 block text-sm leading-snug text-muted">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          bare && 'hidden',
          'flex h-5 w-5 shrink-0 items-center justify-center border-2 transition-colors',
          role === 'radio' ? 'rounded-full' : 'rounded-md',
          selected ? 'border-cyan-ink bg-cyan-ink text-bg' : 'border-fg/25',
        )}
      >
        {selected ? <Check className="h-3 w-3" strokeWidth={3.5} /> : null}
      </span>
    </button>
  );
}

const QUESTIONS: Record<OnboardingStep, { title: string; hint?: string }> = {
  prenom: { title: 'Salut ! Comment tu t’appelles ?', hint: 'On l’utilise dans ton récap du matin.' },
  pseudo: { title: 'Ton pseudo TikTok ?', hint: 'Pour afficher les chiffres publics de ton compte. On ne se connecte jamais à ton compte TikTok.' },
  abonnes: { title: 'Combien d’abonnés as-tu ?', hint: 'Ton score « pour toi » s’adapte à la taille de ton compte.' },
  affilie: { title: 'Tu es déjà affilié TikTok Shop ?', hint: `Il faut environ ${formatInt(AFFILIATE_THRESHOLD)} abonnés pour vendre en affiliation.` },
  niveau: { title: 'Où en es-tu ?', hint: 'Pour te proposer des produits à ta mesure.' },
  niches: { title: 'Tes niches', hint: `Jusqu’à ${MAX_NICHES}. Ton radar ne gardera que ces produits-là.` },
  rythme: { title: 'Combien de vidéos par semaine ?', hint: 'On en fait ton objectif de la semaine et le rythme de ton plan de publication.' },
  styles: { title: 'Comment tu filmes ?', hint: 'Plusieurs choix possibles. Tes scripts seront écrits pour ces styles.' },
  objectif: {
    title: 'Ton objectif de gains par mois ?',
    hint: 'Un repère personnel pour te motiver, pas une promesse : tes gains dépendent de tes vidéos et des produits.',
  },
  code: { title: 'Un code formateur ?', hint: 'Ton formateur t’a donné un code ? Il t’offre 3 mois de Pro.' },
};

export function OnboardingFlow({
  steps,
  initial,
  update,
  previewAvailable,
  coachCode,
}: {
  steps: OnboardingStep[];
  initial: OnboardingAnswers;
  update: boolean;
  previewAvailable: boolean;
  /** Code formateur déjà enregistré (lien d'invitation) : la dernière question le confirme. */
  coachCode: string | null;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<OnboardingAnswers>(initial);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [preview, setPreview] = useState<CreatorPreview | null>(null);
  const [previewing, startPreview] = useTransition();
  const [goalOther, setGoalOther] = useState(initial.monthly_goal_euros !== null && !GOAL_PRESETS.includes(initial.monthly_goal_euros));
  const restored = useRef(false);
  // Passage automatique en attente après un choix au doigt : annulé si la personne navigue autrement entre-temps.
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelAdvance = () => {
    if (advance.current) clearTimeout(advance.current);
    advance.current = null;
  };
  const step = steps[index];
  const last = index === steps.length - 1;
  const optional = OPTIONAL_STEPS.has(step);

  // Reprise après un rechargement (cet onglet seulement).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as { answers: OnboardingAnswers; index: number; update: boolean } | null;
      if (saved && saved.update === update && saved.index < steps.length) {
        setAnswers({ ...initial, ...saved.answers });
        setIndex(saved.index);
      }
    } catch {
      /* stockage indisponible : on repart du début */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ answers, index, update }));
    } catch {
      /* stockage indisponible */
    }
  }, [answers, index, update]);

  const set = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    setError(null);
  };

  const go = (to: number) => {
    cancelAdvance();
    setDirection(to > index ? 1 : -1);
    setError(null);
    setIndex(to);
  };

  const finish = async (final: OnboardingAnswers) => {
    setPreparing(true);
    const started = Date.now();
    const result = await completeOnboardingAction(final, update);
    if (!result.ok) {
      setPreparing(false);
      const at = steps.indexOf(result.step);
      if (at >= 0) go(at);
      setError(result.message);
      return;
    }
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* rien */
    }
    // L'écran « On prépare ton radar » reste au moins 2,4 s : le temps de lire ce qui se prépare.
    const wait = Math.max(0, 2400 - (Date.now() - started));
    setTimeout(() => router.replace(result.redirect), update ? 0 : wait);
  };

  const next = (override?: Partial<OnboardingAnswers>) => {
    cancelAdvance();
    const current = { ...answers, ...override };
    const message = stepError(step, current);
    if (message) {
      setError(message);
      return;
    }
    if (last) {
      void finish(current);
      return;
    }
    go(index + 1);
  };

  const skip = () => {
    cancelAdvance();
    const cleared: Partial<OnboardingAnswers> =
      step === 'pseudo' ? { tiktok_handle: '' } : step === 'objectif' ? { monthly_goal_euros: null } : step === 'code' ? { code: '' } : {};
    setAnswers((a) => ({ ...a, ...cleared }));
    if (last) void finish({ ...answers, ...cleared });
    else go(index + 1);
  };

  /** Choix unique : au doigt ou à la souris, on passe à la question suivante après un court instant. */
  const choose = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K], byPointer: boolean) => {
    set(key, value);
    cancelAdvance();
    if (byPointer) advance.current = setTimeout(() => next({ [key]: value } as Partial<OnboardingAnswers>), 220);
  };

  const toggle = <T extends string>(list: T[], value: T, max?: number): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : max && list.length >= max ? list : [...list, value];

  const preparation = answers.affiliate_status === 'pas_encore' || answers.follower_range === '0-1000';
  const progress = preparing ? 1 : (index + 1) / (steps.length + 1);
  const titleId = `question-${step}`;

  const renderBody = () => {
    switch (step) {
      case 'prenom':
        return (
          <div>
            <label htmlFor="prenom" className="sr-only">
              Ton prénom
            </label>
            <input
              id="prenom"
              autoFocus
              autoComplete="given-name"
              maxLength={60}
              value={answers.first_name}
              onChange={(e) => set('first_name', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && next()}
              placeholder="Ton prénom"
              className="w-full rounded-xl border border-line-strong bg-bg px-4 py-4 text-lg text-fg placeholder:text-subtle transition-all focus:border-cyan-ink/45 focus:outline-none focus:ring-1 focus:ring-cyan-ink/25"
            />
          </div>
        );
      case 'pseudo':
        return (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <label htmlFor="pseudo" className="sr-only">
                  Ton pseudo TikTok
                </label>
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted" aria-hidden="true">
                  @
                </span>
                <input
                  id="pseudo"
                  autoFocus
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={40}
                  value={answers.tiktok_handle}
                  onChange={(e) => {
                    set('tiktok_handle', e.target.value.replace(/^@+/, ''));
                    setPreview(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && next()}
                  placeholder="ton.pseudo"
                  className="w-full rounded-xl border border-line-strong bg-bg py-4 pl-9 pr-4 text-lg text-fg placeholder:text-subtle transition-all focus:border-cyan-ink/45 focus:outline-none focus:ring-1 focus:ring-cyan-ink/25"
                />
              </div>
              {previewAvailable ? (
                <button
                  type="button"
                  disabled={previewing || !answers.tiktok_handle.trim()}
                  onClick={() =>
                    startPreview(async () => {
                      const result = await previewCreatorAction(answers.tiktok_handle);
                      setPreview(result);
                      if (result.ok && result.followers !== null) set('follower_range', rangeFor(result.followers));
                    })
                  }
                  className="shrink-0 rounded-xl border border-fg/20 px-4 text-sm font-semibold transition-all hover:border-cyan-ink/45 hover:bg-cyan-ink/10 hover:text-cyan-ink disabled:opacity-50"
                >
                  {previewing ? 'Recherche…' : 'Voir mon compte'}
                </button>
              ) : null}
            </div>
            <div aria-live="polite">
              {preview?.ok ? (
                <div className="flex items-center gap-4 rounded-2xl border border-line bg-bg p-4">
                  <span className="rounded-full bg-[image:var(--gradient-diag)] p-[2px]" aria-hidden="true">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-bg font-bold">
                      {(preview.nickname ?? preview.handle).charAt(0).toUpperCase()}
                    </span>
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{preview.nickname ?? `@${preview.handle}`}</p>
                    <p className="text-sm text-muted">
                      {preview.followers !== null ? `${formatCompact(preview.followers)} abonnés` : 'Abonnés non communiqués'}
                      {preview.likes !== null ? ` · ${formatCompact(preview.likes)} j’aime` : ''}
                      {preview.videos !== null ? ` · ${formatInt(preview.videos)} vidéos` : ''}
                    </p>
                  </div>
                </div>
              ) : preview ? (
                <p className="text-sm text-muted">{preview.message}</p>
              ) : null}
            </div>
          </div>
        );
      case 'abonnes':
        return (
          <div role="radiogroup" aria-labelledby={titleId} className="grid gap-2.5">
            {FOLLOWER_RANGES.map((r) => (
              <OptionCard key={r.id} role="radio" compact selected={answers.follower_range === r.id} onSelect={(p) => choose('follower_range', r.id, p)}>
                {r.label}
              </OptionCard>
            ))}
          </div>
        );
      case 'affilie':
        return (
          <div className="space-y-4">
            <div role="radiogroup" aria-labelledby={titleId} className="grid gap-2.5">
              {AFFILIATE_STATUSES.map((s) => (
                <OptionCard key={s.id} role="radio" selected={answers.affiliate_status === s.id} onSelect={(p) => choose('affiliate_status', s.id, p && s.id !== 'pas_encore')}>
                  {s.label}
                </OptionCard>
              ))}
            </div>
            {preparation && answers.affiliate_status ? (
              <p className="rounded-2xl border border-cyan-ink/25 bg-cyan-ink/[0.06] p-4 text-sm leading-relaxed" role="status">
                <span className="font-semibold">Tu démarres en mode préparation.</span> Tu vois déjà les produits qui montent, tu
                t’entraînes avec les scripts et on t’aide à passer le cap des {formatInt(AFFILIATE_THRESHOLD)} abonnés.
              </p>
            ) : null}
          </div>
        );
      case 'niveau':
        return (
          <div role="radiogroup" aria-labelledby={titleId} className="grid gap-2.5">
            {EXPERIENCE_LEVELS.map((l) => (
              <OptionCard key={l.id} role="radio" hint={l.hint} selected={answers.experience_level === l.id} onSelect={(p) => choose('experience_level', l.id, p)}>
                {l.label}
              </OptionCard>
            ))}
          </div>
        );
      case 'niches': {
        const full = answers.niches.length >= MAX_NICHES;
        return (
          <div>
            <div role="group" aria-labelledby={titleId} className="grid grid-cols-2 gap-2.5">
              {NICHES.map((n) => {
                const selected = answers.niches.includes(n.id);
                return (
                  <OptionCard
                    key={n.id}
                    role="checkbox"
                    compact
                    icon={NICHE_ICONS[n.id]}
                    selected={selected}
                    disabled={full && !selected}
                    onSelect={() => set('niches', toggle(answers.niches, n.id, MAX_NICHES))}
                  >
                    {n.short}
                  </OptionCard>
                );
              })}
            </div>
            <p className={cn('mt-3 text-sm', full ? 'text-fg' : 'text-muted')} aria-live="polite">
              {full ? `${MAX_NICHES} niches choisies : retire-en une pour en prendre une autre.` : `${answers.niches.length} sur ${MAX_NICHES}`}
            </p>
          </div>
        );
      }
      case 'rythme':
        return (
          <div role="radiogroup" aria-labelledby={titleId} className="grid gap-2.5">
            {VIDEOS_PER_WEEK.map((v) => (
              <OptionCard
                key={v.id}
                role="radio"
                hint={`Objectif de ${v.weekly} vidéos par semaine, plan de publication sur ${v.rhythm} jours.`}
                selected={answers.videos_per_week === v.id}
                onSelect={(p) => choose('videos_per_week', v.id, p)}
              >
                {v.label}
              </OptionCard>
            ))}
          </div>
        );
      case 'styles':
        return (
          <div role="group" aria-labelledby={titleId} className="grid gap-2.5 sm:grid-cols-2">
            {VIDEO_STYLES.map((s) => (
              <OptionCard
                key={s.id}
                role="checkbox"
                compact
                icon={STYLE_ICONS[s.id]}
                hint={s.hint}
                selected={answers.video_styles.includes(s.id)}
                onSelect={() => set('video_styles', toggle(answers.video_styles, s.id))}
              >
                {s.label}
              </OptionCard>
            ))}
          </div>
        );
      case 'objectif':
        return (
          <div className="space-y-4">
            <div role="radiogroup" aria-labelledby={titleId} className="grid grid-cols-3 gap-2.5">
              {GOAL_PRESETS.map((g) => (
                <OptionCard
                  key={g}
                  role="radio"
                  compact
                  bare
                  selected={!goalOther && answers.monthly_goal_euros === g}
                  onSelect={(p) => {
                    setGoalOther(false);
                    choose('monthly_goal_euros', g, p);
                  }}
                >
                  {formatInt(g)} €
                </OptionCard>
              ))}
              <OptionCard role="radio" compact bare selected={goalOther} onSelect={() => setGoalOther(true)}>
                Autre
              </OptionCard>
            </div>
            {goalOther ? (
              <div className="relative">
                <label htmlFor="objectif" className="sr-only">
                  Montant par mois, en euros
                </label>
                <input
                  id="objectif"
                  autoFocus
                  inputMode="numeric"
                  value={answers.monthly_goal_euros ?? ''}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                    set('monthly_goal_euros', digits ? Number(digits) : null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && next()}
                  placeholder="Montant"
                  className="w-full rounded-xl border border-line-strong bg-bg py-4 pl-4 pr-20 text-lg text-fg placeholder:text-subtle transition-all focus:border-cyan-ink/45 focus:outline-none focus:ring-1 focus:ring-cyan-ink/25"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted">€ / mois</span>
              </div>
            ) : null}
          </div>
        );
      case 'code':
        return coachCode ? (
          <p className="rounded-2xl border border-gain/30 bg-gain/10 p-4 text-sm leading-relaxed">
            <span className="font-semibold">Code {coachCode} enregistré.</span> Tes 3 mois de Pro offerts démarrent dès que tu
            valides.
          </p>
        ) : (
          <div>
            <label htmlFor="code" className="sr-only">
              Code formateur
            </label>
            <input
              id="code"
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={24}
              value={answers.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && next()}
              placeholder="EX. DEMO30"
              className="w-full rounded-xl border border-line-strong bg-bg px-4 py-4 text-lg uppercase tracking-wide text-fg placeholder:text-subtle transition-all focus:border-cyan-ink/45 focus:outline-none focus:ring-1 focus:ring-cyan-ink/25"
            />
          </div>
        );
    }
  };

  if (preparing) return <Preparing answers={answers} update={update} />;

  const primaryLabel = last ? (update ? 'Enregistrer mes réponses' : 'Préparer mon radar') : 'Continuer';

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="px-4 pt-4 sm:px-8 sm:pt-6">
        <div className="mx-auto flex h-10 w-full max-w-xl items-center justify-between">
          {index > 0 ? (
            <button
              type="button"
              onClick={() => go(index - 1)}
              className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-fg/5 hover:text-fg"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Retour
            </button>
          ) : (
            <LogoMark size={28} />
          )}
          <span className="text-xs font-semibold tabular-nums text-muted">
            Question {index + 1} sur {steps.length}
          </span>
        </div>
        <div
          className="mx-auto mt-3 h-1.5 w-full max-w-xl overflow-hidden rounded-full bg-fg/10"
          role="progressbar"
          aria-label="Progression"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
        >
          <motion.div className="h-full rounded-full bg-[image:var(--gradient)]" initial={false} animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
        </div>
      </header>

      <main id="contenu" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 sm:px-8">
        <div className="mx-auto w-full max-w-xl flex-1 pb-4 pt-6 sm:pt-12">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.section
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: 24 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 * direction }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {optional ? <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Facultatif</p> : null}
              <h1 id={titleId} className="text-2xl font-bold tracking-tight sm:text-3xl">
                {step === 'prenom' && update ? 'Quelques nouvelles questions' : QUESTIONS[step].title}
              </h1>
              {QUESTIONS[step].hint ? <p className="mt-2 text-sm leading-relaxed text-muted">{QUESTIONS[step].hint}</p> : null}
              <div className="mt-6">{renderBody()}</div>
            </motion.section>
          </AnimatePresence>
        </div>
      </main>

      <footer className="border-t border-line bg-bg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-8">
        <div className="mx-auto w-full max-w-xl">
          {error ? (
            <p className="mb-2 text-sm font-medium text-rose-ink" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            {optional ? (
              <button type="button" onClick={skip} className="h-12 rounded-xl px-5 text-sm font-semibold text-muted transition-colors hover:bg-fg/5 hover:text-fg">
                Passer
              </button>
            ) : null}
            <button type="button" onClick={() => next()} className={buttonClasses('primary', 'lg', 'flex-1')}>
              {primaryLabel}
              <ButtonArrow />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** « On prépare ton radar » : ce qui se règle, ligne après ligne, pendant l'enregistrement. */
function Preparing({ answers, update }: { answers: OnboardingAnswers; update: boolean }) {
  const niches = NICHES.filter((n) => answers.niches.includes(n.id)).map((n) => n.short.toLowerCase());
  const weekly = VIDEOS_PER_WEEK.find((v) => v.id === answers.videos_per_week)?.weekly;
  const lines = [
    niches.length ? `Tes niches : ${niches.join(', ')}` : 'Tes niches',
    'Ton score « pour toi » calculé',
    weekly ? `Ton objectif : ${weekly} vidéos par semaine` : 'Ton objectif de la semaine',
    'Ton produit du jour choisi',
  ];
  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-bg px-6 text-center" role="status" aria-live="polite">
      <motion.div
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        className="rounded-3xl p-5 shadow-[0_0_60px_-10px_rgb(var(--cyan)/0.45)]"
      >
        <LogoMark size={56} />
      </motion.div>
      <h1 className="mt-8 text-2xl font-bold tracking-tight sm:text-3xl">
        {update ? 'On enregistre tes réponses' : <>On prépare <span className="text-gradient">ton radar</span></>}
      </h1>
      <ul className="mt-8 space-y-3 text-left">
        {lines.map((line, i) => (
          <motion.li
            key={line}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + i * 0.45, duration: 0.3 }}
            className="flex items-center gap-3 text-sm"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-ink/15 text-cyan-ink" aria-hidden="true">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
            {line}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
