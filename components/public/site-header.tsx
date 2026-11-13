'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Logo } from '@/components/brand/logo';
import { LinkButton } from '@/components/ui/button';
import { LanguageToggle } from './language-toggle';

const LINKS = [
  { href: '/#fonctionnalites', label: 'Fonctionnalités' },
  { href: '/#comment', label: 'Comment ça marche' },
  { href: '/#prix', label: 'Tarifs' },
  { href: '/tendances', label: 'Tendances' },
];

/** En-tête fixe au style EtSmart : noir flouté, liens centrés, langue, connexion, bouton rose. */
export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-fg/[0.06] bg-bg/60 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="flex h-16 items-center justify-between">
          <Logo />

          <nav aria-label="Navigation du site" className="hidden items-center gap-8 text-sm md:flex">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-muted transition-colors hover:text-fg">
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <LanguageToggle />
            <Link href="/connexion?mode=connexion" className="px-3 py-2 text-sm text-fg/70 transition-colors hover:text-fg">
              Se connecter
            </Link>
            <LinkButton href="/connexion" size="sm">
              Commencer
            </LinkButton>
          </div>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong md:hidden"
            aria-expanded={open}
            aria-controls="menu-mobile"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          >
            {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open ? (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 top-16 z-40 bg-bg/60 md:hidden" aria-hidden="true" />
          <div id="menu-mobile" className="fixed left-4 right-4 top-[4.5rem] z-50 space-y-3 rounded-2xl border border-line-strong bg-raised p-5 md:hidden">
            <nav aria-label="Navigation du site (mobile)">
              {LINKS.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="block py-2 text-sm text-fg/80">
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-3 border-t border-line pt-3">
              <LanguageToggle />
            </div>
            <div className="space-y-2 border-t border-line pt-3">
              <LinkButton href="/connexion?mode=connexion" variant="outline" className="w-full" onClick={() => setOpen(false)}>
                Se connecter
              </LinkButton>
              <LinkButton href="/connexion" className="w-full" onClick={() => setOpen(false)}>
                Commencer
              </LinkButton>
            </div>
          </div>
        </>
      ) : null}
    </header>
  );
}
