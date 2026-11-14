import { ArrowLeft, Flag, Lock } from 'lucide-react';
import Link from 'next/link';
import { addCommissionAction, closeLaunchAction, saveResultsAction } from '@/app/app/lancer/actions';
import { LinkButton } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card } from '@/components/ui/surface';
import type { Profile } from '@/lib/db/types';
import { getPlan } from '@/lib/plans';
import { formatCompact, formatEuros, formatInt, formatLongDate, parisDate } from '@/lib/utils';
import { launchAdvice, launchHref } from '@/lib/v2/launch';
import type { LaunchPageData } from '@/lib/v2/launch-view';
import { StepFrame } from '../step-frame';

const inputClass =
  'num h-10 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-fg focus:border-cyan-ink/45 focus:outline-none focus:ring-1 focus:ring-cyan-ink/25';

/**
 * Étape 7 : vues, ventes et commissions par vidéo (saisies ou importées), le gain total du produit, et un conseil
 * honnête : continuer à poster, ou passer à un autre produit si les ventes ne suivent pas. Puis terminer ou abandonner.
 */
export function ResultsStep({ data, profile, searchParams }: { data: LaunchPageData; profile: Pick<Profile, 'plan'>; searchParams: Record<string, string | undefined> }) {
  const { launch, board } = data;
  const canEarnings = getPlan(profile.plan).earnings;
  const items = board?.data.items ?? [];
  const posted = items.filter((i) => i.status === 'poste').sort((a, b) => a.n - b.n);
  const views = posted.reduce((s, i) => s + (i.views ?? 0), 0);
  const sales = posted.reduce((s, i) => s + (i.sales ?? 0), 0);
  const advice = launchAdvice({ posted: posted.length, goal: items.length || 20, sales });
  const closed = launch.data.state !== 'en_cours';

  return (
    <StepFrame step="resultats" sentence="Ce que rapportent tes vidéos sur ce produit, et ce qu’il vaut mieux faire maintenant.">
      {searchParams.ok === 'chiffres' ? <Callout tone="gain" className="mb-6" title="Chiffres enregistrés." /> : null}
      {searchParams.ok === 'commission' ? <Callout tone="gain" className="mb-6" title="Commission ajoutée." /> : null}
      {searchParams.erreur === 'montant' ? <Callout tone="rose" className="mb-6" title="Indique un montant en euros, par exemple 12,50." /> : null}

      <dl className="mb-6 flex flex-wrap gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {[
          { label: 'Vidéos en ligne', value: `${posted.length} / ${items.length || 20}` },
          { label: 'Vues', value: views ? formatCompact(views) : '—' },
          { label: 'Ventes', value: sales ? formatInt(sales) : '—' },
          { label: 'Commissions', value: canEarnings ? (data.earningsCents ? formatEuros(data.earningsCents) : '—') : null },
        ].map((item) => (
          <div key={item.label} className="flex-[1_1_9rem] bg-raised p-4">
            <dt className="text-xs text-muted">{item.label}</dt>
            <dd className="num mt-1 text-2xl font-semibold">
              {item.value ?? (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-muted">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Avec Pro
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <Callout tone={advice.tone} className="mb-8" title={advice.title}>
        {advice.text}
      </Callout>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="par-video" className="min-w-0">
          <h2 id="par-video" className="mb-3 text-lg">
            Par vidéo
          </h2>
          {posted.length ? (
            <ul className="space-y-2">
              {posted.map((item) => (
                <li key={item.n} id={`resultat-${item.n}`} className="scroll-mt-24 rounded-2xl border border-line bg-raised p-3">
                  <form action={saveResultsAction}>
                    <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto]">
                      <input type="hidden" name="id" value={launch.id} />
                      <input type="hidden" name="n" value={item.n} />
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <p className="font-semibold">Vidéo n°{item.n}</p>
                        <p className="truncate text-xs text-muted">
                          {item.posted_at ? formatLongDate(item.posted_at) : ''}
                          {item.url ? (
                            <>
                              {' · '}
                              <a href={item.url} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-fg">
                                Voir sur TikTok
                              </a>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <label className="text-xs font-semibold text-muted">
                        Vues
                        <input name="vues" inputMode="numeric" defaultValue={item.views ?? ''} className={`${inputClass} mt-1`} />
                      </label>
                      <label className="text-xs font-semibold text-muted">
                        Ventes
                        <input name="ventes" inputMode="numeric" defaultValue={item.sales ?? ''} className={`${inputClass} mt-1`} />
                      </label>
                      <SubmitButton variant="outline" size="sm" className="col-span-2 h-10 sm:col-span-1" pendingLabel="…">
                        Enregistrer
                      </SubmitButton>
                    </div>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-line bg-raised p-4 text-sm text-muted">
              Pas encore de vidéo en ligne :{' '}
              <Link href={launchHref(launch.id, 'publier')} className="font-semibold text-fg underline underline-offset-2">
                colle le lien de ta première vidéo
              </Link>
              .
            </p>
          )}
        </section>

        <Card className="sm:p-5">
          <h2 className="text-lg">Commissions</h2>
          {canEarnings ? (
            <>
              <p className="mt-1 text-sm text-muted">
                Note ce que TikTok Shop te verse pour ce produit, ou{' '}
                <Link href="/app?onglet=commissions#gestion" className="font-semibold text-fg underline underline-offset-2">
                  importe ton relevé
                </Link>
                .
              </p>
              <form action={addCommissionAction} className="mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <input type="hidden" name="id" value={launch.id} />
                  <label className="text-xs font-semibold text-muted">
                    Montant (€)
                    <input name="montant" inputMode="decimal" required placeholder="12,50" className={`${inputClass} mt-1`} />
                  </label>
                  <label className="text-xs font-semibold text-muted">
                    Date
                    <input name="date" type="date" max={parisDate()} defaultValue={parisDate()} className={`${inputClass} mt-1`} />
                  </label>
                  <SubmitButton size="sm" className="col-span-2 h-10" pendingLabel="Ajout…">
                    Ajouter la commission
                  </SubmitButton>
                </div>
              </form>
            </>
          ) : (
            <div className="mt-2 space-y-3 text-sm text-muted">
              <p>Le suivi des commissions et l’import de ton relevé sont inclus à partir du plan Pro.</p>
              <LinkButton href="/app/passer-pro" variant="outline" size="sm">
                Passer à Pro
              </LinkButton>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-10 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={launchHref(launch.id, 'publier')}
          className="inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-fg/5 hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Étape précédente
        </Link>
        {closed ? null : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <form action={closeLaunchAction}>
              <input type="hidden" name="id" value={launch.id} />
              <input type="hidden" name="etat" value="abandonne" />
              <SubmitButton variant="ghost" size="lg" className="w-full" pendingLabel="…">
                Abandonner ce lancement
              </SubmitButton>
            </form>
            <form action={closeLaunchAction}>
              <input type="hidden" name="id" value={launch.id} />
              <input type="hidden" name="etat" value="termine" />
              <SubmitButton size="lg" className="w-full sm:min-w-[16rem]" pendingLabel="…">
                <Flag className="h-5 w-5" aria-hidden="true" />
                Marquer terminé
              </SubmitButton>
            </form>
          </div>
        )}
      </div>
    </StepFrame>
  );
}
