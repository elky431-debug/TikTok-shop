import type { Metadata } from 'next';
import { Bell, CalendarCheck, ExternalLink, Mail, MessageCircle, Target, TrendingDown, Zap } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { TrendBadge } from '@/components/product/bits';
import { ScoreValue } from '@/components/product/score';
import { CopyButton } from '@/components/ui/copy-button';
import { ChoiceChip, Label, Select } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, PageHeader, Panel } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import type { DigestNotice } from '@/lib/digest/personal';
import { getRecapSettings, SUNDAY_HOURS } from '@/lib/digest/settings';
import { getTodayDigest } from '@/lib/digest/today';
import { buildWeeklyRecap } from '@/lib/digest/weekly';
import { DISCORD_CODE_TTL_MINUTES } from '@/lib/discord';
import { env, isResendConfigured } from '@/lib/env';
import { nicheShort } from '@/lib/niches';
import { getPlan } from '@/lib/plans';
import { DIGEST_HOURS } from '@/lib/profile-rules';
import { formatEuros, formatLongDate, quote } from '@/lib/utils';
import { isPushConfigured } from '@/lib/webpush/config';
import { listPushSubscriptions } from '@/lib/webpush/subscriptions';
import {
  createDiscordCodeAction,
  saveDigestSettingsAction,
  saveSundaySettingsAction,
  sendTestDigestAction,
  sendTestWeeklyAction,
  unlinkDiscordAction,
} from './actions';
import { WeeklyPreview } from './weekly-preview';
import { shortLabel } from '@/lib/product-name';

export const metadata: Metadata = { title: 'Récap' };

const MESSAGES: Record<string, { tone: 'gain' | 'rose'; text: string }> = {
  'ok=reglages': { tone: 'gain', text: 'Réglages du récap du matin enregistrés.' },
  'ok=dimanche': { tone: 'gain', text: 'Réglages du récap du dimanche enregistrés.' },
  'ok=delie': { tone: 'gain', text: 'Compte Discord délié.' },
  'ok=envoye': { tone: 'gain', text: 'Récap envoyé : regarde ta boîte mail.' },
  'ok=dimanche-envoye': { tone: 'gain', text: 'Récap de la semaine envoyé : regarde ta boîte mail.' },
  'erreur=envoi': { tone: 'rose', text: 'L’e-mail n’a pas pu partir. Vérifie la configuration de Resend, puis réessaie.' },
};

function Notices({ title, icon, items, total }: { title: string; icon: ReactNode; items: DigestNotice[]; total: number }) {
  if (!items.length) return null;
  return (
    <div className="mt-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((n, i) => (
          <li key={i}>
            <Link href={n.path} className="font-semibold hover:underline hover:underline-offset-4">
              {n.title}
            </Link>
            {n.body ? <span className="text-muted"> · {n.body}</span> : null}
          </li>
        ))}
      </ul>
      {total > items.length ? (
        <Link href="/app/notifications" className="mt-1 inline-block text-sm text-muted underline underline-offset-2">
          + {total - items.length} autres dans tes notifications
        </Link>
      ) : null}
    </div>
  );
}

function ChannelChips({
  email,
  discord,
  push,
  emailAddress,
  discordState,
  pushState,
}: {
  email: boolean;
  discord: boolean;
  push: boolean;
  emailAddress: string;
  discordState: { allowed: boolean; reason: string };
  pushState: { allowed: boolean; reason: string };
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold">Où le recevoir</legend>
      <ChoiceChip name="email" value="1" defaultChecked={email} description={emailAddress}>
        <span className="inline-flex items-center gap-1.5">
          <Mail className="h-4 w-4" aria-hidden="true" /> Par e-mail
        </span>
      </ChoiceChip>
      <ChoiceChip name="discord" value="1" defaultChecked={discord && discordState.allowed} disabled={!discordState.allowed} description={discordState.reason}>
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle className="h-4 w-4" aria-hidden="true" /> Sur Discord
        </span>
      </ChoiceChip>
      <ChoiceChip name="push" value="1" defaultChecked={push && pushState.allowed} disabled={!pushState.allowed} description={pushState.reason}>
        <span className="inline-flex items-center gap-1.5">
          <Bell className="h-4 w-4" aria-hidden="true" /> En notification
        </span>
      </ChoiceChip>
    </fieldset>
  );
}

