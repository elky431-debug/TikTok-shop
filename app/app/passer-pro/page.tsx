import { requireOnboardedViewer } from '@/lib/auth/session';

// Remplacé au jalon 5 (paiement).
export default async function PasserProPage() {
  await requireOnboardedViewer();
  return <h1 className="text-3xl">Passer Pro</h1>;
}
