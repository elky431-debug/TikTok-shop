import type { Hook, Product, ScriptFormat, Shot, VideoScript } from '@/lib/db/types';
import { Rng } from '@/lib/data/random';
import type { NicheId } from '@/lib/niches';
import { formatEuros } from '@/lib/utils';
import { DISCLOSURE_LINE } from './formats';
import type { ScriptInput, ScriptOutput } from './types';

/**
 * Générateur de scripts simulé, sans appel d'API : utilisé quand ANTHROPIC_API_KEY est vide,
 * et pour le récap du matin. Déterministe pour une même entrée (graine), mais varie avec `variant`.
 * Respecte les mêmes interdits que la vraie génération : pas de promesse médicale, pas de gains,
 * pas de superlatif non prouvé.
 */

const NICHE_WORDS: Record<NicheId, { usage: string; moment: string; tag: string; viewer: string }> = {
  beaute: { usage: 'ma routine', moment: 'le matin devant le miroir', tag: '#beauté', viewer: 'les filles' },
  maison: { usage: 'ma cuisine', moment: 'au moment du ménage', tag: '#astucemaison', viewer: 'les amis' },
  mode: { usage: 'mes tenues', moment: 'quand je m’habille le matin', tag: '#mode', viewer: 'les filles' },
  tech: { usage: 'mon bureau', moment: 'au quotidien', tag: '#tech', viewer: 'les amis' },
  sport: { usage: 'mes séances', moment: 'pendant ma séance', tag: '#sport', viewer: 'la team' },
  animaux: { usage: 'le quotidien avec mon animal', moment: 'à l’heure du repas', tag: '#animaux', viewer: 'les amis des bêtes' },
  bebe: { usage: 'le quotidien avec bébé', moment: 'au moment du coucher', tag: '#maman', viewer: 'les parents' },
};

const GENERIC_HOOKS = [
  'Stop. Regarde ça avant ta prochaine commande.',
  'Je ne m’attendais pas à ça.',
  'Personne n’en parle, alors je le fais.',
  'Test honnête, sans filtre.',
  'Tu le fais sûrement mal. Regarde.',
  'Le produit qu’on me demande tout le temps.',
  'Trois secondes pour te montrer pourquoi.',
  'Arrivé ce matin, testé tout de suite.',
  'Franchement ? Je ne pensais pas le garder.',
  'Si tu hésites encore, regarde ça.',
  'Petit prix, je te montre ce que ça donne.',
  'Mon avis après une semaine.',
];

const FORMAT_HOOKS: Record<ScriptFormat, string[]> = {
  demo: ['Je te montre en dix secondes.', 'Regarde comment ça marche.', 'Démo rapide, sans blabla.'],
  avant_apres: ['Avant… et après. Sans retouche.', 'Regarde bien la différence.', 'Gauche, avant. Droite, après.'],
  histoire: ['Il y a deux semaines, j’avais un souci.', 'Je vais être honnête avec toi.', 'Petite histoire, ça vaut le coup.'],
  reponse_commentaire: [
    'Tu m’as demandé si ça valait le coup.',
    'Réponse à ton commentaire : je teste.',
    'Vous êtes nombreux à me le demander.',
  ],
  unboxing: ['Il vient d’arriver, on l’ouvre ensemble.', 'Colis du jour, je l’attendais.', 'Déballage en direct, premier avis.'],
};

