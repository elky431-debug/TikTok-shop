import { NextResponse } from 'next/server';
import { handleBillingEvent } from '@/lib/billing/events';
import { enrichStripeEvent, parseStripeWebhook } from '@/lib/billing/stripe';
import { BillingUnavailableError } from '@/lib/billing/types';

export const dynamic = 'force-dynamic';

/** Webhooks Stripe : signature vérifiée, événement normalisé, traitement idempotent. */
export async function POST(request: Request) {
  const raw = await request.text();
  let event;
  try {
    event = parseStripeWebhook(raw, request.headers.get('stripe-signature'));
  } catch (error) {
    const status = error instanceof BillingUnavailableError ? 503 : 400;
    const message = error instanceof Error ? error.message : 'Signature invalide';
    return NextResponse.json({ error: message }, { status });
  }

  try {
    const result = await handleBillingEvent(await enrichStripeEvent(event));
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error('[webhook stripe]', error);
    // 500 : Stripe réessaiera plus tard.
    return NextResponse.json({ error: 'Traitement impossible pour le moment.' }, { status: 500 });
  }
}
