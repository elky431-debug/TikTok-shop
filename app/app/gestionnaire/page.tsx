import { redirect } from 'next/navigation';

/** Le gestionnaire fait partie du tableau de bord : les anciens liens y mènent, avec leur onglet et leur message. */
export default function GestionnairePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) if (value) params.set(key, key === 'onglet' && value === 'gestion' ? 'produits' : value);
  redirect(`/app${params.size ? `?${params}` : ''}#gestion`);
}
