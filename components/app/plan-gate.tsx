import { LinkButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/surface';
import { getPlan, type PaidPlanId } from '@/lib/plans';

/** Fonctionnalité réservée à un plan : ce qu'elle fait, et le bouton pour y passer. */
export function PlanGate({ plan, title, children }: { plan: PaidPlanId; title: string; children: React.ReactNode }) {
  const name = getPlan(plan).name;
  return (
    <EmptyState title={title} action={<LinkButton href="/app/passer-pro">Passer à {name}</LinkButton>} className="mt-6">
      {children} Disponible avec le plan {name}.
    </EmptyState>
  );
}
