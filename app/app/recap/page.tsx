import type { Metadata } from 'next';
import { render } from '@react-email/render';
import { ExternalLink, Inbox, Star } from 'lucide-react';
import Link from 'next/link';
import { createElement } from 'react';
import { MorningDigestEmail } from '@/emails/morning-digest';
import { LogoMark } from '@/components/brand/logo';
import { CopyButton } from '@/components/ui/copy-button';
import { Field, Select, SwitchRow } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { BRAND } from '@/lib/brand';
import { digestSubject } from '@/lib/digest/deliver';
import { getRecapSettings } from '@/lib/digest/settings';
import { getTodayDigest } from '@/lib/digest/today';
import { DISCORD_CODE_TTL_MINUTES } from '@/lib/discord';
import { discordStatus } from '@/lib/discord/config';
import { env } from '@/lib/env';
import { getPlan } from '@/lib/plans';
import { DIGEST_HOURS } from '@/lib/profile-rules';
import { isPushConfigured } from '@/lib/webpush/config';
import { listPushSubscriptions } from '@/lib/webpush/subscriptions';
import { createDiscordCodeAction, saveRecapAction, sendTestDigestAction, unlinkDiscordAction } from './actions';
import { EmailFrame } from './email-frame';

export const metadata: Metadata = { title: 'Récap du matin' };

const MESSAGES: Record<string, { tone: 'gain' | 'rose'; text: string }> = {
  'ok=reglages': { tone: 'gain', text: 'Réglages enregistrés.' },
  'ok=delie': { tone: 'gain', text: 'Compte Discord délié.' },
  'ok=envoye': { tone: 'gain', text: 'Exemple envoyé : regarde ta boîte mail.' },
  'erreur=envoi': { tone: 'rose', text: 'L’exemple n’a pas pu partir. Réessaie dans quelques minutes.' },
};

