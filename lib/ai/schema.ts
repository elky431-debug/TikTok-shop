import { z } from 'zod';

/**
 * Schéma de sortie imposé à Claude (structured outputs) : volontairement sans contraintes
 * numériques, que l'API ne garantit pas toutes. Les règles métier (nombre d'accroches, durées…)
 * sont vérifiées ensuite par `validateGeneration`.
 */
export const HookSchema = z.object({
  text: z.string().describe('Accroche parlée, moins de 3 secondes à l’oral (8 mots maximum).'),
  seconds: z.number().describe('Durée parlée estimée en secondes.'),
});

export const ShotSchema = z.object({
  time: z.string().describe('Plage de temps, ex. « 0–3 s ».'),
  visual: z.string().describe('Ce qu’on voit à l’écran (plan, cadrage, geste).'),
  voice: z.string().describe('Ce que dit le créateur, mot pour mot.'),
  on_screen_text: z.string().describe('Texte incrusté à l’écran, court.'),
});

export const ScriptSchema = z.object({
  title: z.string(),
  angle: z.string().describe('L’angle de la vidéo en une phrase.'),
  duration_seconds: z.number(),
  shots: z.array(ShotSchema),
  call_to_action: z.string(),
  caption: z.string().describe('Légende de la vidéo, sans hashtags.'),
  hashtags: z.array(z.string()),
});

export const GenerationSchema = z.object({
  hooks: z.array(HookSchema),
  scripts: z.array(ScriptSchema),
});

export const SingleHookSchema = z.object({ hook: HookSchema });

export type Generation = z.infer<typeof GenerationSchema>;
