import { render } from '@react-email/render';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { emailImageUrl, MorningDigestEmail } from '@/emails/morning-digest';
import type { PersonalDigestContent } from '@/lib/digest/personal';
import { digestSubject } from '@/lib/digest/deliver';
import type { Digest } from '@/lib/db/types';

const LONG = 'Sérum visage à la vitamine C 30 ml hydratant éclat anti-taches pour tous types de peau, flacon pipette';

const content: PersonalDigestContent = {
  date: '2026-11-14',
  first_name: 'Inès',
  plan: 'pro',
  products: [
    {
      id: 'p1',
      name: LONG,
      image_url: 'https://agent-files.linkfox.com/tiktok/20261112/1.jpg',
      niche: 'beaute',
      price_cents: 1990,
      commission_cents: 358,
      score: 82,
      trend: 'explose',
      growth_7d: 0.64,
      reason: '',
    },
    {
      id: 'p2',
      name: 'Tapis de sol pliable',
      image_url: '/api/produit-image/p2',
      niche: 'sport',
      price_cents: 2490,
      commission_cents: 299,
      score: 61,
      trend: 'baisse',
      growth_7d: -0.22,
      reason: '',
    },
  ],
  hook: { product_id: 'p1', product_name: LONG, text: 'Regarde cette texture.' },
  script: null,
  locked_count: 0,
  personal: {
    challenge: { kind: 'premiere', text: 'Tourne une vidéo sur Sérum éclat', detail: 'Le n°1 de tes produits du jour.', path: '/app/studio?produit=p1', product_id: 'p1' },
    alerts: [],
    alerts_total: 0,
    drops: [],
    drops_total: 0,
  },
};

describe('e-mail du récap du matin', () => {
  it('garde seulement les vraies photos (https, pas le visuel SVG de repli)', () => {
    expect(emailImageUrl('https://agent-files.linkfox.com/a.jpg')).toBe('https://agent-files.linkfox.com/a.jpg');
    expect(emailImageUrl('/api/produit-image/p2')).toBeNull();
    expect(emailImageUrl('https://tracktout.com/api/produit-image/p2?niche=sport')).toBeNull();
    expect(emailImageUrl('https://exemple.fr/visuel.svg')).toBeNull();
    expect(emailImageUrl(null)).toBeNull();
  });

  it('montre le défi, puis chaque produit avec photo ou vignette, nom court, score, commission et tendance', async () => {
    const html = await render(createElement(MorningDigestEmail, { content, siteUrl: 'https://tracktout.com' }));
    expect(html).toContain('Défi du jour');
    expect(html).toContain('https://agent-files.linkfox.com/tiktok/20261112/1.jpg');
    expect(html).not.toContain('/api/produit-image/');
    expect(html).toContain('🏋️');
    expect(html).not.toContain(LONG);
    expect(html).toContain('3,58');
    expect(html).toContain('par vente');
    expect(html).toContain('82');
    expect(html).toContain('Explose');
    expect(html).toContain('Baisse');
    expect(html).toContain('https://tracktout.com/app/radar');
    // Le défi passe avant les produits.
    expect(html.indexOf('Défi du jour')).toBeLessThan(html.indexOf('Tapis de sol pliable'));
  });

  it('donne un objet avec le nom court', () => {
    const subject = digestSubject({ content } as unknown as Digest);
    expect(subject.startsWith('Ton n°1 du jour : ')).toBe(true);
    expect(subject).not.toContain(LONG);
    expect(subject.length).toBeLessThan(80);
  });
});
