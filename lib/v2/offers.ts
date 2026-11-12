import { z } from 'zod';
import { askStructured } from '@/lib/ai/structured';
import type { Product } from '@/lib/db/types';
import { NICHE_IDS, nicheLabel, type NicheId } from '@/lib/niches';

/**
 * Tri des propositions de marques : l'IA lit le message (marque, produit, commission, échantillon, conditions) ;
 * la note sur 100 et la contre-proposition sont calculées par le code, à partir des produits du radar de la même
 * niche, jamais inventées par l'IA. Aucune promesse de ventes dans les réponses.
 */
export const OfferExtractionSchema = z.object({
  brand: z.string().nullable(),
  product: z.string().nullable(),
  niche: z.enum(NICHE_IDS as unknown as [NicheId, ...NicheId[]]).nullable(),
  /** Commission en pourcentage du prix (15 = 15 %), null si absente. */
  commission_percent: z.number().nullable(),
  /** Rémunération fixe proposée, en euros, null si absente. */
  fixed_fee_euros: z.number().nullable(),
  free_sample: z.boolean().nullable(),
  sample_refundable: z.boolean().nullable(),
  exclusivity: z.boolean().nullable(),
  /** Délai demandé pour publier, en jours, null s'il n'y en a pas. */
  deadline_days: z.number().int().nullable(),
  conditions: z.array(z.string()).max(8),
});
export type OfferExtraction = z.infer<typeof OfferExtractionSchema>;

export const OfferRepliesSchema = z.object({
  accepter: z.string(),
  negocier: z.string(),
  refuser: z.string(),
});
export type OfferReplies = z.infer<typeof OfferRepliesSchema>;

export interface OfferScore {
  score: number;
  /** Commission médiane des produits du radar dans la niche, en pourcentage. */
  nicheMedianPercent: number | null;
  /** Contre-proposition chiffrée (commission en %), null si l'offre est déjà au niveau. */
  counterPercent: number | null;
  reasons: Array<{ tone: 'gain' | 'rose' | 'neutral'; text: string }>;
}

export type OfferStatus = 'nouvelle' | 'acceptee' | 'negociee' | 'refusee';

export interface OfferData {
  text: string;
  extracted: OfferExtraction;
  score: OfferScore;
  replies: OfferReplies;
  status: OfferStatus;
  simulated: boolean;
}

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Note sur 100 : commission comparée au radar de la niche (60 points), échantillon, fixe, conditions. */
export function scoreOffer(offer: OfferExtraction, radar: Pick<Product, 'niche' | 'commission_rate'>[]): OfferScore {
  const pool = radar.filter((p) => !offer.niche || p.niche === offer.niche).map((p) => p.commission_rate * 100);
  const med = median(pool);
  const reasons: OfferScore['reasons'] = [];
  let score = 0;
  if (offer.commission_percent !== null && pool.length) {
    const below = pool.filter((c) => c < offer.commission_percent!).length / pool.length;
    score += Math.round(below * 60);
    const where = offer.niche ? `en ${nicheLabel(offer.niche).toLowerCase()}` : 'dans le radar';
    if (med !== null && offer.commission_percent < med) {
      reasons.push({ tone: 'rose', text: `Commission de ${fmt(offer.commission_percent)} % : sous la médiane des produits ${where} (${fmt(med)} %).` });
    } else {
      reasons.push({ tone: 'gain', text: `Commission de ${fmt(offer.commission_percent)} % : au-dessus de ${Math.round(below * 100)} % des produits ${where}.` });
    }
  } else if (offer.commission_percent === null) {
    reasons.push({ tone: 'neutral', text: 'Aucune commission indiquée : demande-la avant de répondre.' });
    score += 20;
  } else {
    score += 30;
  }
  if (offer.fixed_fee_euros && offer.fixed_fee_euros > 0) {
    score += 15;
    reasons.push({ tone: 'gain', text: `Rémunération fixe de ${fmt(offer.fixed_fee_euros)} € en plus de la commission.` });
  }
  if (offer.free_sample === true && offer.sample_refundable !== true) {
    score += 15;
    reasons.push({ tone: 'gain', text: 'Échantillon offert : tu peux tester avant de filmer.' });
  } else if (offer.sample_refundable === true) {
    score -= 10;
    reasons.push({ tone: 'rose', text: 'Échantillon remboursable : tu avances l’argent, vérifie les conditions de remboursement.' });
  } else if (offer.free_sample === false) {
    reasons.push({ tone: 'rose', text: 'Pas d’échantillon offert : il faudrait acheter le produit pour le filmer.' });
  }
  if (offer.exclusivity === true) {
    score -= 15;
    reasons.push({ tone: 'rose', text: 'Exclusivité demandée : tu ne pourrais plus promouvoir de concurrents pendant la durée.' });
  }
  if (offer.deadline_days !== null && offer.deadline_days < 7) {
    score -= 10;
    reasons.push({ tone: 'rose', text: `Délai court (${offer.deadline_days} jour${offer.deadline_days > 1 ? 's' : ''}) pour publier.` });
  }
  score += 10; // base : la marque t'a contacté
  const counter =
    med !== null && (offer.commission_percent === null || offer.commission_percent < med)
      ? Math.ceil(Math.max(med, (offer.commission_percent ?? 0) + 5))
      : null;
  return { score: Math.max(0, Math.min(100, score)), nicheMedianPercent: med === null ? null : Math.round(med * 10) / 10, counterPercent: counter, reasons };
}

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

