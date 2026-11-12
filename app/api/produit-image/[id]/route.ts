import { isNicheId } from '@/lib/niches';
import { productImageSvg } from '@/lib/product-image';

/** Visuel générique d'un produit fictif (aucune image externe). L'identifiant contient la niche. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const niche = params.id.split('-')[1];
  const svg = productImageSvg(params.id, isNicheId(niche) ? niche : 'maison');
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
