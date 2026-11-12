import { env } from '@/lib/env';
import { MockProvider } from './mock';
import { NexscopeProvider } from './nexscope';
import type { ProductDataProvider } from './provider';
import { TikTokProvider } from './tiktok';

export type { ProductDataProvider, ProviderProduct, SalesPoint } from './provider';

/** Fournisseur actif selon DATA_PROVIDER (mock par défaut). */
export function getProvider(): ProductDataProvider {
  switch (env.dataProvider) {
    case 'tiktok':
      return new TikTokProvider();
    case 'nexscope':
      return new NexscopeProvider();
    default:
      return new MockProvider();
  }
}
