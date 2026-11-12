import type { MetadataRoute } from 'next';
import { webManifest } from '@/lib/pwa';

/** Manifeste de l'appli installable, servi par Next sur /manifest.webmanifest (lien ajouté à chaque page). */
export default function manifest(): MetadataRoute.Manifest {
  return webManifest();
}
