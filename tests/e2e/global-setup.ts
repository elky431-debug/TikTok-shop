import { rmSync } from 'node:fs';

/** Base de test vierge à chaque lancement (le serveur la recrée et la remplit tout seul). */
export default function globalSetup() {
  rmSync('.data/e2e-db.json', { force: true });
}
