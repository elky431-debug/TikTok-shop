import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { BRAND } from '@/lib/brand';

const LINKS = [
  { href: '/prix', label: 'Tarifs' },
  { href: '/formateurs', label: 'Formateurs' },
  { href: '/mentions-legales', label: 'Mentions légales' },
  { href: '/cgv', label: 'CGV' },
  { href: '/confidentialite', label: 'Confidentialité' },
];

/** Pied de page sobre, au style EtSmart. */
export function SiteFooter() {
  return (
    <footer className="border-t border-fg/[0.06] py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:px-6 md:flex-row">
        <Logo size="sm" />
        <nav aria-label="Liens du pied de page" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-fg">
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-subtle">© {new Date().getFullYear()} {BRAND}</p>
      </div>
      <p className="mx-auto mt-6 max-w-3xl px-4 text-center text-[11px] leading-relaxed text-subtle sm:px-6">
        {BRAND} est un service indépendant : il n’est ni édité, ni approuvé par TikTok. TikTok et TikTok Shop sont des marques
        de leurs propriétaires respectifs. Aucun cookie publicitaire, aucun outil de mesure d’audience.
      </p>
    </footer>
  );
}