export default async function RecapPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/recap');
  const [digest, settings, devices, weekly] = await Promise.all([
    getTodayDigest(profile),
    getRecapSettings(profile),
    listPushSubscriptions(profile.id),
    buildWeeklyRecap(profile),
  ]);
  const plan = getPlan(profile.plan);
  const content = digest.content;
  const personal = content.personal;
  const message = Object.entries(searchParams)
    .map(([k, v]) => MESSAGES[`${k}=${v}`])
    .find(Boolean);
  const code = searchParams.code && /^[A-Z0-9]{6}$/.test(searchParams.code) ? searchParams.code : null;

  const discordState = !plan.discordDigest
    ? { allowed: false, reason: 'Réservé aux abonnés.' }
    : profile.discord_user_id
      ? { allowed: true, reason: 'En message privé, à l’heure choisie.' }
      : { allowed: false, reason: 'Lie d’abord ton compte Discord ci-dessous.' };
  const pushState = !isPushConfigured()
    ? { allowed: false, reason: 'Pas encore activé sur ce site.' }
    : devices.length
      ? { allowed: true, reason: `Sur ${devices.length > 1 ? `tes ${devices.length} appareils abonnés` : 'ton appareil abonné'}.` }
      : { allowed: false, reason: 'Active d’abord les notifications sur un appareil (page Notifications).' };

  return (
    <div>
      <PageHeader eyebrow="Compte"
        title="Récap"
        description={`Tes produits du jour à ${profile.digest_hour} h, ta semaine le dimanche à ${settings.dimanche.heure} h.`}
      />
      {message ? <Callout tone={message.tone} className="mb-6" title={message.text} /> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:gap-10">
        <div className="min-w-0 space-y-10">
          {/* Récap du matin */}
          <section aria-labelledby="apercu">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="apercu" className="text-lg">
                Récap du matin · {formatLongDate(content.date)}
              </h2>
              <a
                href="/app/recap/apercu-email"
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"
              >
                Voir l’e-mail
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
            <Card className="sm:p-6">
              {personal?.challenge ? (
                <Link
                  href={personal.challenge.path}
                  className="mb-5 flex items-start gap-3 rounded-xl border border-cyan-ink/40 bg-cyan-ink/[0.06] p-4 hover:border-cyan-ink/70"
                >
                  <Target className="mt-0.5 h-5 w-5 shrink-0 text-cyan-ink" aria-hidden="true" />
                  <span>
                    <span className="eyebrow block text-cyan-ink">Défi du jour</span>
                    <span className="mt-1 block text-lg font-semibold leading-snug">{personal.challenge.text}</span>
                    <span className="mt-0.5 block text-sm text-muted">{personal.challenge.detail}</span>
                  </span>
                </Link>
              ) : null}

              <ol className="divide-y divide-line">
                {content.products.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0">
                    <span className="num w-6 shrink-0 text-lg font-bold text-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/produit/${p.id}`} className="font-semibold leading-snug hover:underline hover:underline-offset-4">
                        {p.name}
                      </Link>
                      <p className="num mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="text-muted">{nicheShort(p.niche)}</span>
                        <span className="font-semibold text-gain">{formatEuros(p.commission_cents)} / vente</span>
                        <TrendBadge trend={p.trend} growth={p.growth_7d} />
                      </p>
                    </div>
                    <ScoreValue score={p.score} size="sm" showMax={false} />
                  </li>
                ))}
              </ol>
              {content.locked_count > 0 ? (
                <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
                  + {content.locked_count} autres produits avec le plan Pro.{' '}
                  <Link href="/app/passer-pro" className="font-semibold text-rose-ink hover:underline">
                    Passer à Pro
                  </Link>
                </p>
              ) : null}

              <Notices
                title="Tes alertes depuis hier"
                icon={<Zap className="h-4 w-4 text-cyan-ink" aria-hidden="true" />}
                items={personal?.alerts ?? []}
                total={personal?.alerts_total ?? 0}
              />
              <Notices
                title="Produits suivis en baisse"
                icon={<TrendingDown className="h-4 w-4 text-rose-ink" aria-hidden="true" />}
                items={personal?.drops ?? []}
                total={personal?.drops_total ?? 0}
              />

              {content.hook ? (
                <Panel className="mt-5">
                  <p className="text-sm text-muted">Accroche du jour pour {quote(shortLabel(content.hook.product_name))}</p>
                  <p className="mt-1 text-xl font-semibold leading-snug">{quote(content.hook.text)}</p>
                  <CopyButton text={content.hook.text} label="Copier l’accroche" copiedLabel="Accroche copiée" className="mt-3" />
                </Panel>
              ) : null}

              {content.script ? (
                <div className="mt-5">
                  <p className="text-sm font-semibold">Script prêt : {content.script.title}</p>
                  <ol className="mt-2 space-y-1.5 text-sm leading-relaxed">
                    {content.script.lines.map((line, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="num text-muted">{i + 1}.</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <CopyButton text={content.script.lines.join('\n')} label="Copier le script" copiedLabel="Script copié" />
                    <Link
                      href={`/app/studio?produit=${content.script.product_id}`}
                      className="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold text-muted hover:bg-surface hover:text-fg"
                    >
                      Écrire mes scripts sur ce produit
                    </Link>
                  </div>
                </div>
              ) : null}
            </Card>
          </section>

          {/* Récap du dimanche */}
          <section id="dimanche" aria-labelledby="titre-dimanche" className="scroll-mt-20">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="titre-dimanche" className="flex items-center gap-2 text-lg">
                <CalendarCheck className="h-5 w-5 text-cyan-ink" aria-hidden="true" /> Récap du dimanche · ta semaine
              </h2>
              {plan.weeklyDigest ? (
                <form action={sendTestWeeklyAction}>
                  <SubmitButton variant="ghost" size="sm" className="text-muted" pendingLabel="Envoi…">
                    M’envoyer ma semaine par e-mail
                  </SubmitButton>
                </form>
              ) : null}
            </div>
            {plan.weeklyDigest ? (
              <WeeklyPreview content={weekly} />
            ) : (
              <Card>
                <p className="text-sm text-muted">
                  Le dimanche, ta semaine en chiffres : vidéos postées, série, gains saisis et meilleur produit. Inclus à partir du plan
                  Pro.{' '}
                  <Link href="/app/passer-pro" className="font-semibold text-rose-ink hover:underline">
                    Passer à Pro
                  </Link>
                </p>
              </Card>
            )}
          </section>
        </div>

        {/* Réglages */}
        <aside className="space-y-4">
          <Card id="reglages" className="scroll-mt-20">
            <h2 className="text-lg">Récap du matin</h2>
            <form action={saveDigestSettingsAction} className="mt-4 space-y-4">
              <div>
                <Label htmlFor="heure">Heure d’envoi</Label>
                <Select id="heure" name="heure" defaultValue={String(profile.digest_hour)}>
                  {DIGEST_HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h} h 00
                    </option>
                  ))}
                </Select>
              </div>
              <ChannelChips
                email={profile.digest_email}
                discord={profile.digest_discord}
                push={settings.matin.push}
                emailAddress={profile.email}
                discordState={discordState}
                pushState={pushState}
              />
              <SubmitButton className="w-full" pendingLabel="Enregistrement…">
                Enregistrer le récap du matin
              </SubmitButton>
            </form>
            <form action={sendTestDigestAction} className="mt-2">
              <SubmitButton variant="ghost" size="sm" className="w-full text-muted" pendingLabel="Envoi…">
                M’envoyer le récap maintenant
              </SubmitButton>
            </form>
            {!isResendConfigured() ? (
              <p className="mt-1 text-center text-xs text-muted">Mode local : l’e-mail est rangé dans la boîte de test (admin).</p>
            ) : null}
          </Card>

