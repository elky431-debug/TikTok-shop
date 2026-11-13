import { z } from 'zod';
import { findIssues } from '@/lib/ai/guard';
import { askStructured } from '@/lib/ai/structured';
import type { Repo } from '@/lib/db';
import type { FollowerRange, Product, Profile } from '@/lib/db/types';
import { NICHE_IDS, nicheLabel, type NicheId } from '@/lib/niches';
import { isPaidPlan } from '@/lib/plans';
import { AFFILIATE_THRESHOLD, eligibilityFor, videoStyleLabel } from '@/lib/profile-rules';
import { clamp, formatPercent } from '@/lib/utils';

/**
 * Mode préparation (comptes sous 1 500 abonnés, `eligibility === 'preparation'`) : choisir une niche à partir du radar
 * et de ses goûts, un plan de contenu de 30 jours pour grossir sans rien vendre, la liste de vérification de
 * l'affiliation, la courbe des abonnés saisis à la main, et le passage au mode affilié dès que le seuil est atteint.
 * Aucune promesse de résultat : des idées et un suivi, c'est tout.
 */
export const PREPARATION_KIND = 'preparation';
export const CONTENT_PLAN_KIND = 'plan_preparation';
/** Plans de 30 jours générés par jour (IA) : 1 en Gratuit, 3 en Pro et Pro+. */
export const CONTENT_PLANS_PER_DAY = { free: 1, paid: 3 } as const;
export const contentPlansPerDay = (profile: Pick<Profile, 'plan'>) => (isPaidPlan(profile.plan) ? CONTENT_PLANS_PER_DAY.paid : CONTENT_PLANS_PER_DAY.free);

export interface FollowerEntry {
  /** AAAA-MM-JJ */
  date: string;
  count: number;
}

export interface PreparationData {
  niche: NicheId | null;
  tastes: { niches: NicheId[]; about: string | null };
  checklist: Record<string, boolean>;
  followers: FollowerEntry[];
  /** Jour du passage au mode affilié (AAAA-MM-JJ). */
  switched_at: string | null;
}

export const emptyPreparation = (): PreparationData => ({ niche: null, tastes: { niches: [], about: null }, checklist: {}, followers: [], switched_at: null });

export async function getPreparation(repo: Repo, userId: string): Promise<{ id: string | null; data: PreparationData }> {
  const [record] = await repo.listRecords<PreparationData>(userId, PREPARATION_KIND);
  return { id: record?.id ?? null, data: record ? { ...emptyPreparation(), ...record.data } : emptyPreparation() };
}

