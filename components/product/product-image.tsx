'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Image produit. Les images des fournisseurs passent par next/image (domaines autorisés dans next.config) ;
 * si l'une ne charge pas, ou s'il n'y en a pas, le visuel SVG générique de la niche prend sa place.
 */
export function ProductImage({
  src,
  fallback,
  alt,
  className,
}: {
  src: string;
  /** Visuel SVG local de repli (/api/produit-image/…). */
  fallback: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  // self-start + h-auto : dans une rangée flex, un long titre ne doit pas étirer l'image en hauteur.
  const classes = cn('aspect-square h-auto shrink-0 self-start rounded-xl bg-surface object-cover', className);
  const remote = Boolean(src) && !src.startsWith('/') && !failed;
  if (remote) {
    return <Image src={src} alt={alt} width={256} height={256} sizes="128px" className={classes} onError={() => setFailed(true)} />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- SVG locaux générés, pas d'optimisation utile
  return <img src={src && src.startsWith('/') && !failed ? src : fallback} alt={alt} loading="lazy" decoding="async" className={classes} />;
}
