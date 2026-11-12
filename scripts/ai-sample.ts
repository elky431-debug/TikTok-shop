/**
 * Génère des scripts de test avec le vrai fournisseur d'IA (AI_PROVIDER), par toute la chaîne de production :
 * schéma Zod, nouvel essai si besoin, liste des interdits, mise en forme. Puis relit le français
 * automatiquement et écrit tout dans docs/exemples-scripts/<date>-<fournisseur>.md pour une relecture humaine.
 *
 * Usage : npm run ai:sample        (coûte 3 générations chez le fournisseur ; rien n'est écrit en base)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

/** Mots anglais qu'on préfère éviter dans une vidéo en français (à relire, pas forcément faux). */
const ANGLICISMS = ['sample', 'link in bio', 'game changer', 'must-have', 'must have', 'hack', 'glow up', 'skincare', 'haul', 'review'];
/** Morceaux anglais repérés dans les hashtags (collés, donc cherchés sans limite de mot). */
const ENGLISH_IN_HASHTAGS = ['skincare', 'airfryer', 'beauty', 'makeup', 'haul', 'review', 'hack', 'glow', 'home', 'pet'];

function frenchCheck(texts: string[], hooks: string[], hashtags: string[] = []) {
  const all = texts.join('\n');
  const issues: string[] = [];
  const vous = all.match(/\bvous\b/gi)?.length ?? 0;
  if (vous) issues.push(`vouvoiement : « vous » apparaît ${vous} fois (consigne : tutoiement)`);
  for (const word of ANGLICISMS) if (new RegExp(`\\b${word}\\b`, 'i').test(all)) issues.push(`anglicisme à relire : « ${word} »`);
  for (const hook of hooks) {
    const words = hook.trim().split(/\s+/).length;
    if (words > 8) issues.push(`accroche de ${words} mots (8 maximum) : « ${hook} »`);
  }
  if (/"[^"]+"/.test(all)) issues.push('guillemets anglais ("…") au lieu de « … »');
  if (/\ble lien\b/i.test(all)) issues.push('« le lien » au lieu de « c’est dans le panier orange »');
  for (const tag of hashtags) {
    const word = tag.toLowerCase().replace(/^#/, '');
    if (word !== 'tiktokshop' && ENGLISH_IN_HASHTAGS.some((en) => word.includes(en))) issues.push(`hashtag anglais : ${tag}`);
  }
  return issues;
}

/**
 * Prix officiels par million de jetons (entrée, sortie), relevés sur developers.openai.com/api/docs/models le
 * 12 novembre 2026, pour estimer le coût d'une génération. Un modèle absent de la liste : coût non estimé.
 */
const OPENAI_PRICES: Record<string, { input: number; output: number }> = {
  'gpt-6-luna': { input: 0.1, output: 0.5 },
  'gpt-5.5': { input: 5, output: 30 },
};

async function main() {
  const { env } = await import('@/lib/env');
  const { getScriptModel } = await import('@/lib/ai/providers');
  const { generateScripts, ScriptGenerationError } = await import('@/lib/ai/scripts');
  const { findIssues } = await import('@/lib/ai/guard');
  const { MockProvider } = await import('@/lib/data/mock');
  const { mapNexscopeProduct, findList } = await import('@/lib/data/nexscope');
  if (!env.aiProvider) {
    console.error('Aucun fournisseur d’IA configuré : renseigne AI_PROVIDER et sa clé (OPENAI_API_KEY ou ANTHROPIC_API_KEY).');
    process.exit(1);
  }

  // 1 vrai produit (réponse Nexscope enregistrée) et 2 produits fictifs de niches différentes.
  const real = JSON.parse(readFileSync('tests/fixtures/nexscope-tiktok-product-discovery.reel.json', 'utf8'));
  const mapped = mapNexscopeProduct((findList(real, 'products') ?? [])[2] as never, 'beaute');
  if (!mapped.ok) throw new Error('produit réel illisible');
  const mock = await new MockProvider().fetchTrendingProducts({ country: 'FR', date: '2026-11-12' });
  const pick = (niche: string) => mock.find((p) => p.niche === niche)!;
  const asInput = (p: { id: string; name: string; niche: never; description: string; price_cents: number; commission_rate: number; free_sample: boolean | null; shop_name: string }) => p;
  const cases = [
    { label: 'Vrai produit (Nexscope), démo face caméra', product: asInput({ ...mapped.product, shop_name: '' } as never), format: 'demo' as const, style: 'face_camera', examplePhrase: null },
    { label: 'Produit fictif maison, avant-après aux mains', product: asInput(pick('maison') as never), format: 'avant_apres' as const, style: 'mains', examplePhrase: null },
    {
      label: 'Produit fictif animaux, histoire en voix off',
      product: asInput(pick('animaux') as never),
      format: 'histoire' as const,
      style: 'voix_off',
      examplePhrase: 'Franchement, je m’attendais pas à ça.',
    },
  ];

  const lines: string[] = [];
  const day = new Date().toISOString().slice(0, 10);
  lines.push(`# Scripts de test — ${env.aiModelLabel} — ${day}`, '', 'Généré par `npm run ai:sample` (toute la chaîne de production : schéma Zod, nouvel essai, interdits).', '');
  let failures = 0;

  for (const [i, c] of cases.entries()) {
    const started = Date.now();
    process.stdout.write(`→ ${i + 1}/3 ${c.label}… `);
    try {
      const model = getScriptModel();
      const usage = model && 'usage' in model ? (model.usage as { inputTokens: number; outputTokens: number; reasoningTokens: number }) : null;
      const before = usage ? { ...usage } : null;
      const out = await generateScripts({ product: c.product, format: c.format, style: c.style, examplePhrase: c.examplePhrase, firstName: 'Léa', topVideos: [] }, model);
      const seconds = Math.round((Date.now() - started) / 100) / 10;
      let cost = '';
      if (usage && before) {
        const input = usage.inputTokens - before.inputTokens;
        const output = usage.outputTokens - before.outputTokens;
        const reasoning = usage.reasoningTokens - before.reasoningTokens;
        const price = OPENAI_PRICES[env.openaiModel];
        const dollars = price ? (input * price.input + output * price.output) / 1_000_000 : null;
        cost = `${input} jetons en entrée, ${output} en sortie (dont ${reasoning} de raisonnement)${dollars !== null ? `, environ ${dollars.toFixed(4)} $` : ''}`;
      }
      const texts = [
        ...out.hooks.map((h) => h.text),
        ...out.scripts.flatMap((s) => [s.title, s.angle, s.caption, s.call_to_action, ...s.shots.flatMap((sh) => [sh.voice, sh.on_screen_text, sh.visual])]),
      ];
      const guard = texts.flatMap((t) => findIssues(t).map((x) => `${x.reason} : « ${t} »`));
      const french = frenchCheck(texts, out.hooks.map((h) => h.text), out.scripts.flatMap((s) => s.hashtags));
      console.log(`${seconds} s, ${out.attempts} appel(s), ${guard.length + french.length} point(s) à relire${cost ? ` · ${cost}` : ''}`);
      lines.push(`## ${i + 1}. ${c.label}`, '', `Produit : ${c.product.name}`, '');
      lines.push(`- Source : ${out.source} · ${out.attempts} appel(s) · ${seconds} s${cost ? ` · ${cost}` : ''}`);
      lines.push(`- Problèmes de la 1re réponse : ${out.firstProblems.length ? out.firstProblems.join(' ; ') : 'aucun'}`);
      lines.push(`- Interdits restants : ${guard.length ? guard.join(' ; ') : 'aucun'}`);
      lines.push(`- Relecture automatique du français : ${french.length ? french.join(' ; ') : 'rien à signaler'}`, '');
      lines.push('### Accroches', '', ...out.hooks.map((h, n) => `${n + 1}. ${h.text} (${h.seconds} s)`), '');
      for (const [n, s] of out.scripts.entries()) {
        lines.push(`### Script ${n + 1} : ${s.title} (${s.duration_seconds} s)`, '', `*${s.angle}*`, '');
        lines.push('| Temps | On voit | Voix | Écran |', '| --- | --- | --- | --- |');
        for (const sh of s.shots) lines.push(`| ${sh.time} | ${sh.visual} | ${sh.voice} | ${sh.on_screen_text} |`);
        lines.push('', `Appel à l’action : ${s.call_to_action}`, '', `Légende : ${s.caption} ${s.hashtags.join(' ')}`, '', s.disclosure, '');
      }
    } catch (error) {
      failures++;
      const message = error instanceof ScriptGenerationError ? error.message : error instanceof Error ? error.message : String(error);
      console.log(`échec : ${message}`);
      lines.push(`## ${i + 1}. ${c.label}`, '', `Échec : ${message}`, '');
    }
  }

  const dir = path.join('docs', 'exemples-scripts');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${day}-${env.aiProvider}-${env.aiProvider === 'openai' ? env.openaiModel : env.anthropicModel}.md`);
  writeFileSync(file, `${lines.join('\n')}\n`);
  console.log(`\n✓ Écrit dans ${file}`);
  if (failures) process.exit(1);
}

main().catch((error) => {
  console.error('Échec :', error instanceof Error ? error.message : error);
  process.exit(1);
});
