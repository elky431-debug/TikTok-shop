import type { Commission } from './types';

/**
 * Effet d'un remboursement sur une commission. `refundedShare` est la part cumulée de la facture remboursée (0 à 1),
 * telle que Stripe la donne (montant remboursé / montant payé) : rejouer le même remboursement ne change rien, un
 * second remboursement partiel n'annule que la différence. Commun aux deux bases.
 */
export function commissionRefund(
  commission: Pick<Commission, 'amount_cents' | 'canceled_cents' | 'status'>,
  refundedShare: number,
): { patch: Pick<Commission, 'amount_cents' | 'canceled_cents' | 'status'>; deltaCents: number } {
  const share = Math.min(1, Math.max(0, Number.isFinite(refundedShare) ? refundedShare : 0));
  const original = commission.amount_cents + commission.canceled_cents;
  const canceled = Math.max(commission.canceled_cents, share >= 1 ? original : Math.round(original * share));
  const deltaCents = canceled - commission.canceled_cents;
  return {
    patch: {
      amount_cents: original - canceled,
      canceled_cents: canceled,
      status: canceled >= original && original > 0 ? 'annulee' : commission.status,
    },
    deltaCents,
  };
}