export async function savePreparation(repo: Repo, userId: string, patch: Partial<PreparationData>) {
  const current = await getPreparation(repo, userId);
  return repo.saveRecord<PreparationData>(userId, PREPARATION_KIND, { ...current.data, ...patch }, current.id ?? undefined);
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. Choisir sa niche : radar + goûts
// ---------------------------------------------------------------------------------------------------------------------

export interface NicheStat {
  niche: NicheId;
  products: number;
  /** Produits qui montent ou explosent. */
  rising: number;
  /** Croissance moyenne sur 7 jours, produits mesurés seulement ; null si aucun. */
  avgGrowth: number | null;
  /** Commission médiane (0 à 1). */
  medianCommission: number | null;
}

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Chiffres de chaque niche dans le catalogue du jour. */
export function nicheStats(products: Product[]): NicheStat[] {
  return NICHE_IDS.map((niche) => {
    const pool = products.filter((p) => p.niche === niche);
    const measured = pool.filter((p) => p.latest_breakdown?.growth_7d !== null && p.latest_breakdown?.growth_7d !== undefined);
    return {
      niche,
      products: pool.length,
      rising: pool.filter((p) => p.trend === 'monte' || p.trend === 'explose').length,
      avgGrowth: measured.length ? measured.reduce((s, p) => s + p.growth_7d, 0) / measured.length : null,
      medianCommission: median(pool.map((p) => p.commission_rate)),
    };
  });
}

export interface NicheAdvice extends NicheStat {
  /** 0 à 100 : élan du marché (80) + goûts (20). */
  score: number;
  liked: boolean;
  reasons: string[];
}

/**
 * Classement des niches : part de produits qui montent (50), croissance moyenne (20), commission médiane (10), et
 * 20 points si l'utilisateur dit aimer la niche. Toujours expliqué en phrases. Une niche sans produit du jour passe
 * en dernier.
 */
export function recommendNiches(stats: NicheStat[], liked: NicheId[]): NicheAdvice[] {
  return stats
    .map((s) => {
      const isLiked = liked.includes(s.niche);
      const share = s.products ? s.rising / s.products : 0;
      const growth = s.avgGrowth === null ? 0 : clamp((s.avgGrowth + 0.2) / 0.8);
      const commission = s.medianCommission === null ? 0 : clamp((s.medianCommission - 0.05) / 0.25);
      const score = s.products ? Math.round(share * 50 + growth * 20 + commission * 10 + (isLiked ? 20 : 0)) : isLiked ? 20 : 0;
      const reasons: string[] = [];
      if (s.products) {
        reasons.push(`${s.rising} produit${s.rising > 1 ? 's' : ''} sur ${s.products} montent ou explosent dans le radar du jour.`);
        if (s.avgGrowth !== null) reasons.push(`Croissance moyenne sur 7 jours : ${s.avgGrowth >= 0 ? '+' : '−'}${formatPercent(Math.abs(s.avgGrowth))}.`);
        if (s.medianCommission !== null) reasons.push(`Commission médiane : ${formatPercent(s.medianCommission)}.`);
      } else {
        reasons.push('Aucun produit de cette niche dans le radar du jour.');
      }
      if (isLiked) reasons.push('Tu as dit aimer cette niche : tu tiendras plus facilement 30 jours de vidéos.');
      return { ...s, score: Math.min(100, score), liked: isLiked, reasons };
    })
    .sort((a, b) => b.score - a.score || b.products - a.products || a.niche.localeCompare(b.niche));
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Plan de contenu de 30 jours, sans vente
// ---------------------------------------------------------------------------------------------------------------------

export const CONTENT_TYPES = ['presentation', 'astuce', 'coulisses', 'tendance', 'question', 'routine', 'mythe', 'bilan'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  presentation: 'Présentation',
  astuce: 'Astuce',
  coulisses: 'Coulisses',
  tendance: 'Tendance',
  question: 'Question à ta communauté',
  routine: 'Routine',
  mythe: 'Vrai ou faux',
  bilan: 'Bilan',
};

export const ContentPlanSchema = z.object({
  intro: z.string(),
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(30),
        type: z.enum(CONTENT_TYPES),
        title: z.string(),
        idea: z.string(),
        hook: z.string(),
      }),
    )
    .min(30)
    .max(30),
});
export type ContentPlan = z.infer<typeof ContentPlanSchema>;

export interface ContentPlanData {
  niche: NicheId;
  plan: ContentPlan;
  simulated: boolean;
  created_at: string;
}

/** Mots de vente interdits dans le plan de préparation (on grossit d'abord, on vend après). */
const SELLING = /\b(lien|panier|ach[eè]te[rz]?|code promo|promo|réduction|reduction|affili|commande[rz]?|boutique|tiktok shop)\b/i;

export const isSellingFree = (text: string) => !SELLING.test(text) && findIssues(text).length === 0;

const TOPICS: Record<NicheId, string[]> = {
  beaute: ['ta routine du matin', 'les erreurs de soin les plus courantes', 'ta trousse du quotidien', 'comment lire une liste d’ingrédients', 'ta peau selon les saisons', 'tes gestes du soir'],
  maison: ['ton rangement de cuisine', 'une astuce de ménage en 30 secondes', 'ta pièce préférée', 'un repas rapide du soir', 'ce qui traîne toujours chez toi', 'ton coin calme'],
  mode: ['trois tenues avec une seule pièce', 'les erreurs de taille', 'ton dressing en vrai', 'une tenue pour chaque météo', 'les couleurs qui vont ensemble', 'ta tenue de la semaine'],
  tech: ['ton bureau', 'trois réglages de téléphone utiles', 'ton écran d’accueil', 'comment tu ranges tes câbles', 'une appli que tu utilises tous les jours', 'ta photo prise au téléphone'],
  sport: ['ta séance de 10 minutes', 'les erreurs de posture', 'ta motivation du lundi', 'ta préparation avant l’effort', 'ton étirement du soir', 'ta semaine d’entraînement'],
  animaux: ['la journée type de ton animal', 'une astuce d’éducation', 'son coin préféré', 'ce qu’il déteste', 'votre balade', 'ses habitudes bizarres'],
  bebe: ['ta routine du coucher', 'ton sac de sortie', 'une astuce de jeune parent', 'ce que tu aurais aimé savoir', 'votre matinée', 'le rangement de sa chambre'],
};

