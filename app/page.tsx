import { LinkButton } from '@/components/ui/button';
import { BRAND_TAGLINE } from '@/lib/brand';

export default function HomePage() {
  return (
    <main id="contenu" className="mx-auto max-w-2xl px-4 py-24">
      <h1 className="text-4xl">{BRAND_TAGLINE}</h1>
      <LinkButton href="/connexion" className="mt-8">
        Voir les produits du jour
      </LinkButton>
    </main>
  );
}