const SYSTEM = `Tu aides un créateur affilié TikTok Shop français à trier les propositions de marques. Tu écris en
français, au tutoiement quand tu t'adresses au créateur, en vouvoyant la marque dans les réponses. Tu ne promets jamais
de ventes ni de résultats. Tu n'inventes aucune information absente du message.`;

/** Lecture du message (simulée sans clé : quelques motifs simples). */
export async function extractOffer(text: string) {
  return askStructured({
    name: 'proposition_marque',
    schema: OfferExtractionSchema,
    system: SYSTEM,
    prompt: `Extrais les informations de cette proposition reçue par un créateur. Champ inconnu : null.\n\n---\n${text.slice(0, 6000)}\n---`,
    maxTokens: 2000,
    simulate: () => simulateExtraction(text),
  });
}

export function simulateExtraction(text: string): OfferExtraction {
  const lower = text.toLowerCase();
  const commission = /(\d{1,2}(?:[.,]\d)?)\s?%/.exec(text);
  const fee = /(\d{2,5})\s?(?:€|euros)/i.exec(text);
  const days = /(\d{1,2})\s?jours?/i.exec(text);
  const brand = /(?:marque|de la part de|chez)\s+([A-Z][\w&'-]+)/.exec(text)?.[1] ?? null;
  const niche = NICHE_IDS.find((n) => lower.includes(n === 'beaute' ? 'beauté' : n)) ?? null;
  return {
    brand,
    product: null,
    niche,
    commission_percent: commission ? Number(commission[1].replace(',', '.')) : null,
    fixed_fee_euros: fee ? Number(fee[1]) : null,
    free_sample: /échantillon|sample|offert/.test(lower) ? !/rembours/.test(lower) || null : null,
    sample_refundable: /rembours/.test(lower) ? true : null,
    exclusivity: /exclusiv/.test(lower) ? true : null,
    deadline_days: days ? Number(days[1]) : null,
    conditions: [],
  };
}

export async function writeReplies(offer: OfferExtraction, score: OfferScore, firstName: string | null) {
  const facts = [
    `Marque : ${offer.brand ?? 'non précisée'}`,
    `Produit : ${offer.product ?? 'non précisé'}`,
    `Commission proposée : ${offer.commission_percent === null ? 'non précisée' : `${fmt(offer.commission_percent)} %`}`,
    `Contre-proposition à faire : ${score.counterPercent === null ? 'aucune, l’offre est au niveau du marché' : `${score.counterPercent} % de commission`}`,
    `Échantillon : ${offer.free_sample === null ? 'non précisé' : offer.free_sample ? 'offert' : 'non offert'}${offer.sample_refundable ? ' (remboursable)' : ''}`,
    `Exclusivité : ${offer.exclusivity ? 'oui' : 'non précisée'}`,
    `Délai : ${offer.deadline_days === null ? 'non précisé' : `${offer.deadline_days} jours`}`,
  ].join('\n');
  return askStructured({
    name: 'reponses_marque',
    schema: OfferRepliesSchema,
    system: SYSTEM,
    prompt: `Écris trois réponses courtes (4 à 6 phrases), prêtes à envoyer à la marque, signées ${firstName ?? 'le créateur'} :
- accepter : accepte en confirmant les conditions et demande l'échantillon et les prochaines étapes ;
- negocier : remercie, puis propose exactement la contre-proposition chiffrée ci-dessous${score.counterPercent === null ? ' (s’il n’y en a pas, demande un échantillon offert ou un délai plus souple)' : ''} ;
- refuser : refuse poliment, sans fermer la porte.
Faits :\n${facts}`,
    maxTokens: 2500,
    simulate: () => simulateReplies(offer, score, firstName),
  });
}

export function simulateReplies(offer: OfferExtraction, score: OfferScore, firstName: string | null): OfferReplies {
  const brand = offer.brand ?? 'votre marque';
  const sign = `\n\n${firstName ?? 'Bien à vous'}`;
  const counter = score.counterPercent !== null ? `une commission de ${score.counterPercent} %` : 'un échantillon offert et un délai de deux semaines';
  return {
    accepter: `Bonjour,\n\nMerci pour votre proposition, je suis partant pour présenter le produit de ${brand}. Pouvez-vous m’envoyer l’échantillon et les prochaines étapes ?${sign}`,
    negocier: `Bonjour,\n\nMerci pour votre proposition, le produit de ${brand} m’intéresse. Pour que je m’y consacre pleinement, je vous propose ${counter}. Si cela vous convient, je m’y mets dès réception de l’échantillon.${sign}`,
    refuser: `Bonjour,\n\nMerci d’avoir pensé à moi. Cette collaboration ne correspond pas à mon contenu pour le moment, mais n’hésitez pas à revenir vers moi pour un prochain produit.${sign}`,
  };
}

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  nouvelle: 'À traiter',
  acceptee: 'Acceptée',
  negociee: 'En négociation',
  refusee: 'Refusée',
};

