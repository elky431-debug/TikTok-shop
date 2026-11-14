import { redirect } from 'next/navigation';

/** Ancienne adresse de l'import CSV : même page, dans le gestionnaire. */
export default function OldImportPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) if (value) params.set(key, value);
  redirect(`/app/gestionnaire/import${params.size ? `?${params}` : ''}`);
}