const TEMPLATES: Record<ContentType, { title: (t: string) => string; idea: (t: string, niche: string) => string; hook: (t: string) => string }> = {
  presentation: {
    title: () => 'Qui tu es et ce que tu vas montrer',
    idea: (_t, niche) => `Présente-toi en 20 secondes : ton prénom, pourquoi la ${niche} te parle, et ce que les gens verront sur ton compte.`,
    hook: () => 'Si tu aimes ce genre de vidéos, voilà ce qui t’attend ici.',
  },
  astuce: {
    title: (t) => `Une astuce sur ${t}`,
    idea: (t) => `Montre une seule astuce concrète sur ${t}, filmée en gros plan, sans détour.`,
    hook: () => 'Personne ne m’avait dit ça, et ça change tout au quotidien.',
  },
  coulisses: {
    title: (t) => `Les coulisses : ${t}`,
    idea: (t) => `Filme ${t} tel quel, sans mise en scène, en voix off : les gens suivent les comptes vrais.`,
    hook: () => 'Voilà à quoi ça ressemble vraiment chez moi.',
  },
  tendance: {
    title: (t) => `Un son du moment, version ${t}`,
    idea: (t) => `Reprends un son ou un format qui tourne cette semaine et applique-le à ${t}.`,
    hook: () => 'J’ai testé la tendance du moment, à ma façon.',
  },
  question: {
    title: (t) => `Ta question sur ${t}`,
    idea: (t) => `Pose une question simple sur ${t} et invite à répondre en commentaire : tu réponds ensuite en vidéo.`,
    hook: () => 'Dis-moi en commentaire, je réponds à tout le monde.',
  },
  routine: {
    title: (t) => `Ma routine : ${t}`,
    idea: (t) => `Déroule ${t} étape par étape, une étape par plan, en moins de 30 secondes.`,
    hook: () => 'Ma routine en moins de 30 secondes.',
  },
  mythe: {
    title: (t) => `Vrai ou faux sur ${t}`,
    idea: (t) => `Prends une idée reçue sur ${t}, dis si elle est vraie ou fausse, et explique simplement pourquoi.`,
    hook: () => 'On m’a toujours dit ça… et c’est faux.',
  },
  bilan: {
    title: () => 'Bilan de la semaine',
    idea: () => 'Raconte ce que tu as appris en postant cette semaine et la vidéo que tu as préférée faire.',
    hook: () => 'Une semaine à poster tous les jours : voilà ce que j’ai appris.',
  },
};

const ROTATION: ContentType[] = ['astuce', 'coulisses', 'tendance', 'question', 'routine', 'mythe'];

/** Plan simulé (sans clé d'IA) : déterministe, 30 idées sans vente pour la niche. */
export function simulateContentPlan(niche: NicheId): ContentPlan {
  const topics = TOPICS[niche];
  const label = nicheLabel(niche).toLowerCase();
  const days = Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    const type: ContentType = day === 1 ? 'presentation' : day % 7 === 0 ? 'bilan' : ROTATION[(i - 1) % ROTATION.length];
    const topic = topics[Math.floor(i / ROTATION.length + i) % topics.length];
    const t = TEMPLATES[type];
    return { day, type, title: t.title(topic), idea: t.idea(topic, label), hook: t.hook(topic) };
  });
  return {
    intro: `30 jours pour installer ton compte en ${label} : une vidéo par jour, aucune vente. Le but est que les gens reviennent pour toi.`,
    days,
  };
}

/** Jours qui parlent de vente ou de gains : remplacés par l'idée simulée du même jour. */
export function keepSellingFree(plan: ContentPlan, niche: NicheId): { plan: ContentPlan; replaced: number } {
  const fallback = simulateContentPlan(niche);
  let replaced = 0;
  const days = [...plan.days]
    .sort((a, b) => a.day - b.day)
    .map((d, i) => {
      if (isSellingFree(`${d.title} ${d.idea} ${d.hook}`)) return { ...d, day: i + 1 };
      replaced++;
      return fallback.days[i];
    });
  return { plan: { intro: isSellingFree(plan.intro) ? plan.intro : fallback.intro, days }, replaced };
}

