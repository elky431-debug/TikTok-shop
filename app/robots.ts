import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

/** Espaces privés et liens de redirection (/r/) hors des moteurs ; pages publiques et /tendances ouvertes. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app', '/formateur', '/admin', '/bienvenue', '/abonnement', '/api', '/auth', '/r/'] },
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
