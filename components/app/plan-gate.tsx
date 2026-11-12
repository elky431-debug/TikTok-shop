import { LinkButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/surface';

/** Fonctionnalité réservée à un plan : ce qu'elle fait, et le bouton pour y passer. */
export function PlanGate({ plan, title, children }: { plan: 'Pro' | 'Pro+'; title: string; children: React.ReactNode }) {
  return (
    <EmptyState title={title} action={<LinkButton href="/app/passer-pro">Passer {plan}</LinkButton>} className="mt-6">
      {children} Disponible avec le plan {plan}.
    </EmptyState>
  );
}
