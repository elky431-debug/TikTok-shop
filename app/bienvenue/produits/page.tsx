import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TrendBadge } from '@/components/product/bits';
import { ProductImage } from '@/components/product/product-image';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, EmptyState } from '@/components/ui/surface';
import { requireViewer } from '@/lib/auth/session';
import { nicheShort } from '@/lib/niches';
import { welcomeProducts } from '@/lib/onboarding';
import { formatEuros } from '@/lib/utils';
import { writeFirstScriptAction } from '../actions';
import { WelcomeShell } from '../welcome-shell';

export const metadata: Metadata = { title: 'Tes produits du jour' };
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  limite: 'Tu as déjà écrit tes scripts du jour. Ouvre le studio pour les retrouver.',
  acces: 'Ce produit n’est plus dans tes produits du jour. Choisis-en un autre.',
  produit: 'Ce produit n’existe plus. Choisis-en un autre.',
  generation: 'L’écriture du script a échoué. Réessaie dans un instant.',
};

/** Moment waouh, étape 4 : les 3 produits du jour dans tes niches, et un bouton pour écrire ton premier script. */
export default async function ProduitsDuJourPage({ searchParams }: { searchParams: { erreur?: string } }) {
  const { profile } = await requireViewer('/bienvenue/produits');
  if (!profile.onboarded_at) redirect('/bienvenue');
  const { products, demo, stale } = await welcomeProducts(profile);

  return (
    <WelcomeShell step={4} wide>
      <h1 className="text-3xl">{profile.first_name ? `${profile.first_name}, voici` : 'Voici'} tes 3 produits du jour</h1>
      <p className="mt-2 text-muted">Les mieux placés dans tes niches cette nuit. Choisis-en un : on t’écrit ton premier script tout de suite.</p>

      <div className="mt-6 space-y-3">
        {searchParams.erreur ? <Callout tone="rose" title={ERRORS[searchParams.erreur] ?? ERRORS.generation} /> : null}
        {demo ? (
          <Callout tone="neutral" title="Produits fictifs : démonstration">
            Ces produits n’existent pas sur TikTok Shop : ils montrent le parcours en attendant le branchement des vraies données.
          </Callout>
        ) : stale ? (
          <Callout tone="warn" title="Derniers relevés disponibles">
            La mise à jour de cette nuit n’a pas abouti : ces produits viennent du relevé précédent.
          </Callout>
        ) : null}
      </div>

      {products.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="Pas encore de produits dans tes niches"
          action={
            <Link href="/bienvenue/pro" className="font-semibold underline underline-offset-4">
              Continuer
            </Link>
          }
        >
          Le radar se remplit chaque nuit. Tu recevras tes premiers produits demain matin.
        </EmptyState>
      ) : (
        <ol className="mt-6 space-y-3">
          {products.map((product, i) => (
            <li key={product.id} className="feature-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 gap-3">
                <div className="relative shrink-0">
                  <ProductImage src={product.image_url} fallback={product.image_fallback} alt="" className="w-16" />
                  <span className="num absolute -left-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-fg px-1.5 text-xs font-bold text-bg">
                    {i + 1}
                  </span>
                </div>
                <div className="min-w-0">
                  <h2 className="line-clamp-2 text-base font-semibold leading-snug">{product.name}</h2>
                  <p className="num mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="text-muted">{nicheShort(product.niche)}</span>
                    <span>{formatEuros(product.price_cents)}</span>
                    <span className="font-semibold text-gain">{formatEuros(product.commission_cents)} / vente</span>
                    <TrendBadge trend={product.trend} growth={product.growth_7d} measured={product.growth_known} />
                  </p>
                </div>
              </div>
              <form action={writeFirstScriptAction} className="shrink-0">
                <input type="hidden" name="produit" value={product.id} />
                <SubmitButton variant={i === 0 ? 'primary' : 'outline'} className="w-full sm:w-auto" pendingLabel="Écriture du script…">
                  Écrire mon script
                </SubmitButton>
              </form>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href="/bienvenue/pro" className="text-muted underline underline-offset-4 hover:text-fg">
          Passer cette étape
        </Link>
      </p>
    </WelcomeShell>
  );
}
