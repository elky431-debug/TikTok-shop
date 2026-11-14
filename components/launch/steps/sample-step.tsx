import { PackageCheck, Send } from 'lucide-react';
import { sampleAction, skipSampleAction } from '@/app/app/lancer/actions';
import { CopyButton } from '@/components/ui/copy-button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card } from '@/components/ui/surface';
import { nicheLabel } from '@/lib/niches';
import { displayName } from '@/lib/product-name';
import { parisDate } from '@/lib/utils';
import type { LaunchPageData } from '@/lib/v2/launch-view';
import { StepFrame, StepNav } from '../step-frame';

/** Message de demande d'échantillon, prêt à copier (au vendeur : vouvoiement, sans promesse de ventes). */
export function sampleMessage(name: string, niche: string | null): string {
  const topic = niche ? `autour de ${niche.toLowerCase()}` : 'sur TikTok Shop';
  return (
    `Bonjour ! Je crée des vidéos TikTok ${topic}. Votre produit « ${name} » m’intéresse : j’aimerais le présenter dans une série ` +
    'de vidéos face caméra, avec le lien de votre boutique. Serait-il possible de recevoir un échantillon pour le tester avant de ' +
    'tourner ? Merci beaucoup !'
  );
}

const TIKTOK_STEPS = [
  'Dans l’appli TikTok, ouvre le Centre des créateurs de TikTok Shop, puis la place de marché des produits.',
  'Cherche le produit et ouvre sa page.',
  'Touche « Demander un échantillon », colle ton message, puis envoie la demande.',
];

/**
 * Étape 2. TikTok ne prévient pas l'appli quand un échantillon est demandé ou arrive : deux cases à cocher (avec leur
 * date) le disent, et font avancer le statut du dashboard.
 */
export function SampleStep({ data, searchParams }: { data: LaunchPageData; searchParams: Record<string, string | undefined> }) {
  const { launch, product, sample } = data;
  const name = product ? displayName(product) : launch.data.product_name;
  const message = sampleMessage(name, product ? nicheLabel(product.niche) : null);
  const requested = launch.data.sample === 'demande' || launch.data.sample === 'recu';
  const received = launch.data.sample === 'recu';
  const today = parisDate();
  return (
    <StepFrame step="echantillon" sentence="Demande un échantillon au vendeur : filmer le vrai produit rend tes vidéos plus crédibles.">
      {searchParams.ok === 'demande' ? (
        <Callout tone="gain" className="mb-6" title="Demande notée.">
          Coche « Échantillon reçu » dès qu’il arrive. En attendant, tu peux déjà passer aux scripts.
        </Callout>
      ) : null}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          <Card className="sm:p-6">
            <p className="text-sm font-semibold">Ton message</p>
            <p className="mt-2 rounded-xl bg-surface p-4 text-sm leading-relaxed">{message}</p>
            <CopyButton text={message} label="Copier le message" copiedLabel="Message copié" className="mt-3" />
          </Card>
          <div>
            <p className="text-sm font-semibold">Dans TikTok, en 3 étapes</p>
            <ol className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-3">
              {TIKTOK_STEPS.map((text, i) => (
                <li key={i} className="flex gap-3 rounded-2xl border border-line bg-raised p-4 text-sm leading-relaxed">
                  <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient)] text-xs font-bold text-on-gradient">
                    {i + 1}
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <Card className="sm:p-6">
          <form action={sampleAction}>
            {/* Next ajoute des champs cachés en tête de formulaire : l'espacement se fait dans ce bloc. */}
            <div className="space-y-4">
              <input type="hidden" name="id" value={launch.id} />
              <fieldset className="min-w-0 rounded-xl border border-line p-4">
                <legend className="sr-only">Échantillon demandé</legend>
                <label className="flex cursor-pointer items-center gap-3 font-semibold">
                  <input type="checkbox" name="demande" value="1" defaultChecked={requested} className="h-5 w-5 accent-[rgb(var(--cyan-ink))]" />
                  <Send className="h-4 w-4 text-cyan-ink" aria-hidden="true" />
                  Échantillon demandé
                </label>
                <label className="mt-3 flex items-center gap-3 text-sm text-muted">
                  le
                  <input
                    type="date"
                    name="date_demande"
                    max={today}
                    defaultValue={sample?.data.requested_at ?? today}
                    className="h-10 rounded-xl border border-line-strong bg-bg px-3 text-sm text-fg"
                  />
                </label>
              </fieldset>
              <fieldset className="min-w-0 rounded-xl border border-line p-4">
                <legend className="sr-only">Échantillon reçu</legend>
                <label className="flex cursor-pointer items-center gap-3 font-semibold">
                  <input type="checkbox" name="recu" value="1" defaultChecked={received} className="h-5 w-5 accent-[rgb(var(--cyan-ink))]" />
                  <PackageCheck className="h-4 w-4 text-gain" aria-hidden="true" />
                  Échantillon reçu
                </label>
                <label className="mt-3 flex items-center gap-3 text-sm text-muted">
                  le
                  <input
                    type="date"
                    name="date_recu"
                    max={today}
                    defaultValue={sample?.data.received_at ?? today}
                    className="h-10 rounded-xl border border-line-strong bg-bg px-3 text-sm text-fg"
                  />
                </label>
              </fieldset>
              <SubmitButton size="lg" className="w-full" pendingLabel="Enregistrement…">
                Enregistrer
              </SubmitButton>
            </div>
          </form>
          <form action={skipSampleAction} className="mt-3">
            <input type="hidden" name="id" value={launch.id} />
            <SubmitButton variant="ghost" className="w-full" pendingLabel="…">
              Pas d’échantillon, je passe
            </SubmitButton>
          </form>
        </Card>
      </div>
      <StepNav id={launch.id} step="echantillon" />
    </StepFrame>
  );
}
