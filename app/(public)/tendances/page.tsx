import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { LinkButton } from '@/components/ui/button';
import { BRAND } from '@/lib/brand';
import { getVeilleSelection, nicheEntries, publishedNiches } from '@/lib/tendances';
import { formatDayMonth } from '@/lib/utils';

/** Index des pages publiques par catégorie. Sans aucune catégorie publiée : page non indexée et absente du plan du site. */
export const revalidate = 3600;

const TITLE = 'Produits tendance TikTok Shop France';

export async function generateMetadata(): Promise<Metadata> {
  const selection = await getVeilleSelection();
  const niches = publishedNiches(selection);
  return {
    title: TITLE,
    description: `Les produits qui montent sur TikTok Shop France, par catégorie${niches.length ? ` (${niches.map((n) => n.short.toLowerCase()).join(', ')})` : ''}. Mis à jour chaque jour.`,
    alternates: { canonical: '/tendances' },
    robots: niches.length ? undefined : { index: false },
  };
}

export default async function TendancesPage() {
  const selection = await getVeilleSelection();
  const niches = publishedNiches(selection);

  return (
    <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <header className="mx-auto max-w-3xl text-center">
        <p className="eyebrow mb-3">TikTok Shop France</p>
        <h1 className="text-4xl/tight font-bold sm:text-5xl/tight">
          Les produits
          <br />
          <span className="text-gradient-live">qui montent.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          {selection.date
            ? `Par catégorie, d’après le relevé du ${formatDayMonth(selection.date)}. Mis à jour chaque jour.`
            : 'Par catégorie, mis à jour chaque jour.'}{' '}
          Le classement du jour, avec les scores et les scripts, est dans {BRAND}.
        </p>
      </header>

      {niches.length === 0 ? (
        <div className="mx-auto mt-12 max-w-md rounded-2xl border border-dashed border-line px-5 py-10 text-center">
          <p className="text-lg font-semibold">Pas encore assez de produits relevés</p>
          <p className="mt-2 text-sm text-muted">Les catégories apparaissent ici dès qu’elles comptent assez de vrais produits.</p>
          <div className="mt-5 flex justify-center">
            <LinkButton href="/connexion" arrow>
              Créer mon compte
            </LinkButton>
          </div>
        </div>
      ) : (
        <ul className="mt-12 grid gap-3 sm:grid-cols-2">
          {niches.map((n) => (
            <li key={n.id}>
              <Link href={`/tendances/${n.id}`} className="feature-card group flex h-full flex-col p-5">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-lg font-semibold">{n.label}</span>
                  <ArrowRight className="h-4 w-4 text-cyan-ink transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </span>
                <ol className="mt-3 space-y-1 text-sm text-muted">
                  {nicheEntries(selection, n.id, 3).map((p) => (
                    <li key={p.id} className="truncate">
                      {p.name}
                    </li>
                  ))}
                </ol>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
