import { createPublicKey, verify } from 'node:crypto';

/**
 * Vérifie la signature d'une interaction (doc Discord, interactions/overview : en-têtes X-Signature-Ed25519 et
 * X-Signature-Timestamp, signature Ed25519 de « timestamp + corps brut » avec la clé publique de l'application).
 * Node sait vérifier l'Ed25519 sans dépendance : la clé publique brute (32 octets) passe par le format JWK.
 */
export function verifyDiscordSignature(input: {
  body: string;
  signature: string | null;
  timestamp: string | null;
  publicKey: string;
}): boolean {
  const { body, signature, timestamp, publicKey } = input;
  if (!signature || !timestamp || !/^[0-9a-f]{128}$/i.test(signature) || !/^[0-9a-f]{64}$/i.test(publicKey)) return false;
  try {
    const key = createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(publicKey, 'hex').toString('base64url') },
      format: 'jwk',
    });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}
