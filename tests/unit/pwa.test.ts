import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAND } from '@/lib/brand';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { countUnreadNotifications, groupNotifications, openNotification, pruneNotifications, safePath } from '@/lib/notification-center';
import { notify } from '@/lib/notify';
import { registerPushSender, sendPush } from '@/lib/push';
import { appleWebApp, IOS_SPLASH_SCREENS, webManifest } from '@/lib/pwa';
import { isPushConfigured, vapidProblems } from '@/lib/webpush/config';
import { encryptPushPayload, MAX_PLAINTEXT } from '@/lib/webpush/encrypt';
import { sendWebPush } from '@/lib/webpush/send';
import { deviceLabel, isAllowedPushEndpoint, listPushSubscriptions, parseSubscription, savePushSubscription, webPushSender } from '@/lib/webpush/subscriptions';
import { vapidAuthorization, vapidJwt } from '@/lib/webpush/vapid';

const ROOT = path.resolve(__dirname, '../..');

/** Largeur et hauteur d'un PNG (en-tête IHDR). */
function pngSize(file: string) {
  const buffer = readFileSync(path.join(ROOT, file));
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function vapidKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: ecdh.getPublicKey().toString('base64url'), privateKey: ecdh.getPrivateKey().toString('base64url'), subject: 'mailto:contact@exemple.fr' };
}

/** Déchiffrement écrit à part, d'après la RFC 8188 (aes128gcm) et la RFC 8291 (clés Web Push), côté navigateur. */
function decryptAsBrowser(body: Buffer, ua: ReturnType<typeof createECDH>, auth: Buffer): Buffer {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body.readUInt8(20);
  const serverPublic = body.subarray(21, 21 + idlen);
  const record = body.subarray(21 + idlen);
  expect(record.length).toBeLessThanOrEqual(rs);
  const ikm = Buffer.from(
    hkdfSync('sha256', ua.computeSecret(serverPublic), auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), serverPublic]), 32),
  );
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const padded = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  expect(padded[end]).toBe(2); // délimiteur du dernier enregistrement
  return padded.subarray(0, end);
}

let repo: LocalRepo;
beforeEach(() => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
});
afterEach(() => {
  setRepoForTests(null);
  registerPushSender(null);
  vi.unstubAllEnvs();
});

