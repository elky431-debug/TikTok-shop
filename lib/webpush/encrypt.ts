import { createCipheriv, createECDH, hkdfSync, randomBytes, type ECDH } from 'node:crypto';

/**
 * Chiffrement d'un message push (RFC 8291, « Message Encryption for Web Push », codage aes128gcm de la RFC 8188).
 * Écrit d'après l'implémentation de référence `http_ece` (Martin Thomson, coauteur des deux RFC) :
 *
 *   ecdh_secret = ECDH(clé éphémère du serveur, clé p256dh du navigateur)
 *   key_info    = "WebPush: info" || 0x00 || clé publique du navigateur || clé publique du serveur
 *   IKM         = HKDF(sel = secret « auth » du navigateur, ecdh_secret, key_info, 32)
 *   CEK         = HKDF(sel = salt aléatoire de 16 octets, IKM, "Content-Encoding: aes128gcm" || 0x00, 16)
 *   NONCE       = HKDF(salt, IKM, "Content-Encoding: nonce" || 0x00, 12)
 *   corps       = salt (16) || rs (4, gros-boutiste) || idlen (1) = 65 || clé publique du serveur (65)
 *                 || AES-128-GCM(CEK, NONCE, message || 0x02) || étiquette (16)
 *
 * Un seul enregistrement (rs = 4096) : le délimiteur 0x02 marque le dernier, sans remplissage.
 */
const RECORD_SIZE = 4096;
const TAG_LENGTH = 16;
/** Message en clair le plus long qui tient dans un enregistrement (rs − étiquette − délimiteur). */
export const MAX_PLAINTEXT = RECORD_SIZE - TAG_LENGTH - 1;

export interface EncryptOptions {
  /** Paire de clés éphémère du serveur (pour les tests ; sinon générée). */
  serverKeys?: ECDH;
  /** Sel de 16 octets (pour les tests ; sinon aléatoire). */
  salt?: Buffer;
}

export function encryptPushPayload(plaintext: Buffer, p256dh: Buffer, auth: Buffer, options: EncryptOptions = {}): Buffer {
  if (p256dh.length !== 65 || p256dh[0] !== 0x04) throw new Error('Clé p256dh invalide : 65 octets attendus (point non compressé).');
  if (auth.length < 16) throw new Error('Secret auth invalide : 16 octets attendus.');
  if (plaintext.length > MAX_PLAINTEXT) throw new Error(`Message trop long pour une notification (${plaintext.length} octets).`);

  const server = options.serverKeys ?? createECDH('prime256v1');
  if (!options.serverKeys) server.generateKeys();
  const serverPublic = server.getPublicKey();
  const salt = options.salt ?? randomBytes(16);
  if (salt.length !== 16) throw new Error('Le sel doit faire 16 octets.');

  const ecdhSecret = server.computeSecret(p256dh);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'ascii'), p256dh, serverPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', ecdhSecret, auth, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'ascii'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'ascii'), 12));

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([0x02])])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(serverPublic.length, 20);
  return Buffer.concat([header, serverPublic, body]);
}
