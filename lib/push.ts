/**
 * Notifications push web (bloc 15). Point d'entrée unique : `sendPush`. Tant que le push n'est pas configuré (clés VAPID,
 * consentement de l'utilisateur), il ne fait rien et renvoie false.
 */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

type PushSender = (userId: string, payload: PushPayload) => Promise<boolean>;
let sender: PushSender | null = null;

/** Branché par le module push (bloc 15). */
export function registerPushSender(fn: PushSender | null) {
  sender = fn;
}

export async function sendPush(userId: string, payload: PushPayload): Promise<boolean> {
  if (!sender) return false;
  try {
    return await sender(userId, payload);
  } catch (error) {
    console.warn('[push]', userId, error instanceof Error ? error.message : error);
    return false;
  }
}
