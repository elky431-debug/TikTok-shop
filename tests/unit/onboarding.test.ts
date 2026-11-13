import { describe, expect, it } from 'vitest';
import { initialAnswers, ONBOARDING_STEPS, sanitizeAnswers, stepError, UPDATE_STEPS } from '@/lib/onboarding-steps';
import { personalPoints } from '@/lib/radar/personal';
import { DEFAULT_WEIGHTS } from '@/lib/radar/personal';
import type { Profile } from '@/lib/db/types';

const valid = sanitizeAnswers({
  first_name: ' Inès ',
  tiktok_handle: '@ines.teste',
  follower_range: '1000-5000',
  affiliate_status: 'oui',
  experience_level: 'debute',
  niches: ['beaute', 'beaute', 'maison', 'inconnue'],
  videos_per_week: '4-7',
  video_styles: ['mains', 'face_camera', 'danse'],
  monthly_goal_euros: '300',
  code: 'demo30',
});

describe('onboarding 2', () => {
  it('10 questions au premier passage, 6 nouvelles pour un compte existant', () => {
    expect(ONBOARDING_STEPS).toHaveLength(10);
    expect(UPDATE_STEPS).toEqual(['abonnes', 'affilie', 'niveau', 'rythme', 'styles', 'objectif']);
  });

  it('nettoie les réponses venues du navigateur', () => {
    expect(valid).toEqual({
      first_name: 'Inès',
      tiktok_handle: 'ines.teste',
      follower_range: '1000-5000',
      affiliate_status: 'oui',
      experience_level: 'debute',
      niches: ['beaute', 'maison'],
      videos_per_week: '4-7',
      video_styles: ['mains', 'face_camera'],
      monthly_goal_euros: 300,
      code: 'DEMO30',
    });
    for (const step of ONBOARDING_STEPS) expect(stepError(step, valid)).toBeNull();
  });

  it('refuse ce qui manque ou dépasse, accepte les questions facultatives passées', () => {
    expect(stepError('prenom', { ...valid, first_name: '' })).toMatch(/prénom/);
    expect(stepError('niches', { ...valid, niches: [] })).toMatch(/au moins une/);
    expect(stepError('niches', { ...valid, niches: ['beaute', 'maison', 'mode', 'tech'] })).toMatch(/Trois/);
    expect(stepError('styles', { ...valid, video_styles: [] })).toMatch(/au moins un style/);
    expect(stepError('abonnes', { ...valid, follower_range: '0-500' })).toMatch(/taille/); // ancienne tranche : à rechoisir
    expect(stepError('pseudo', { ...valid, tiktok_handle: 'deux mots' })).toMatch(/lettres/);
    expect(stepError('pseudo', { ...valid, tiktok_handle: '' })).toBeNull();
    expect(stepError('objectif', { ...valid, monthly_goal_euros: null })).toBeNull();
    expect(stepError('objectif', sanitizeAnswers({ ...valid, monthly_goal_euros: 'beaucoup' }))).toMatch(/montant/);
    expect(stepError('objectif', { ...valid, monthly_goal_euros: 200_000 })).toMatch(/montant/);
    expect(stepError('code', { ...valid, code: '' })).toBeNull();
  });

  it('reprend les réponses connues d’un compte existant, sans rien inventer', () => {
    const profile = {
      first_name: 'Léa',
      tiktok_handle: null,
      follower_range: '500-1500',
      affiliate_status: null,
      experience_level: null,
      niches: ['beaute', 'mode', 'tech', 'sport'],
      videos_per_week: null,
      video_styles: [],
      video_style: 'voix_off',
    } as unknown as Profile;
    expect(initialAnswers(profile, 45_000)).toMatchObject({
      first_name: 'Léa',
      follower_range: null,
      affiliate_status: null,
      niches: ['beaute', 'mode', 'tech'],
      video_styles: ['voix_off'],
      monthly_goal_euros: 450,
    });
  });

  it('score « pour toi » : le niveau et chacun des styles comptent', () => {
    const product = {
      niche: 'maison' as const,
      latest_breakdown: {
        parts: [
          { key: 'croissance', value: 0.5, available: true },
          { key: 'commission', value: 0.9, available: true },
          { key: 'saturation', value: 0.2, available: true },
          { key: 'prix', value: 0.9, available: true },
        ],
      },
    } as never;
    const base = { follower_range: '5000-20000', niches: ['maison'], video_style: 'face_camera' } as const;
    const faceOnly = personalPoints(product, { ...base, video_styles: ['face_camera'] } as never, DEFAULT_WEIGHTS)!;
    const withHands = personalPoints(product, { ...base, video_styles: ['face_camera', 'mains'] } as never, DEFAULT_WEIGHTS)!;
    expect(withHands - faceOnly).toBeCloseTo(5); // « mains » se prête à la maison
    const beginner = personalPoints(product, { ...base, experience_level: 'debute' } as never, DEFAULT_WEIGHTS)!;
    const regular = personalPoints(product, { ...base, experience_level: 'regulier' } as never, DEFAULT_WEIGHTS)!;
    expect(regular).toBeGreaterThan(beginner); // forte commission, forte saturation : mieux pour qui vend déjà
  });
});
