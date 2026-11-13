import type { Metadata } from 'next';
import { Layers } from 'lucide-react';
import Link from 'next/link';
import { PlanGate } from '@/components/app/plan-gate';
import { StudioNav } from '@/components/studio/studio-nav';
import { Label, Select } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, PageHeader, ProgressBar } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { listStudioProducts, studioRights } from '@/lib/studio';
import { listSeries, seriesLeft } from '@/lib/studio/series';
import { listDocs } from '@/lib/studio/store';
import { formatRelative } from '@/lib/utils';
import { createSeriesAction } from './actions';

export const metadata: Metadata = { title: 'Série de 20 vidéos' };

export default async function SeriesPage({ searchParams }: { searchParams: { produit?: string; erreur?: string } }) {
  const { profile } = await requireOnboardedViewer('/app/studio/serie');
  const rights = studioRights(profile.plan);
  const header = (
    <>
      <PageHeader
        title="Série de 20 vidéos"
        description="Sur TikTok Shop, c’est le volume sur un même produit qui compte : 20 angles différents, chacun prêt à devenir un script en un clic."
      />
      <StudioNav active="serie" />
    </>
  );
  if (rights.seriesPerDay <= 0) {
    return (
      <div>
        {header}
        <PlanGate plan="Pro" title="20 angles différents pour un même produit">
          Démo, avant-après, réponse à un commentaire, top 3… sans jamais répéter le même angle, et chaque angle devient un script complet en un clic.
        </PlanGate>
      </div>
    );
  }

  const [products, series, left, docs] = await Promise.all([listStudioProducts(profile), listSeries(profile), seriesLeft(profile), listDocs(profile.id)]);
  const written = new Map<string, number>();
  for (const doc of docs) if (doc.series) written.set(doc.series.id, (written.get(doc.series.id) ?? 0) + 1);
  const all = [...products.saved, ...products.today];
  const selected = all.some((p) => p.id === searchParams.produit) ? searchParams.produit : (products.saved[0]?.id ?? products.today[0]?.id);

  return (
    <div>
      {header}
      {searchParams.erreur ? (
        <Callout tone="rose" className="mb-6" title="Série non créée">
          {searchParams.erreur}
        </Callout>
      ) : null}

      <Card className="sm:p-6">
        <form action={createSeriesAction} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="serie-produit">Produit</Label>
            {all.length ? (
              <Select id="serie-produit" name="produit" defaultValue={selected} required>
                {products.saved.length ? (
                  <optgroup label="Mes produits">
                    {products.saved.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {products.today.length ? (
                  <optgroup label="Produits du jour">
                    {products.today.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </Select>
            ) : (
              <p className="text-sm text-muted">Aucun produit disponible : ouvre le radar pour en suivre un.</p>
            )}
          </div>
          <SubmitButton size="lg" pendingLabel="Recherche de 20 angles…" disabled={left <= 0 || !all.length}>
            Créer ma série de 20
          </SubmitButton>
          <p className="text-sm text-muted sm:col-span-2">
            {left > 0
              ? `Il te reste ${Number.isFinite(left) ? left : 'un nombre illimité de'} série${left > 1 ? 's' : ''} aujourd’hui. Chaque angle écrit compte comme une écriture de scripts.`
              : 'Plus de série disponible aujourd’hui : ton compteur repart à zéro demain matin.'}
          </p>
        </form>
      </Card>

      <section className="mt-10" aria-labelledby="mes-series">
        <h2 id="mes-series" className="mb-3 text-xl">
          Mes séries
        </h2>
        {series.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-sm text-muted">
            Choisis un produit que tu suis, puis appuie sur « Créer ma série de 20 ». Les angles se retrouvent ici.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {series.map((s) => {
              const count = Math.min(s.data.angles.length, written.get(s.id) ?? 0);
              return (
                <li key={s.id}>
                  <Link href={`/app/studio/serie/${s.id}`} className="feature-card block p-4">
                    <div className="flex items-start gap-3">
                      <span className="icon-chip h-10 w-10 shrink-0">
                        <Layers className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{s.data.product_name}</p>
                        <p className="text-sm text-muted">
                          <span className="num">
                            {count}/{s.data.angles.length}
                          </span>{' '}
                          vidéos écrites · {formatRelative(s.created_at)}
                        </p>
                      </div>
                    </div>
                    <ProgressBar value={count} max={s.data.angles.length} label={`${count} vidéos écrites sur ${s.data.angles.length}`} className="mt-3 h-2" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
