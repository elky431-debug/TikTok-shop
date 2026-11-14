import { notFound, redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { isLaunchStep, launchHref } from '@/lib/v2/launch';
import { launchForProduct, startLaunch } from '@/lib/v2/launch-store';
import { parisDate } from '@/lib/utils';

/**
 * Lancement d'un produit suivi (lignes du dashboard, « Mes produits ») : ouvre le lancement en cours, sinon le plus
 * récent, sinon en crée un — seulement pour un produit déjà suivi (aucun suivi créé par un simple lien). Un produit pas
 * encore suivi passe par l'étape 1 (bouton « Lancer ce produit »).
 */
export default async function LaunchForProductPage({ params, searchParams }: { params: { produit: string }; searchParams: { etape?: string } }) {
  const { profile } = await requireOnboardedViewer('/app/lancer');
  const repo = getRepo();
  const productId = decodeURIComponent(params.produit);
  const step = isLaunchStep(searchParams.etape) ? searchParams.etape : null;
  const existing = await launchForProduct(repo, profile.id, productId);
  if (existing) redirect(launchHref(existing.id, step ?? existing.data.step));
  if (!(await repo.getSavedProduct(profile.id, productId))) {
    if (!(await repo.getProduct(productId))) notFound();
    redirect(`/app/produit/${encodeURIComponent(productId)}`);
  }
  const started = await startLaunch(repo, profile, productId, parisDate());
  if (!started.ok) redirect(`/app/lancer?lancement=${started.reason}`);
  redirect(launchHref(started.launch.id, step ?? started.launch.data.step));
}
