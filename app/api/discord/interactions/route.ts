import { NextResponse } from 'next/server';
import { handleDiscordInteraction } from '@/lib/discord/interactions';
import { verifyDiscordSignature } from '@/lib/discord/verify';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Adresse des interactions Discord (Developer Portal → General Information → Interactions Endpoint URL) : Discord y
 * envoie les commandes /lier et /delier. Signature vérifiée sur le corps brut ; sinon 401, comme l'exige la doc.
 */
export async function POST(request: Request) {
  if (!env.discordPublicKey) return NextResponse.json({ error: 'DISCORD_PUBLIC_KEY manquant.' }, { status: 503 });
  const body = await request.text();
  const valid = verifyDiscordSignature({
    body,
    signature: request.headers.get('x-signature-ed25519'),
    timestamp: request.headers.get('x-signature-timestamp'),
    publicKey: env.discordPublicKey,
  });
  if (!valid) return new NextResponse('invalid request signature', { status: 401 });
  let interaction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Corps invalide.' }, { status: 400 });
  }
  return NextResponse.json(await handleDiscordInteraction(interaction));
}
