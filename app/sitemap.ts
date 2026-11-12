import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/prix', '/formateurs', '/mentions-legales', '/cgv', '/confidentialite'].map((path) => ({
    url: `${env.siteUrl}${path}`,
    changeFrequency: path === '' ? 'daily' : 'monthly',
  }));
}
