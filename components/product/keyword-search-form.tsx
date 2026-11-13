import { Search } from 'lucide-react';
import Link from 'next/link';
import { searchKeywordAction } from '@/app/app/actions';
import { SubmitButton } from '@/components/ui/submit-button';
import { plural } from '@/lib/utils';

/** Recherche par mot-clé : formulaire (le quota est vérifié côté serveur, ce compteur n'est qu'indicatif). */
export function KeywordSearchForm({
  remaining,
  limit,
  defaultValue,
  catalogOnly,
}: {
  remaining: number;
  limit: number;
  defaultValue?: string;
  /** Pas de source de recherche branchée : la recherche se fait dans le catalogue du jour. */
  catalogOnly: boolean;
}) {
  if (!limit) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Search className="h-4 w-4" aria-hidden="true" />
        Chercher n’importe quel produit de TikTok Shop par mot-clé : avec Pro.{' '}
        <Link href="/app/passer-pro" className="font-semibold text-rose-ink hover:underline">
          Passer à Pro
        </Link>
      </p>
    );
  }
  return (
    <form action={searchKeywordAction} role="search" aria-label="Chercher un produit par mot-clé">
      <label htmlFor="recherche-q" className="mb-1.5 block text-sm font-semibold">
        Chercher un produit par mot-clé
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id="recherche-q"
            name="q"
            type="search"
            required
            minLength={2}
            maxLength={80}
            defaultValue={defaultValue}
            placeholder="ex. sérum, lisseur, gourde"
            className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-3 text-[0.95rem] text-fg placeholder:text-subtle focus:border-cyan-ink/50 focus:outline-none focus-visible:outline-2 focus-visible:outline-cyan"
            aria-describedby="recherche-aide"
          />
        </div>
        <SubmitButton pendingLabel="Recherche…" disabled={remaining <= 0}>
          Chercher
        </SubmitButton>
      </div>
      <p id="recherche-aide" className="mt-1.5 text-xs text-muted">
        {remaining > 0 ? `${plural(remaining, 'recherche restante', 'recherches restantes')} aujourd’hui sur ${limit}.` : `Tes ${limit} recherches du jour sont faites : reviens demain.`}{' '}
        {catalogOnly ? 'La source de recherche n’est pas branchée : la recherche se fait dans le catalogue du jour.' : 'Relancer le même mot-clé dans la journée ne compte pas.'}
      </p>
    </form>
  );
}
