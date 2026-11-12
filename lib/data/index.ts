import { getRepo } from '@/lib/db';
import { env } from '@/lib/env';
import type { CacheStore } from './http';
import { MockProvider } from './mock';
import { NexscopeProvider } from './nexscope';
import type { ProductDataProvider } from './provider';
import { TikTokProvider } from './tiktok';

export type { ProductDataProvider, ProviderProduct, ProviderRunStats, SalesPoint } from './provider';

export type ProviderName = ProductDataProvider['name'];

/** Cache des réponses du fournisseur, stocké en base (table provider_cache ou fichier local). */
export function repoCache(): CacheStore {
  return {
    get: (key) => getRepo().getProviderCache(key),
    set: (key, value, expiresAt) => getRepo().setProviderCache(key, value, expiresAt),
  };
}

export function createProvider(name: ProviderName, cache: CacheStore = repoCache()): ProductDataProvider {
  switch (name) {
    case 'tiktok':
      return new TikTokProvider({ cache });
    case 'nexscope':
      return new NexscopeProvider({ cache });
    default:
      return new MockProvider();
  }
}

/** Fournisseur actif selon DATA_PROVIDER (auto : TikTok, sinon Nexscope, sinon données fictives). */
export function getProvider(): ProductDataProvider {
  return createProvider(env.dataProvider);
}

/**
 * Ordre d'essai de la tâche nocturne : le fournisseur choisi, puis Nexscope en repli s'il a sa clé,
 * puis les données fictives (jamais présentées comme réelles, voir lib/catalog.ts).
 */
export function providerChain(): ProviderName[] {
  const chain: ProviderName[] = [env.dataProvider];
  if (env.dataProvider === 'tiktok' && env.nexscopeApiKey) chain.push('nexscope');
  if (!chain.includes('mock')) chain.push('mock');
  return chain;
}
