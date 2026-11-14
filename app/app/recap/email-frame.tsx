'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * L'e-mail du récap, rendu tel qu'il part (même HTML), dans un cadre isolé de la page : ses styles ne débordent pas
 * sur l'appli et inversement. La hauteur suit le contenu ; les liens s'ouvrent dans la page entière.
 */
export function EmailFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(900);

  const fit = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (!doc?.documentElement) return;
    setHeight(Math.max(320, Math.ceil(doc.documentElement.scrollHeight)));
  }, []);

  const loaded = useCallback(() => {
    fit();
    // Les images arrivent après le chargement : on réajuste une fois qu'elles sont là.
    ref.current?.contentDocument?.querySelectorAll('img').forEach((img) => img.addEventListener('load', fit, { once: true }));
  }, [fit]);

  useEffect(() => {
    // Le cadre a souvent fini de charger avant que la page soit interactive : on ajuste aussi au montage.
    if (ref.current?.contentDocument?.readyState === 'complete') loaded();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit, loaded]);

  // Les liens de l'e-mail ouvrent l'appli dans la page entière, pas dans le cadre.
  const srcDoc = html.replace('<head>', '<head><base target="_top">');

  return <iframe ref={ref} title={title} srcDoc={srcDoc} onLoad={loaded} className="block w-full border-0 bg-[#F1F1F2]" style={{ height }} />;
}
