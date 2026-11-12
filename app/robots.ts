import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app', '/formateur', '/admin', '/bienvenue', '/api', '/auth'] },
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
