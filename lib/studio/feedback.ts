import { isClean } from '@/lib/ai/guard';
import type { Feedback, FeedbackExample } from '@/lib/ai/types';
import type { StudioDoc } from './types';

/**
 * Retours de l'utilisateur réutilisés à la génération suivante : ses scripts notés 4 ou 5 sur 5, ou qui ont vendu,
 * entrent dans le prompt comme exemples (3 au plus : ceux qui ont vendu d'abord, puis les mieux notés, puis les plus
 * récents) ; ceux notés 1 ou 2 sont cités comme « à ne pas refaire ».
 */
export const FEEDBACK_EXAMPLES = 3;

const cut = (text: string, max = 110) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export function collectFeedback(docs: Array<Pick<StudioDoc, 'scripts' | 'ratings' | 'format'>>, max = FEEDBACK_EXAMPLES): Feedback {
  const good: Array<FeedbackExample & { score: number; at: string }> = [];
  const weak: Array<{ title: string; stars: number; at: string }> = [];
  for (const doc of docs) {
    doc.ratings.forEach((rating, i) => {
      const script = doc.scripts[i];
      if (!rating || !script) return;
      const sold = rating.sold === 'oui';
      if (sold || (rating.stars ?? 0) >= 4) {
        const lines = script.shots.slice(1, 4).map((s) => cut(s.voice)).filter(isClean);
        const hook = script.shots[0]?.voice ?? '';
        if (!isClean(hook) || !isClean(script.title)) return;
        good.push({ title: script.title, format: doc.format, stars: rating.stars, sold, hook: cut(hook, 80), lines, score: (sold ? 100 : 0) + (rating.stars ?? 0) * 10, at: rating.at });
      } else if (rating.stars !== null && rating.stars <= 2) {
        weak.push({ title: script.title, stars: rating.stars, at: rating.at });
      }
    });
  }
  return {
    best: good
      .sort((a, b) => b.score - a.score || b.at.localeCompare(a.at))
      .slice(0, max)
      .map(({ score: _s, at: _a, ...ex }) => ex),
    weak: weak
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 3)
      .map(({ at: _a, ...w }) => w),
  };
}
