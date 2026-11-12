import { getRepo, type Repo } from '@/lib/db';
import { env } from '@/lib/env';
import { finishCommand, releaseCommand, type DiscordCommandData } from './account';
import { quickHook } from './hook';
import { hookMessage, type DiscordMessage } from './messages';
import { discordApi } from './rest';

/**
 * Réponses différées (doc Discord, interactions/receiving-and-responding) : la route répond tout de suite
 * « DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE » (type 5, éphémère), Discord affiche « réfléchit… », puis le travail
 * modifie cette réponse par PATCH /webhooks/{application.id}/{interaction.token}/messages/@original (jeton valable
 * 15 minutes, aucun jeton de bot nécessaire).
 *
 * Où tourne le travail : sur Netlify, dans la fonction d'arrière-plan `discord-interaction-background` (202 immédiat,
 * 15 minutes au plus), car une fonction ordinaire s'arrête dès la réponse envoyée ; ailleurs (local, tests,
 * serveur Node), dans le même processus, sans faire attendre la réponse à Discord.
 */
export interface FollowupJob {
  kind: 'script';
  applicationId: string;
  token: string;
  userId: string;
  productId: string;
  recordId: string;
}

export function isFollowupJob(value: unknown): value is FollowupJob {
  const j = value as Partial<FollowupJob> | null;
  return Boolean(
    j && j.kind === 'script' && typeof j.applicationId === 'string' && /^\d{5,25}$/.test(j.applicationId) && typeof j.token === 'string' &&
      /^[\w.-]{10,500}$/.test(j.token) && typeof j.userId === 'string' && typeof j.productId === 'string' && typeof j.recordId === 'string',
  );
}

async function editOriginal(job: FollowupJob, message: DiscordMessage) {
  await discordApi('PATCH', `/webhooks/${job.applicationId}/${job.token}/messages/@original`, message, { auth: false });
}

export async function runDiscordFollowup(job: FollowupJob, repo: Repo = getRepo()): Promise<'ok' | 'echec'> {
  try {
    const [product, profile] = await Promise.all([repo.getProduct(job.productId), repo.getProfile(job.userId)]);
    if (!product || !profile) throw new Error('produit ou compte introuvable');
    const hook = await quickHook(product, profile);
    await editOriginal(job, hookMessage(product, hook, env.siteUrl));
    const data: DiscordCommandData = { command: 'script', product_id: product.id, ia: !hook.simulated, status: 'ok' };
    await finishCommand(job.userId, job.recordId, data, repo);
    return 'ok';
  } catch (error) {
    console.error('[discord] /script', error instanceof Error ? error.message : error);
    // La commande ratée ne compte pas dans le quota.
    await releaseCommand(job.userId, job.recordId, repo).catch(() => undefined);
    await editOriginal(job, { content: '❌ L’accroche n’a pas pu être écrite. Réessaie dans un instant : cette commande ne compte pas.' }).catch(
      () => undefined,
    );
    return 'echec';
  }
}

const pending = new Set<Promise<unknown>>();
let fetchForTests: typeof fetch | null = null;

/** Tests : remplace l'appel à la fonction d'arrière-plan Netlify. */
export function setFollowupFetchForTests(impl: typeof fetch | null) {
  fetchForTests = impl;
}

/** Tests : attend la fin des réponses différées lancées dans ce processus. */
export async function waitForDiscordFollowups() {
  while (pending.size) await Promise.allSettled([...pending]);
}

/**
 * Lance le travail sans retarder la réponse à Discord. Renvoie false si la fonction d'arrière-plan refuse :
 * la route répond alors tout de suite par un message d'erreur.
 */
export async function dispatchFollowup(job: FollowupJob, repo: Repo = getRepo()): Promise<boolean> {
  if (process.env.SITE_ID && process.env.URL && env.cronSecret) {
    try {
      const response = await (fetchForTests ?? fetch)(`${process.env.URL}/.netlify/functions/discord-interaction-background`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.cronSecret}`, 'content-type': 'application/json' },
        body: JSON.stringify(job),
        signal: AbortSignal.timeout(1500),
      });
      // Une fonction d'arrière-plan répond 202 dès qu'elle est lancée (doc Netlify).
      return response.status === 202;
    } catch (error) {
      console.error('[discord] lancement en arrière-plan', error instanceof Error ? error.message : error);
      return false;
    }
  }
  const work = runDiscordFollowup(job, repo);
  pending.add(work);
  void work.finally(() => pending.delete(work));
  return true;
}