{plan.weeklyDigest ? (
          <Card id="reglages-dimanche" className="scroll-mt-20">
            <h2 className="text-lg">Récap du dimanche</h2>
            <form action={saveSundaySettingsAction} className="mt-4 space-y-4">
              <div>
                <Label htmlFor="heure-dimanche">Heure d’envoi, le dimanche</Label>
                <Select id="heure-dimanche" name="heure" defaultValue={String(settings.dimanche.heure)}>
                  {SUNDAY_HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h} h 00
                    </option>
                  ))}
                </Select>
              </div>
              <ChannelChips
                email={settings.dimanche.email}
                discord={settings.dimanche.discord}
                push={settings.dimanche.push}
                emailAddress={profile.email}
                discordState={discordState}
                pushState={pushState}
              />
              <SubmitButton className="w-full" pendingLabel="Enregistrement…">
                Enregistrer le récap du dimanche
              </SubmitButton>
            </form>
            <p className="mt-3 text-xs text-muted">
              Chaque e-mail a un lien pour se désinscrire en un clic.{' '}
              <Link href="/app/notifications" className="underline underline-offset-2">
                Notifications sur tes appareils
              </Link>
              .
            </p>
          </Card>
          ) : null}

          <Card id="discord" className="scroll-mt-20">
            <h2 className="text-lg">Discord</h2>
            {profile.discord_user_id ? (
              <>
                <p className="mt-2 text-sm">Ton compte Discord est lié.</p>
                <form action={unlinkDiscordAction} className="mt-3">
                  <SubmitButton variant="outline" size="sm" pendingLabel="Retrait…">
                    Délier Discord
                  </SubmitButton>
                </form>
              </>
            ) : code ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm">Dans le serveur Discord, tape cette commande :</p>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2.5">
                  <code className="num text-lg font-semibold">/lier {code}</code>
                  <CopyButton text={`/lier ${code}`} size="icon" label="Copier la commande" copiedLabel="Commande copiée" />
                </div>
                <p className="text-xs text-muted">Code valable {DISCORD_CODE_TTL_MINUTES} minutes, une seule fois.</p>
              </div>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted">
                  Lie ton compte pour recevoir tes récaps en message privé{plan.discordDigest ? '' : ' (avec Pro)'} et accéder au
                  salon des membres Pro.
                </p>
                <form action={createDiscordCodeAction} className="mt-3">
                  <SubmitButton variant="outline" size="sm" pendingLabel="Création du code…">
                    Obtenir mon code Discord
                  </SubmitButton>
                </form>
              </>
            )}
            {env.discordInviteUrl ? (
              <a
                href={env.discordInviteUrl}
                target="_blank"
                rel="noopener"
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"
              >
                Rejoindre le serveur
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </Card>
        </aside>
      </div>
    </div>
  );
}