describe('appli installable : manifeste et icônes', () => {
  it('manifeste complet : nom, couleurs, affichage autonome, icônes 192, 512 et maskable', () => {
    const manifest = webManifest();
    expect(manifest).toMatchObject({ name: BRAND, short_name: BRAND, lang: 'fr', display: 'standalone', start_url: '/app', scope: '/' });
    expect(manifest.background_color).toBe('#000000');
    expect(manifest.theme_color).toBe('#000000');
    const icons = manifest.icons ?? [];
    expect(icons.find((i) => i.sizes === '192x192' && i.purpose === 'any')).toBeTruthy();
    expect(icons.find((i) => i.sizes === '512x512' && i.purpose === 'any')).toBeTruthy();
    expect(icons.find((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBeTruthy();
    for (const icon of icons) {
      const [w, h] = icon.sizes!.split('x').map(Number);
      expect(pngSize(`public${icon.src}`)).toEqual({ width: w, height: h });
    }
  });

  it('écrans de démarrage iOS : une image par écran, à la bonne taille', () => {
    const images = appleWebApp.startupImage as Array<{ url: string; media: string }>;
    expect(images).toHaveLength(IOS_SPLASH_SCREENS.length);
    for (const [i, [w, h, dpr]] of IOS_SPLASH_SCREENS.entries()) {
      expect(images[i].media).toContain(`(device-width: ${w}px)`);
      expect(pngSize(`public${images[i].url}`)).toEqual({ width: w * dpr, height: h * dpr });
    }
    expect(pngSize('app/apple-icon.png')).toEqual({ width: 180, height: 180 });
  });
});

// ---------------------------------------------------------------------------
// Service worker exécuté dans un faux contexte de worker (Cache API, fetch, clients)
// ---------------------------------------------------------------------------
type Handler = (event: Record<string, unknown>) => void;

function serviceWorkerHarness() {
  const origin = 'https://app.exemple.fr';
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (input: string | { url: string }) => new URL(typeof input === 'string' ? input : input.url, origin).href;
  const cacheFor = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      put: async (req: string | { url: string }, res: Response) => void store.set(keyOf(req), res),
      match: async (req: string | { url: string }) => store.get(keyOf(req))?.clone(),
      keys: async () => [...store.keys()].map((url) => ({ url })),
      delete: async (req: string | { url: string }) => store.delete(keyOf(req)),
      addAll: async (urls: string[]) => {
        for (const url of urls) store.set(keyOf(url), page(`précache ${url}`));
      },
    };
  };
  const caches = {
    open: async (name: string) => cacheFor(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (req: string | { url: string }, opts: { cacheName?: string } = {}) => {
      const names = opts.cacheName ? [opts.cacheName] : [...stores.keys()];
      for (const name of names) {
        const hit = stores.get(name)?.get(keyOf(req));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  let network: (req: { url: string }) => Promise<Response> = async () => page('réseau');
  const handlers = new Map<string, Handler>();
  const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
  const unsubscribe = vi.fn(async () => true);
  const opened: string[] = [];
  const self = {
    location: new URL(origin),
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined, matchAll: async () => [], openWindow: async (url: string) => void opened.push(url) },
    registration: {
      pushManager: { getSubscription: async () => ({ unsubscribe }) },
      showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }),
    },
  };
  vm.runInNewContext(readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8'), {
    self,
    caches,
    fetch: (req: { url: string }) => network(req),
    URL,
    Promise,
    console,
  });

  async function dispatch(type: string, extra: Record<string, unknown>) {
    const waits: Array<Promise<unknown>> = [];
    let responded: Promise<Response> | undefined;
    handlers.get(type)!({ ...extra, waitUntil: (p: Promise<unknown>) => waits.push(p), respondWith: (p: Promise<Response>) => (responded = p) });
    const response = responded ? await responded : undefined;
    await Promise.all(waits);
    return response;
  }
  const request = (url: string, init: { method?: string; mode?: string; headers?: Record<string, string> } = {}) => ({
    url: new URL(url, origin).href,
    method: init.method ?? 'GET',
    mode: init.mode ?? 'no-cors',
    headers: new Headers(init.headers),
  });
  return {
    stores,
    shown,
    opened,
    unsubscribe,
    setNetwork: (fn: typeof network) => (network = fn),
    install: () => dispatch('install', {}),
    navigate: (url: string) => dispatch('fetch', { request: request(url, { mode: 'navigate' }) }),
    get: (url: string, headers?: Record<string, string>) => dispatch('fetch', { request: request(url, { headers }) }),
    post: (url: string) => dispatch('fetch', { request: request(url, { method: 'POST' }) }),
    push: (data: unknown) => dispatch('push', { data: { json: () => data, text: () => JSON.stringify(data) } }),
    click: (url: string) => dispatch('notificationclick', { notification: { data: { url }, close: () => undefined } }),
  };
}

function page(text: string, init: { headers?: Record<string, string>; redirected?: boolean; status?: number } = {}) {
  const response = new Response(text, { status: init.status ?? 200, headers: { 'content-type': 'text/html', ...init.headers } });
  Object.defineProperty(response, 'type', { value: 'basic' });
  Object.defineProperty(response, 'redirected', { value: init.redirected ?? false });
  return response;
}

describe('service worker', () => {
  it('pages : réseau d’abord, la dernière version vue hors ligne, sinon la page hors ligne', async () => {
    const sw = serviceWorkerHarness();
    await sw.install();
    expect(await (await sw.navigate('/app/recap'))!.text()).toBe('réseau');
    sw.setNetwork(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await (await sw.navigate('/app/recap'))!.text()).toBe('réseau');
    expect(await (await sw.navigate('/app/jamais-vue'))!.text()).toBe('précache /hors-ligne');
  });

  it('ne garde ni redirection, ni admin, ni API ; ressources statiques immuables seulement', async () => {
    const sw = serviceWorkerHarness();
    sw.setNetwork(async (req) => (req.url.endsWith('/app') ? page('connexion', { redirected: true }) : page(`réseau ${new URL(req.url).pathname}`)));
    await sw.navigate('/app');
    await sw.navigate('/admin');
    expect([...(sw.stores.get('pages-v1')?.keys() ?? [])]).toEqual([]);

    sw.setNetwork(async (req) => page('js', { headers: { 'cache-control': req.url.includes('immuable') ? 'public, max-age=31536000, immutable' : 'no-store' } }));
    await sw.get('/_next/static/chunks/immuable.js');
    await sw.get('/_next/static/chunks/dev.js');
    await sw.get('/api/push/abonnement');
    await sw.get('/app?_rsc=1', { RSC: '1' });
    expect([...(sw.stores.get('static-v1')?.keys() ?? [])]).toEqual(['https://app.exemple.fr/_next/static/chunks/immuable.js']);
  });

  it('déconnexion : pages effacées et abonnement push de l’appareil résilié', async () => {
    const sw = serviceWorkerHarness();
    await sw.navigate('/app');
    expect(sw.stores.get('pages-v1')?.size).toBe(1);
    await sw.post('/auth/deconnexion');
    expect(sw.stores.has('pages-v1')).toBe(false);
    expect(sw.unsubscribe).toHaveBeenCalled();
  });

  it('affiche la notification reçue et ouvre la bonne page du site au clic', async () => {
    const sw = serviceWorkerHarness();
    await sw.push({ title: 'Ton récap du matin est prêt', body: 'N°1 : Sérum', url: 'https://app.exemple.fr/app/recap', tag: 'recap' });
    expect(sw.shown[0]).toMatchObject({ title: 'Ton récap du matin est prêt', options: { body: 'N°1 : Sérum', lang: 'fr', tag: 'recap', data: { url: 'https://app.exemple.fr/app/recap' } } });
    await sw.click('https://app.exemple.fr/app/recap');
    await sw.click('https://pirate.exemple/phishing');
    expect(sw.opened).toEqual(['https://app.exemple.fr/app/recap', 'https://app.exemple.fr/app/notifications']);
  });
});

describe('Web Push : chiffrement (RFC 8291) et VAPID (RFC 8292)', () => {
  it('le navigateur déchiffre le message ; en-tête aes128gcm conforme', () => {
    const ua = createECDH('prime256v1');
    ua.generateKeys();
    const auth = randomBytes(16);
    const message = Buffer.from(JSON.stringify({ title: 'Alerte', body: 'Sérum éclat : +52 %' }));
    const body = encryptPushPayload(message, ua.getPublicKey(), auth);
    expect(body.readUInt32BE(16)).toBe(4096);
    expect(body.readUInt8(20)).toBe(65);
    expect(body[21]).toBe(0x04);
    expect(decryptAsBrowser(body, ua, auth).equals(message)).toBe(true);
    // Deux envois du même message ne se ressemblent pas (sel et clé éphémère neufs).
    expect(encryptPushPayload(message, ua.getPublicKey(), auth).equals(body)).toBe(false);
    expect(() => encryptPushPayload(Buffer.alloc(MAX_PLAINTEXT + 1), ua.getPublicKey(), auth)).toThrow(/trop long/);
  });

  it('jeton VAPID signé ES256, audience = origine du service de push, 24 h au plus', () => {
    const keys = vapidKeys();
    const now = new Date('2026-11-12T10:00:00Z');
    const jwt = vapidJwt('https://fcm.googleapis.com/fcm/send/abc:def', keys, now);
    const [header, claims, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    const payload = JSON.parse(Buffer.from(claims, 'base64url').toString());
    expect(payload).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'mailto:contact@exemple.fr' });
    expect(payload.exp - now.getTime() / 1000).toBeLessThanOrEqual(24 * 3600);
    const pub = Buffer.from(keys.publicKey, 'base64url');
    const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
    expect(verify('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
    expect(vapidAuthorization('https://fcm.googleapis.com/x', keys, now)).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${keys.publicKey}$`));
  });

  it('requête au service de push : TTL, aes128gcm, VAPID ; 410 = abonnement à supprimer', async () => {
    const ua = createECDH('prime256v1');
    ua.generateKeys();
    const target = { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc', keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const ok = await sendWebPush(target, { title: 'Test', body: 'Bonjour', url: '/app' }, {
      config: vapidKeys(),
      fetchImpl: async (url, init) => (calls.push({ url, headers: init.headers }), { status: 201 }),
    });
    expect(ok).toEqual({ ok: true, status: 201, gone: false });
    expect(calls[0].url).toBe(target.endpoint);
    expect(calls[0].headers).toMatchObject({ TTL: '86400', 'Content-Encoding': 'aes128gcm', Urgency: 'normal' });
    expect(calls[0].headers.Authorization).toMatch(/^vapid t=/);
    const gone = await sendWebPush(target, { title: 'x', body: 'y', url: '/' }, { config: vapidKeys(), fetchImpl: async () => ({ status: 410 }) });
    expect(gone).toEqual({ ok: false, status: 410, gone: true });
  });

  it('clés VAPID : sans clés le push est inactif, des clés mal formées sont signalées', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    vi.stubEnv('VAPID_SUBJECT', '');
    expect(isPushConfigured()).toBe(false);
    expect(vapidProblems()).toEqual([]);
    vi.stubEnv('VAPID_PUBLIC_KEY', 'abc');
    vi.stubEnv('VAPID_SUBJECT', 'contact@exemple.fr');
    expect(vapidProblems()).toHaveLength(3);
    const keys = vapidKeys();
    vi.stubEnv('VAPID_PUBLIC_KEY', keys.publicKey);
    vi.stubEnv('VAPID_PRIVATE_KEY', keys.privateKey);
    vi.stubEnv('VAPID_SUBJECT', keys.subject);
    expect(isPushConfigured()).toBe(true);
  });
});

describe('abonnements push', () => {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const subscription = (endpoint: string) => ({ endpoint, expirationTime: null, keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } });

  it('n’accepte que les services de push des navigateurs et des clés valides', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/QK')).toBe(true);
    expect(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.pirate.fr/x')).toBe(false);
    expect(parseSubscription(subscription('https://intranet.local/x'))).toMatchObject({ ok: false });
    expect(parseSubscription({ ...subscription('https://fcm.googleapis.com/x'), keys: { p256dh: 'abc', auth: 'abc' } })).toMatchObject({ ok: false });
    expect(parseSubscription(subscription('https://fcm.googleapis.com/x'))).toMatchObject({ ok: true });
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36')).toBe('Chrome sur Android');
  });

  it('une adresse = un seul compte (appareil partagé), abonnement expiré supprimé à l’envoi', async () => {
    const parsed = parseSubscription(subscription('https://fcm.googleapis.com/fcm/send/partage'));
    if (!parsed.ok) throw new Error('abonnement refusé');
    await savePushSubscription('alice', parsed.value, null, repo);
    await savePushSubscription('bob', parsed.value, null, repo);
    expect(await listPushSubscriptions('alice', repo)).toHaveLength(0);
    expect(await listPushSubscriptions('bob', repo)).toHaveLength(1);

    const sent: string[] = [];
    const delivered = await webPushSender('bob', { title: 'T', body: 'B', url: '/app' }, repo, async (target) => {
      sent.push(target.endpoint);
      return { ok: false, status: 410, gone: true };
    });
    expect(delivered).toBe(false);
    expect(sent).toEqual(['https://fcm.googleapis.com/fcm/send/partage']);
    expect(await listPushSubscriptions('bob', repo)).toHaveLength(0);
  });

  it('sendPush passe par Web Push dès que les clés VAPID sont là', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    expect(await sendPush('x', { title: 'T', body: 'B', url: '/' })).toBe(false);
    const fake = vi.fn(async () => true);
    registerPushSender(fake);
    expect(await sendPush('x', { title: 'T', body: 'B', url: '/' })).toBe(true);
    expect(fake).toHaveBeenCalledWith('x', { title: 'T', body: 'B', url: '/' });
  });
});

describe('centre de notifications', () => {
  it('non lues, ouverture (marquée lue, chemin interne seulement), groupes, ménage', async () => {
    await repo.ensureProfile({ id: 'u', email: 'u@test.fr' });
    const now = new Date();
    await notify('u', { type: 'alerte', title: 'Alerte', body: '2 produits', path: '/app?alerte=1' }, repo);
    await notify('u', { type: 'baisse', title: 'Baisse', body: 'Sérum', path: '//pirate.fr' }, repo);
    expect(await countUnreadNotifications('u', repo)).toBe(2);
    const records = await repo.listRecords<{ title: string }>('u', 'notification');
    const alerte = records.find((r) => r.data.title === 'Alerte')!;
    const baisse = records.find((r) => r.data.title === 'Baisse')!;
    expect(await openNotification('u', alerte.id, repo)).toBe('/app?alerte=1');
    expect(await openNotification('u', baisse.id, repo)).toBe('/app/notifications');
    expect(await openNotification('autre', alerte.id, repo)).toBeNull();
    expect(await countUnreadNotifications('u', repo)).toBe(0);
    expect(safePath('https://pirate.fr')).toBe('/app/notifications');

    const old = { ...alerte, created_at: new Date(now.getTime() - 10 * 86_400_000).toISOString() };
    expect(groupNotifications([old, baisse as never], now).map((g) => g.label)).toEqual(['Aujourd’hui', 'Plus ancien']);
    expect(await pruneNotifications(repo, new Date(now.getTime() + 61 * 86_400_000))).toBe(2);
  });
});
