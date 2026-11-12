import { requireOnboardedViewer } from '@/lib/auth/session';

export default async function RadarPage() {
  const { profile } = await requireOnboardedViewer();
  return (
    <main id="contenu" className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl">Salut {profile.first_name}</h1>
    </main>
  );
}
