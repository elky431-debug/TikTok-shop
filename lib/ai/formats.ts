import type { ScriptFormat } from '@/lib/db/types';

export const SCRIPT_FORMATS: Array<{ id: ScriptFormat; label: string; hint: string }> = [
  { id: 'demo', label: 'Démo face caméra', hint: 'Tu montres le produit en action et tu parles à la caméra.' },
  { id: 'avant_apres', label: 'Avant-après', hint: 'Le résultat en deux temps, sans retouche.' },
  { id: 'histoire', label: 'Histoire perso', hint: 'Ton problème, ta découverte, ce qui a changé.' },
  { id: 'reponse_commentaire', label: 'Réponse à un commentaire', hint: 'Tu réponds à une question d’un abonné.' },
  { id: 'unboxing', label: 'Déballage', hint: 'Tu ouvres le colis et tu découvres le produit en direct.' },
];

export function isScriptFormat(value: unknown): value is ScriptFormat {
  return SCRIPT_FORMATS.some((f) => f.id === value);
}

export function formatLabel(id: ScriptFormat | string): string {
  return SCRIPT_FORMATS.find((f) => f.id === id)?.label ?? id;
}

/** Rappel ajouté à chaque script : la collaboration commerciale doit être signalée. */
export const DISCLOSURE_LINE =
  '#publicité : signale la collaboration commerciale (mention « partenariat » ou #publicité, et l’option « contenu commercial » de TikTok). C’est obligatoire.';
