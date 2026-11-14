import { redirect } from 'next/navigation';

/** « Mes gains » est devenu l'onglet Commissions du gestionnaire : les anciens liens y mènent. */
export default function GainsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const params = new URLSearchParams({ onglet: 'commissions' });
  for (const [key, value] of Object.entries(searchParams)) if (value) params.set(key, value);
  redirect(`/app?${params}#gestion`);
}