/** Expéditeur affiché dans l'aperçu : le nom de la marque et l'adresse d'envoi configurée (sans le nom, s'il y en a un). */
function senderAddress(): string {
  const from = env.emailFrom.trim();
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

export default async function RecapPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/recap');
  const [digest, settings, devices] = await Promise.all([getTodayDigest(profile), getRecapSettings(profile), listPushSubscriptions(profile.id)]);
  const plan = getPlan(profile.plan);
  const html = await render(createElement(MorningDigestEmail, { content: digest.content, siteUrl: env.siteUrl }));
  const message = Object.entries(searchParams)
    .map(([k, v]) => MESSAGES[`${k}=${v}`])
    .find(Boolean);
  const code = searchParams.code && /^[A-Z0-9]{6}$/.test(searchParams.code) ? searchParams.code : null;

  // Canaux en plus de l'e-mail : proposés seulement quand ils marchent vraiment (rien de « bientôt »).
  const discord = discordStatus();
  const discordLive = discord.interactions && discord.digests && plan.discordDigest;
  const pushLive = isPushConfigured() && devices.length > 0;
  const sender = senderAddress();

  return (
    <div>
      <PageHeader
        eyebrow="Compte"
        title="Ton récap du matin"
        description="Chaque matin, on t’envoie les 5 produits à vendre aujourd’hui et ton défi du jour."
      />
      {message ? <Callout tone={message.tone} className="mb-6" title={message.text} /> : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* Aperçu : l'e-mail tel qu'il part, dans une boîte de réception */}
        <section aria-labelledby="apercu" className="min-w-0">
          <h2 id="apercu" className="sr-only">
            Aperçu de l’e-mail de demain
          </h2>
          <div className="overflow-hidden rounded-2xl border border-line bg-raised shadow-sm">
            <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5 text-xs font-semibold text-muted">
              <Inbox className="h-4 w-4" aria-hidden="true" />
              Boîte de réception
              <span className="ml-auto flex gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              </span>
            </div>
            <div className="flex items-start gap-3 border-b border-line px-4 py-4 sm:px-5">
              <LogoMark size={40} className="shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-sm font-semibold">
                    {BRAND} {sender ? <span className="font-normal text-muted">&lt;{sender}&gt;</span> : null}
                  </span>
                  <span className="num text-xs text-muted">Demain, {profile.digest_hour} h 00</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">À : {profile.email}</p>
                <p className="mt-1.5 flex items-center gap-2 font-semibold leading-snug">
                  <Star className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                  <span className="min-w-0">{digestSubject(digest)}</span>
                </p>
              </div>
            </div>
            <EmailFrame html={html} title="Aperçu de l’e-mail du récap du matin" />
          </div>
          <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>Les produits changent chaque nuit : celui-ci est le récap d’aujourd’hui.</span>
            <a href="/app/recap/apercu-email" target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold hover:text-fg">
              Ouvrir l’e-mail en grand
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </p>
        </section>

        {/* Réglages essentiels */}
        <aside className="order-first space-y-4 lg:sticky lg:top-6 lg:order-none">
          <Card id="reglages" className="scroll-mt-20 sm:p-6">
            <h2 className="text-lg">Réglages</h2>
            <form action={saveRecapAction} className="mt-5">
              {/* Next ajoute des champs cachés en tête de formulaire : l'espacement se fait dans ce bloc. */}
              <div className="space-y-5">
                <SwitchRow name="matin" defaultChecked={profile.digest_email} description={`Par e-mail, à ${profile.email}.`}>
                  Recevoir le récap du matin
                </SwitchRow>
                <Field label="Heure d’envoi" htmlFor="heure">
                  <Select id="heure" name="heure" defaultValue={String(profile.digest_hour)}>
                    {DIGEST_HOURS.map((h) => (
                      <option key={h} value={h}>
                        {h} h 00
                      </option>
                    ))}
                  </Select>
                </Field>
                <div id="dimanche" className="scroll-mt-24 border-t border-line pt-5">
                  <SwitchRow
                    name="dimanche"
                    defaultChecked={plan.weeklyDigest && settings.dimanche.email}
                    disabled={!plan.weeklyDigest}
                    description={
                      plan.weeklyDigest ? (
                        `Ta semaine en chiffres, le dimanche à ${settings.dimanche.heure} h.`
                      ) : (
                        <>
                          Ta semaine en chiffres, le dimanche. Inclus à partir du plan Pro.{' '}
                          <Link href="/app/passer-pro" className="font-semibold text-rose-ink underline underline-offset-2">
                            Passer à Pro
                          </Link>
                        </>
                      )
                    }
                  >
                    Recevoir le bilan du dimanche
                  </SwitchRow>
                </div>
                {pushLive || (discordLive && profile.discord_user_id) ? (
                  <div className="space-y-4 border-t border-line pt-5">
                    {pushLive ? (
                      <>
                        <input type="hidden" name="canal_push" value="1" />
                        <SwitchRow name="push" defaultChecked={settings.matin.push} description="Sur tes appareils abonnés, à la même heure.">
                          Aussi en notification
                        </SwitchRow>
                      </>
                    ) : null}
                    {discordLive && profile.discord_user_id ? (
                      <>
                        <input type="hidden" name="canal_discord" value="1" />
                        <SwitchRow name="discord" defaultChecked={profile.digest_discord} description="En message privé, à la même heure.">
                          Aussi sur Discord
                        </SwitchRow>
                      </>
                    ) : null}
                  </div>
                ) : null}
                <SubmitButton className="w-full" pendingLabel="Enregistrement…">
                  Enregistrer mes réglages
                </SubmitButton>
              </div>
            </form>
            <form action={sendTestDigestAction} className="mt-4 border-t border-line pt-4">
              <SubmitButton variant="outline" className="w-full" pendingLabel="Envoi…">
                M’envoyer un exemple maintenant
              </SubmitButton>
              <p className="mt-2 text-center text-xs text-muted">Le récap d’aujourd’hui, envoyé à {profile.email}.</p>
            </form>
          </Card>

          {discordLive ? (
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
                  <p className="mt-2 text-sm text-muted">Lie ton compte pour recevoir aussi ton récap en message privé.</p>
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
          ) : null}
        </aside>
      </div>
    </div>
  );
}
