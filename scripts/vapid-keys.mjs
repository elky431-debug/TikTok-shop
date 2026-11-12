#!/usr/bin/env node
/**
 * Génère une paire de clés VAPID (RFC 8292 : ECDSA sur la courbe P-256) pour les notifications push :
 *   node scripts/vapid-keys.mjs
 * Copie les deux lignes dans .env.local (et dans les variables Netlify), avec VAPID_SUBJECT=mailto:ton-adresse.
 * La clé privée ne doit jamais être publiée ; changer de clés oblige chaque appareil à se réabonner.
 */
import { createECDH } from 'node:crypto';

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const privateKey = ecdh.getPrivateKey();
const padded = Buffer.concat([Buffer.alloc(32 - privateKey.length), privateKey]);

console.log(`VAPID_PUBLIC_KEY=${ecdh.getPublicKey().toString('base64url')}`);
console.log(`VAPID_PRIVATE_KEY=${padded.toString('base64url')}`);
console.log('VAPID_SUBJECT=mailto:bonjour@ton-domaine.fr');
