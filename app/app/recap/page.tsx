import type { Metadata } from 'next';
import { ExternalLink, Mail, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { TrendBadge } from '@/components/product/bits';
import { ScoreValue } from '@/components/product/score';
import { CopyButton } from '@/components/ui/copy-button';
import { ChoiceChip, Label, Select } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, PageHeader, Panel } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getTodayDigest } from '@/lib/digest/today';
import { DISCORD_CODE_TTL_MINUTES } from '@/lib/discord';
import { env, isResendConfigured } from '@/lib/env';
import { nicheShort } from '@/lib/niches';
import { getPlan } from '@/lib/plans';
import { DIGEST_HOURS } from '@/lib/profile-rules';
import { formatEuros, formatLongDate, quote } from '@/lib/utils';
import { createDiscordCodeAction, saveDigestSettingsAction, sendTestDigestAction, unlinkDiscordAction } from './actions';

export const metadata: Metadata = { title: 'Récap du matin' };

const MESSAGES: Record<string, { tone: 'gain' | 'rose'; text: string }> = {
  'ok=reglages': { tone: 'gain', text: 'Réglages du récap enregistrés.' },
  'ok=delie': { tone: 'gain', text: 'Compte Discord délié.' },
  'ok=envoye': { tone: 'gain', text: 'Récap envoyé : regarde ta boîte mail.' },
  'erreur=envoi': { tone: 'rose', text: 'L’e-mail n’a pas pu partir. Vérifie la configuration de Resend, puis réessaie.' },
};

export default async function RecapPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/recap');
  const digest = await getTodayDigest(profile);
  const plan = getPlan(profile.plan);
  const content = digest.content;
  const message = Object.entries(searchParams)
    .map(([k, v]) => MESSAGES[`${k}=${v}`])
    .find(Boolean);
  const code = searchParams.code && /^[A-Z0-9]{6}$/.test(searchParams.code) ? searchParams.code : null;

  return (
    <div>
      <PageHeader
        title="Récap du matin"
        description={`Chaque matin à ${profile.digest_hour} h : tes meilleurs produits du jour et un script prêt à tourner.`}
      />
      {message ? <Callout tone={message.tone} className="mb-6" title={message.text} /> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:gap-10">
        {/* Aperçu */}
        <section aria-labelledby="apercu" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="apercu" className="text-lg">
              Aperçu du {formatLongDate(content.date)}
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
                  Passer Pro
                </Link>
              </p>
            ) : null}

            {content.hook ? (
              <Panel className="mt-5">
                <p className="text-sm text-muted">Accroche du jour pour {quote(content.hook.product_name)}</p>
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

        {/* Réglages */}
        <aside className="space-y-4">
          <Card>
            <h2 className="text-lg">Réglages</h2>
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
              <ChoiceChip name="email" value="1" defaultChecked={profile.digest_email} description={profile.email}>
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-4 w-4" aria-hidden="true" /> Par e-mail
                </span>
              </ChoiceChip>
              <ChoiceChip
                name="discord"
                value="1"
                defaultChecked={profile.digest_discord}
                disabled={!plan.discordDigest || !profile.discord_user_id}
                description={
                  !plan.discordDigest
                    ? 'Réservé au plan Pro.'
                    : profile.discord_user_id
                      ? 'En message privé, à l’heure choisie.'
                      : 'Lie d’abord ton compte Discord ci-dessous.'
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" /> Sur Discord
                </span>
              </ChoiceChip>
              <SubmitButton className="w-full" pendingLabel="Enregistrement…">
                Enregistrer les réglages
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
                  Lie ton compte pour recevoir ton récap en message privé{plan.discordDigest ? '' : ' (avec Pro)'} et accéder au
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
