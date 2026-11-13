import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main() {
  const { generateScripts } = await import('@/lib/ai/scripts');
  const { getRepo } = await import('@/lib/db');
  const { DEFAULT_SETTINGS } = await import('@/lib/ai/formats');
  const { OpenAIScriptModel } = await import('@/lib/ai/providers/openai');
  const product = await getRepo().getProduct('nx-1729958582667483490');
  const model = new OpenAIScriptModel();
  const t = Date.now();
  const r = await generateScripts({ product: product!, format: 'demo', style: 'face_camera', examplePhrase: null, firstName: 'Léa', topVideos: product!.top_videos, settings: DEFAULT_SETTINGS }, model);
  console.log(process.env.MESURE_EFFORT, 'durée', ((Date.now() - t) / 1000).toFixed(1), 's ·', r.source, '· appels', model.usage.calls, '· sortie', model.usage.outputTokens, '· raisonnement', model.usage.reasoningTokens);
  console.log('  accroche 1 :', r.hooks[0]?.text);
}
main().catch((e) => { console.error('échec', e.message); process.exit(1); });
