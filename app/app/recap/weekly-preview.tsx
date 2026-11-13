import { Flame, Trophy } from 'lucide-react';
import Link from 'next/link';
import { Card, Panel, ProgressBar } from '@/components/ui/surface';
import type { WeeklyRecapContent } from '@/lib/digest/weekly';
import { cn, formatDayMonth, formatEuros, plural } from '@/lib/utils';

const DAY_NAMES = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

/** Aperçu du récap du dimanche (semaine en cours, chiffres du moment). */
export function WeeklyPreview({ content }: { content: WeeklyRecapContent }) {
  const diff = content.videos.total - content.videos.previous_week;
  return (
    <Card className="sm:p-6">
      <p className="text-sm text-muted">
        Semaine du {formatDayMonth(content.week_start)} au {formatDayMonth(content.week_end)}
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-muted">Vidéos postées</dt>
          <dd className="num text-2xl font-bold">{content.videos.total}</dd>
          <dd className="text-xs text-muted">
            {diff === 0 ? 'comme la semaine dernière' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} vs semaine dernière`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Série en cours</dt>
          <dd className="num flex items-center gap-1 text-2xl font-bold">
            {content.streak.current > 0 ? <Flame className="h-5 w-5 text-rose" aria-hidden="true" /> : null}
            {plural(content.streak.current, 'jour')}
          </dd>
          {content.streak.best > content.streak.current ? <dd className="text-xs text-muted">record : {plural(content.streak.best, 'jour')}</dd> : null}
        </div>
        <div>
          <dt className="text-xs text-muted">Gains saisis</dt>
          <dd className="num text-2xl font-bold">{content.gains ? formatEuros(content.gains.cents) : '—'}</dd>
          <dd className="text-xs text-muted">
            {content.gains ? (
              <Link href="/app/gains" className="underline underline-offset-2">
                {plural(content.gains.entries, 'ligne')}
              </Link>
            ) : (
              'avec le plan Pro'
            )}
          </dd>
        </div>
      </dl>

      <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label="Vidéos postées par jour">
        {content.videos.by_day.map((d, i) => (
          <li key={d.date} className="text-center">
            <span
              className={cn(
                'num flex h-9 items-center justify-center rounded-lg text-sm font-semibold',
                d.count > 0 ? 'bg-cyan-soft text-cyan-ink' : 'bg-surface text-subtle',
              )}
            >
              {d.count > 0 ? d.count : '·'}
            </span>
            <span className="mt-1 block text-[11px] text-muted">
              {DAY_NAMES[i]}
              <span className="sr-only"> : {plural(d.count, 'vidéo')}</span>
            </span>
          </li>
        ))}
      </ol>

      {content.best_product ? (
        <Panel className="mt-5 flex items-start gap-3">
          <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden="true" />
          <div>
            <p className="text-sm text-muted">Meilleur produit de la semaine</p>
            <p className="font-semibold leading-snug">
              {content.best_product.product_id ? (
                <Link href={`/app/produit/${content.best_product.product_id}`} className="hover:underline">
                  {content.best_product.name}
                </Link>
              ) : (
                content.best_product.name
              )}
            </p>
            <p className="text-sm">{content.best_product.detail}</p>
          </div>
        </Panel>
      ) : null}

      {content.goals.length ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-semibold">Objectif 20 vidéos par produit</p>
          {content.goals.map((g) => (
            <div key={g.product_id}>
              <p className="num flex justify-between gap-3 text-sm">
                <span className="truncate">{g.name}</span>
                <span className="shrink-0 font-semibold">
                  {g.posted} / {g.goal}
                </span>
              </p>
              <ProgressBar value={g.posted} max={g.goal} label={`${g.name} : ${g.posted} vidéos sur ${g.goal}`} className="mt-1" />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted">
          Suis un produit pour voir ta progression vers les 20 vidéos :{' '}
          <Link href="/app/radar" className="font-semibold text-fg underline underline-offset-2">
            choisis-le dans le radar
          </Link>
          .
        </p>
      )}

      {content.next_week_planned !== null ? (
        <p className="mt-4 text-sm">
          La semaine prochaine : {plural(content.next_week_planned, 'vidéo prévue', 'vidéos prévues')} dans{' '}
          <Link href="/app/plan" className="font-semibold underline underline-offset-2">
            ton plan
          </Link>
          .
        </p>
      ) : null}
      <p className="mt-4 text-xs text-muted">
        Vidéos relevées dans « Mes produits » et ton plan, gains tels que tu les as saisis : rien n’est estimé.
      </p>
    </Card>
  );
}
