import type { Metadata } from 'next';
import { LinkButton } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Compte supprimé', robots: { index: false } };

export default function CompteSupprimePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <h1 className="text-3xl">Ton compte est supprimé</h1>
      <p className="mt-3 text-muted">
        Tes données ont été effacées et ton abonnement résilié. Merci d’avoir essayé. Tu peux revenir quand tu veux.
      </p>
      <LinkButton href="/" variant="outline" className="mt-8">
        Retour à l’accueil
      </LinkButton>
    </div>
  );
}