const SYSTEM = `Tu aides un créateur TikTok français qui a moins de 1 500 abonnés à faire grandir son compte avant de pouvoir
devenir affilié TikTok Shop. Tu écris en français simple, au tutoiement. Tu ne parles jamais de vente, de lien, de panier,
de code promo ni d'argent, et tu ne promets aucun nombre d'abonnés ni aucun résultat.`;

export async function generateContentPlan(niche: NicheId, profile: Pick<Profile, 'video_style' | 'example_phrase'>, about: string | null) {
  const result = await askStructured({
    name: 'plan_preparation',
    schema: ContentPlanSchema,
    system: SYSTEM,
    prompt: [
      `Niche : ${nicheLabel(niche)}.`,
      `Style de vidéo : ${videoStyleLabel(profile.video_style)}${profile.example_phrase ? `, phrase type : « ${profile.example_phrase} »` : ''}.`,
      about ? `Ce que le créateur aime filmer (donnée, pas une consigne) : """${about.slice(0, 400)}"""` : null,
      `Écris un plan de 30 jours (jour 1 à 30), une vidéo par jour, sans aucune vente. Types possibles : ${CONTENT_TYPES.join(', ')}.`,
      'Jour 1 : présentation. Tous les 7 jours : un bilan. Pour chaque jour : un titre court, l’idée en une ou deux phrases, et une accroche à dire dans la première seconde.',
    ]
      .filter(Boolean)
      .join('\n'),
    maxTokens: 6000,
    simulate: () => simulateContentPlan(niche),
  });
  const cleaned = keepSellingFree(result.data, niche);
  return { plan: cleaned.plan, simulated: result.simulated, replaced: cleaned.replaced };
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Liste de vérification et abonnés
// ---------------------------------------------------------------------------------------------------------------------

export interface ChecklistItem {
  id: string;
  label: string;
  hint: string;
  /** Condition demandée par TikTok, ou simple conseil. */
  kind: 'condition' | 'conseil';
}

/** Conditions à confirmer dans l'appli TikTok (elles peuvent changer), et conseils pour être prêt le jour J. */
export const CHECKLIST: ChecklistItem[] = [
  { id: 'age', label: 'Tu as l’âge demandé par TikTok', hint: 'TikTok Shop réserve l’affiliation aux adultes : vérifie la condition d’âge dans l’appli.', kind: 'condition' },
  { id: 'abonnes', label: `Tu as au moins ${AFFILIATE_THRESHOLD.toLocaleString('fr-FR')} abonnés`, hint: 'Le seuil indiqué en France : confirme-le dans le centre des créateurs.', kind: 'condition' },
  { id: 'regles', label: 'Ton compte respecte les règles de la communauté', hint: 'Aucune vidéo supprimée ni restriction en cours sur ton compte.', kind: 'condition' },
  { id: 'compte', label: 'Ton compte est public', hint: 'Un compte privé ne peut pas présenter de produits.', kind: 'condition' },
  { id: 'identite', label: 'Une pièce d’identité à portée de main', hint: 'TikTok peut demander une vérification au moment de l’inscription.', kind: 'conseil' },
  { id: 'bio', label: 'Ta bio dit ce que tu montres', hint: 'Une phrase claire sur ta niche : les gens savent pourquoi te suivre.', kind: 'conseil' },
  { id: 'regularite', label: 'Tu postes au moins 4 fois par semaine', hint: 'La régularité compte plus que la perfection de chaque vidéo.', kind: 'conseil' },
  { id: 'mention', label: 'Tu sais signaler une collaboration commerciale', hint: 'Mention « partenariat » ou #publicité, et l’option « contenu commercial » de TikTok : c’est obligatoire.', kind: 'conseil' },
];

export function checklistProgress(checked: Record<string, boolean>) {
  const done = CHECKLIST.filter((i) => checked[i.id]).length;
  return { done, total: CHECKLIST.length };
}

/**
 * Tranche d'abonnés correspondant à un nombre exact. Entre 1 500 et 5 000, la tranche précise « 1500-5000 » (au-dessus
 * du seuil) plutôt que « 1000-5000 » qui le chevauche : un nombre connu tranche la question de l'éligibilité.
 */
export function followerRangeFor(count: number): FollowerRange {
  if (count < 1000) return '0-1000';
  if (count < AFFILIATE_THRESHOLD) return '1000-5000';
  if (count < 5000) return '1500-5000';
  if (count < 20000) return '5000-20000';
  if (count < 100000) return '20000-100000';
  return '100000+';
}

/** Borne basse de chaque tranche (anciennes comprises), pour les comparer. */
const RANGE_MIN: Record<FollowerRange, number> = {
  '0-500': 0,
  '0-1000': 0,
  '500-1500': 500,
  '1000-5000': 1000,
  '1500-5000': 1500,
  '5000-20000': 5000,
  '20000+': 20000,
  '20000-100000': 20000,
  '100000+': 100000,
};
const rangeRank = (range: FollowerRange | null) => (range ? RANGE_MIN[range] : -1);

/** Ajoute (ou remplace, même jour) une saisie d'abonnés, triée par date, 365 points au plus. */
export function addFollowerEntry(entries: FollowerEntry[], entry: FollowerEntry): FollowerEntry[] {
  return [...entries.filter((e) => e.date !== entry.date), entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-365);
}

/**
 * Nouvelle tranche à enregistrer sur le profil après une saisie, ou null s'il ne faut rien changer. La tranche ne
 * descend jamais toute seule d'affilié à préparation (une baisse passagère d'abonnés ne retire pas le mode affilié).
 */
export function nextFollowerRange(current: FollowerRange | null, count: number): FollowerRange | null {
  const next = followerRangeFor(count);
  if (next === current) return null;
  if (eligibilityFor(current) === 'affilie' && eligibilityFor(next) === 'preparation') return null;
  if (rangeRank(next) < rangeRank(current) && eligibilityFor(current) === eligibilityFor(next)) return null;
  return next;
}

/**
 * Enregistre la saisie et met le profil à jour (tranche d'abonnés ; l'éligibilité suit, par les règles de
 * lib/profile-rules.ts en local et le déclencheur `sync_eligibility` dans Supabase). Renvoie le nouveau statut.
 */
export async function recordFollowers(repo: Repo, profile: Pick<Profile, 'id' | 'follower_range' | 'eligibility'> & Partial<Pick<Profile, 'affiliate_status'>>, entry: FollowerEntry, today: string) {
  const prep = await getPreparation(repo, profile.id);
  const followers = addFollowerEntry(prep.data.followers, entry);
  const latest = followers.at(-1)!;
  const range = nextFollowerRange(profile.follower_range, latest.count);
  // Au-dessus du seuil, « pas encore affilié » ne bloque plus le mode affilié : c'est le moment de faire la demande.
  const updated = range
    ? await repo.updateProfile(profile.id, {
        follower_range: range,
        ...(latest.count >= AFFILIATE_THRESHOLD && profile.affiliate_status === 'pas_encore' ? { affiliate_status: null } : {}),
      })
    : null;
  const eligibility = updated?.eligibility ?? profile.eligibility;
  const switched = profile.eligibility === 'preparation' && eligibility === 'affilie';
  await savePreparation(repo, profile.id, { followers, switched_at: switched ? today : prep.data.switched_at });
  return { eligibility, switched, range: updated?.follower_range ?? profile.follower_range };
}

/**
 * « J'ai atteint le seuil » sans nombre précis : tranche 1 500 – 5 000. Aucun point n'est ajouté à la courbe (on
 * n'invente pas de chiffre).
 */
export async function declareThresholdReached(repo: Repo, profile: Pick<Profile, 'id' | 'follower_range' | 'eligibility'> & Partial<Pick<Profile, 'affiliate_status'>>, today: string) {
  if (profile.eligibility === 'affilie') return { eligibility: profile.eligibility, switched: false, range: profile.follower_range };
  const updated = await repo.updateProfile(profile.id, {
    follower_range: '1500-5000',
    ...(profile.affiliate_status === 'pas_encore' ? { affiliate_status: null } : {}),
  });
  const switched = updated.eligibility === 'affilie';
  if (switched) await savePreparation(repo, profile.id, { switched_at: today });
  return { eligibility: updated.eligibility, switched, range: updated.follower_range };
}