const ANGLES: Record<ScriptFormat, [string, string, string]> = {
  demo: ['La démo express', 'Le test en vrai', 'Les 3 détails qui comptent'],
  avant_apres: ['Le résultat en deux temps', 'L’avant-après en vrai', 'Avant-après et mon avis'],
  histoire: ['Mon problème, ma solution', 'Ce qui a changé', 'Le conseil que j’aurais aimé avoir'],
  reponse_commentaire: ['Je réponds en montrant', 'Oui, mais regarde', 'Les questions qu’on me pose'],
  unboxing: ['Déballage et premier test', 'Ce qu’il y a dans la boîte', 'Premières impressions'],
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Durée parlée approximative (environ 3 mots par seconde). */
export function hookSeconds(text: string): number {
  return Math.min(2.9, Math.max(1, Math.round(countWords(text) * 0.33 * 10) / 10));
}

function styleVisual(style: string | null, faceCam: string, other: { voix_off: string; mains: string; avant_apres: string }) {
  if (style === 'voix_off') return other.voix_off;
  if (style === 'mains') return other.mains;
  if (style === 'avant_apres') return other.avant_apres;
  return faceCam;
}

function buildShots(input: ScriptInput, angleIndex: number, rng: Rng, hook: string): Shot[] {
  const { product, format, style } = input;
  const words = NICHE_WORDS[product.niche];
  const price = formatEuros(product.price_cents);
  const intro: Shot = {
    time: '0–3 s',
    visual: styleVisual(
      style,
      'Gros plan sur ton visage, le produit tenu à côté de la joue.',
      {
        voix_off: 'Gros plan sur le produit posé, lumière naturelle.',
        mains: 'Tes mains attrapent le produit au premier plan.',
        avant_apres: 'Écran coupé en deux : à gauche l’avant, à droite l’après.',
      },
    ),
    voice: hook,
    on_screen_text: hook.length > 38 ? `${hook.split(/[.?!…]/)[0]}…` : hook,
  };

  const middleByFormat: Record<ScriptFormat, Shot[]> = {
    demo: [
      {
        time: '3–10 s',
        visual: 'Tu utilises le produit devant la caméra, sans couper.',
        voice: `Je te présente ${product.name}. ${product.description.split('.')[0]}.`,
        on_screen_text: product.name,
      },
      {
        time: '10–20 s',
        visual: 'Plan rapproché sur le détail qui fait la différence.',
        voice: `Ce que j’aime : c’est simple à utiliser, ${words.moment}. Regarde ce détail.`,
        on_screen_text: 'Le détail qui compte',
      },
    ],
    avant_apres: [
      {
        time: '3–10 s',
        visual: 'L’avant, filmé dans la même lumière que l’après.',
        voice: 'Voilà où j’en étais avant. Même lumière, pas de filtre.',
        on_screen_text: 'Avant',
      },
      {
        time: '10–20 s',
        visual: 'Transition (claquement de doigts), puis l’après au même cadrage.',
        voice: `Et après avoir utilisé ${product.name}. Je te laisse juger.`,
        on_screen_text: 'Après · sans retouche',
      },
    ],
    histoire: [
      {
        time: '3–12 s',
        visual: 'Toi, assis, ton naturel, le produit posé à côté.',
        voice: `Mon souci, c’était ${words.usage}. J’avais tout essayé, rien de simple.`,
        on_screen_text: 'Mon problème',
      },
      {
        time: '12–22 s',
        visual: 'Tu montres le produit, puis tu l’utilises.',
        voice: `Puis j’ai testé ${product.name}. Ce qui a changé pour moi : c’est devenu facile.`,
        on_screen_text: 'Ce qui a changé',
      },
    ],
    reponse_commentaire: [
      {
        time: '3–10 s',
        visual: 'Bulle du commentaire affichée à l’écran, toi derrière.',
        voice: `On m’a demandé si ${product.name} valait ${price}. Je te montre au lieu de te le dire.`,
        on_screen_text: '« Ça vaut vraiment le coup ? »',
      },
      {
        time: '10–20 s',
        visual: 'Démonstration en une prise.',
        voice: 'Voilà comment je l’utilise, au quotidien, en vrai.',
        on_screen_text: 'En vrai, au quotidien',
      },
    ],
    unboxing: [
      {
        time: '3–10 s',
        visual: 'Tu ouvres le colis, plan du dessus.',
        voice: `Dedans : ${product.name}. ${product.description.split('.')[0]}.`,
        on_screen_text: 'Ce qu’il y a dans la boîte',
      },
      {
        time: '10–20 s',
        visual: 'Premier test, sans couper.',
        voice: 'Premier test tout de suite, je te donne mon avis à chaud.',
        on_screen_text: 'Premier test',
      },
    ],
  };

  const proofLines = [
    'Je te montre en vrai, pas de montage.',
    `Pour ${price}, je trouve ça bien pensé.`,
    'Regarde la texture, regarde le rendu.',
    'Voilà mon avis, honnête.',
  ];

  const proof: Shot = {
    time: '20–27 s',
    visual: 'Preuve visuelle : le résultat ou le produit en usage, en plan fixe.',
    voice: proofLines[(angleIndex + rng.int(0, 3)) % proofLines.length],
    on_screen_text: `${price} · lien dans le panier`,
  };

  const personal = input.examplePhrase?.trim();
  const cta: Shot = {
    time: '27–32 s',
    visual: 'Tu pointes vers le bas de l’écran, vers le panier orange.',
    voice: personal
      ? `${personal.replace(/[.!?…]+$/, '')}. C’est dans le panier orange, juste en dessous.`
      : 'C’est dans le panier orange, juste en dessous. Fais-toi ton avis.',
    on_screen_text: 'Panier orange ⬇',
  };

  return [intro, ...middleByFormat[format], proof, cta];
}

function buildHooks(input: ScriptInput, rng: Rng): Hook[] {
  const pool = rng.shuffle([...FORMAT_HOOKS[input.format], ...rng.shuffle(GENERIC_HOOKS)]);
  const personal = input.examplePhrase?.trim();
  const hooks: string[] = [];
  if (personal && countWords(personal) <= 9) hooks.push(personal);
  for (const text of pool) {
    if (hooks.length >= 10) break;
    if (!hooks.includes(text)) hooks.push(text);
  }
  return hooks.slice(0, 10).map((text) => ({ text, seconds: hookSeconds(text) }));
}

export function generateMockScripts(input: ScriptInput, variant = 0): ScriptOutput {
  const rng = new Rng(`${input.product.id}|${input.format}|${input.style}|${variant}`);
  const hooks = buildHooks(input, rng);
  const words = NICHE_WORDS[input.product.niche];
  const scripts: VideoScript[] = ANGLES[input.format].map((angle, index) => {
    const shots = buildShots(input, index, rng, hooks[index % hooks.length].text);
    return {
      title: angle,
      angle: `${angle} : ${input.product.name}`,
      duration_seconds: 30 + index * 2,
      shots,
      call_to_action: 'Clique sur le panier orange pour voir le produit.',
      caption: `${hooks[index % hooks.length].text} ${input.product.name}, testé pour toi.`,
      hashtags: ['#tiktokshop', words.tag, '#avis', '#test'],
      disclosure: DISCLOSURE_LINE,
    };
  });
  return { hooks, scripts };
}

/** Une nouvelle accroche, différente de celles déjà proposées. */
export function regenerateMockHook(input: ScriptInput, existing: string[], attempt: number): Hook {
  const rng = new Rng(`${input.product.id}|${input.format}|regen|${attempt}`);
  const pool = rng.shuffle([...GENERIC_HOOKS, ...Object.values(FORMAT_HOOKS).flat()]);
  const text = pool.find((h) => !existing.includes(h)) ?? `${pool[0]} (${attempt + 1})`;
  return { text, seconds: hookSeconds(text) };
}

/** Accroche courte pour le récap du matin. */
export function quickHook(product: Pick<Product, 'id' | 'niche'>, day: string): string {
  const rng = new Rng(`${product.id}|${day}|recap`);
  return rng.pick(GENERIC_HOOKS);
}
