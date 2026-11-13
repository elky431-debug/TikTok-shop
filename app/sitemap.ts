import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { getVeilleSelection, publishedNiches } from '@/lib/tendances';

/**
 * Plan du site : pages publiques fixes, plus les pages /tendances publiées (catégories avec assez de vrais produits).
 * Une catégorie vide ou fictive n'y figure jamais ; l'index /tendances seulement s'il a au moins une catégorie.
 * Les pages co-brandées /f/[code] n'y sont pas (non indexées).
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = ['', '/prix', '/formateurs', '/mentions-legales', '/cgv', '/confidentialite'].map((path) => ({
    url: `${env.siteUrl}${path}`,
    changeFrequency: path === '' ? 'daily' : 'monthly',
  }));
  const selection = await getVeilleSelection().catch(() => null);
  const niches = selection ? publishedNiches(selection) : [];
  if (!selection?.date || !niches.length) return pages;
  const lastModified = new Date(`${selection.date}T06:00:00Z`);
  return [
    ...pages,
    { url: `${env.siteUrl}/tendances`, changeFrequency: 'daily', lastModified },
    ...niches.map((n) => ({ url: `${env.siteUrl}/tendances/${n.id}`, changeFrequency: 'daily' as const, lastModified })),
  ];
}
