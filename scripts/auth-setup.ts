/**
 * Règle l'authentification du projet Supabase par son API de gestion (PATCH /v1/projects/{ref}/config/auth,
 * spécification officielle supabase/supabase, apps/docs/spec/api_v1_openapi.json) :
 *  - toujours : adresse du site, adresses de retour autorisées, sujet et modèle français du lien magique ;
 *  - avec RESEND_API_KEY et EMAIL_FROM : envoi des e-mails de connexion par le SMTP de Resend (doc Resend :
 *    smtp.resend.com, port 465, utilisateur « resend », mot de passe = clé d'API) ;
 *  - avec GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET : connexion Google.
 * Usage : npm run auth:setup   (SUPABASE_ACCESS_TOKEN, NEXT_PUBLIC_SUPABASE_URL ; jamais de valeur secrète affichée)
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const read = (name: string) => (process.env[name] ?? '').trim();

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** « Tracktout <bonjour@domaine.fr> » → bonjour@domaine.fr */
export function senderAddress(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1]?.trim() ?? from.trim();
}

export function magicLinkTemplate(brand: string): string {
  return [
    `<h2>Ton lien de connexion ${brand}</h2>`,
    '<p>Appuie sur le bouton pour te connecter. Le lien expire dans une heure et ne sert qu’une fois.</p>',
    '<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">Me connecter</a></p>',
    '<p>Tu n’as rien demandé ? Ignore cet e-mail : personne ne peut se connecter sans ce lien.</p>',
  ].join('\n');
}

export function authConfigPatch(input: {
  brand: string;
  siteUrl: string;
  resendKey?: string;
  emailFrom?: string;
  googleId?: string;
  googleSecret?: string;
}): Record<string, unknown> {
  const site = input.siteUrl.replace(/\/$/, '');
  const allow = [`${site}/auth/callback**`, 'http://localhost:3000/auth/callback**'];
  const patch: Record<string, unknown> = {
    site_url: site,
    uri_allow_list: [...new Set(allow)].join(','),
    mailer_subjects_magic_link: `Ton lien de connexion ${input.brand}`,
    mailer_templates_magic_link_content: magicLinkTemplate(input.brand),
  };
  if (input.resendKey && input.emailFrom) {
    Object.assign(patch, {
      smtp_host: 'smtp.resend.com',
      smtp_port: '465',
      smtp_user: 'resend',
      smtp_pass: input.resendKey,
      smtp_admin_email: senderAddress(input.emailFrom),
      smtp_sender_name: input.brand,
    });
  }
  if (input.googleId && input.googleSecret) {
    Object.assign(patch, {
      external_google_enabled: true,
      external_google_client_id: input.googleId,
      external_google_secret: input.googleSecret,
    });
  }
  return patch;
}

async function main() {
  const { BRAND } = await import('@/lib/brand');
  const ref = /^https:\/\/([a-z0-9]{20})\.supabase\.co/.exec(read('NEXT_PUBLIC_SUPABASE_URL'))?.[1];
  if (!ref) fail('NEXT_PUBLIC_SUPABASE_URL doit être de la forme https://<ref>.supabase.co.');
  if (!read('SUPABASE_ACCESS_TOKEN')) fail('SUPABASE_ACCESS_TOKEN manquant (supabase.com → Account → Access Tokens).');
  const siteUrl = read('NEXT_PUBLIC_SITE_URL') || 'http://localhost:3000';
  const patch = authConfigPatch({
    brand: BRAND,
    siteUrl,
    resendKey: read('RESEND_API_KEY'),
    emailFrom: read('EMAIL_FROM'),
    googleId: read('GOOGLE_CLIENT_ID'),
    googleSecret: read('GOOGLE_CLIENT_SECRET'),
  });
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${read('SUPABASE_ACCESS_TOKEN')}`, 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) fail(`API de gestion Supabase : HTTP ${response.status} — ${(await response.text()).slice(0, 300)}`);
  console.log(`✓ Adresse du site : ${siteUrl} ; retours autorisés : ${String(patch.uri_allow_list)}`);
  console.log('✓ Lien magique : sujet et modèle en français (lien token_hash vers /auth/callback)');
  console.log(patch.smtp_host ? '✓ SMTP : Resend (smtp.resend.com:465)' : '· SMTP : celui de Supabase (RESEND_API_KEY ou EMAIL_FROM absent)');
  console.log(patch.external_google_enabled ? '✓ Google : activé' : '· Google : non activé (GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET absent)');
}

if (process.argv[1]?.includes('auth-setup')) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
