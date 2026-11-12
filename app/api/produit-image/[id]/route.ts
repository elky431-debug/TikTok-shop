import { isNicheId } from '@/lib/niches';
import { productImageSvg } from '@/lib/product-image';

/**
 * Visuel générique d'un produit (aucune image externe) : image des produits fictifs, et repli quand l'image
 * d'un fournisseur manque ou ne charge pas. La niche vient de `?niche=`, sinon de l'identifiant fictif.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const niche = new URL(request.url).searchParams.get('niche') ?? params.id.split('-')[1];
  const svg = productImageSvg(params.id, isNicheId(niche) ? niche : 'maison');
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
