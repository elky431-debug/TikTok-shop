import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Teleprompter } from '@/components/studio/teleprompter';
import { initialMode, lineDuration, MAX_SPEED, MIN_SPEED, prompterLines, scrollSpeed } from '@/components/studio/teleprompter-model';

describe('point 7 · téléprompteur', () => {
  it('respecte « animations réduites » : une phrase à la fois au lieu du défilement continu', () => {
    expect(initialMode(true)).toBe('lines');
    expect(initialMode(false)).toBe('scroll');
  });

  it('vitesse réglable et bornée, rythme d’une phrase selon sa longueur', () => {
    expect(scrollSpeed(MIN_SPEED)).toBeLessThan(scrollSpeed(MAX_SPEED));
    expect(scrollSpeed(99)).toBe(scrollSpeed(MAX_SPEED));
    expect(scrollSpeed(-3)).toBe(scrollSpeed(MIN_SPEED));
    const sentence = 'Je te montre comment je l’utilise tous les matins, en vrai, sans montage.';
    expect(lineDuration(sentence, 2)).toBeGreaterThan(lineDuration(sentence, 8));
    expect(lineDuration('Stop.', 10)).toBe(1500);
  });

  it('lit ce que dit le créateur, plan par plan ; fermé, il n’affiche que son bouton', () => {
    expect(prompterLines([{ voice: ' Regarde ça. ' }, { voice: '' }, { voice: 'Panier orange.' }])).toEqual(['Regarde ça.', 'Panier orange.']);
    const html = renderToStaticMarkup(createElement(Teleprompter, { title: 'Script 1', lines: ['Regarde ça.'] }));
    expect(html).toContain('Téléprompteur');
    expect(html).not.toContain('role="dialog"');
  });
});
