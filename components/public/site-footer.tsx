import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { BRAND } from '@/lib/brand';

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted">
            Le radar du matin des affiliés TikTok Shop, en français. {BRAND} est un service indépendant : il n’est ni édité, ni
            approuvé par TikTok. TikTok et TikTok Shop sont des marques de leurs propriétaires respectifs.
          </p>
        </div>
        <nav aria-label="Produit" className="text-sm">
          <p className="font-semibold">Produit</p>
          <ul className="mt-3 space-y-2 text-muted">
            <li>
              <Link href="/prix" className="hover:text-fg">
                Prix
              </Link>
            </li>
            <li>
              <Link href="/formateurs" className="hover:text-fg">
                Formateurs
              </Link>
            </li>
            <li>
              <Link href="/connexion" className="hover:text-fg">
                Connexion
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Informations légales" className="text-sm">
          <p className="font-semibold">Légal</p>
          <ul className="mt-3 space-y-2 text-muted">
            <li>
              <Link href="/mentions-legales" className="hover:text-fg">
                Mentions légales
              </Link>
            </li>
            <li>
              <Link href="/cgv" className="hover:text-fg">
                Conditions générales de vente
              </Link>
            </li>
            <li>
              <Link href="/confidentialite" className="hover:text-fg">
                Politique de confidentialité
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted sm:px-6">
        © {new Date().getFullYear()} {BRAND}. Aucun cookie publicitaire, aucun outil de mesure d’audience.
      </p>
    </footer>
  );
}
