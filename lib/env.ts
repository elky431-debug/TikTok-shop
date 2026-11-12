/**
 * Lecture centralisée des variables d'environnement.
 * Toute fonctionnalité dont la clé manque bascule sur un mode simulé, jamais sur un plantage.
 */

function read(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function positiveInt(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const env = {
  get supabaseUrl() {
    return read('NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabaseAnonKey() {
    return read('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },
  get supabaseServiceKey() {
    return read('SUPABASE_SERVICE_ROLE_KEY');
  },
  get anthropicKey() {
    return read('ANTHROPIC_API_KEY');
  },
  get anthropicModel() {
    return read('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';
  },
  get openaiKey() {
    return read('OPENAI_API_KEY');
  },
  /**
   * Modèle OpenAI des scripts. Défaut : gpt-6-luna, le moins cher des modèles en service qui gèrent les sorties
   * JSON structurées (doc officielle, 12 novembre 2026 ; voir DECISIONS.md, décision 115).
   */
  get openaiModel() {
    return read('OPENAI_MODEL') || 'gpt-6-luna';
  },
  /**
   * Fournisseur d'IA des scripts : AI_PROVIDER=openai ou anthropic. Sans AI_PROVIDER : Claude si sa clé est là,
   * sinon OpenAI. null = clé du fournisseur choisi absente ⇒ générateur simulé.
   */
  get aiProvider(): 'openai' | 'anthropic' | null {
    const value = read('AI_PROVIDER').toLowerCase();
    if (value === 'openai') return this.openaiKey ? 'openai' : null;
    if (value === 'anthropic' || value === 'claude') return this.anthropicKey ? 'anthropic' : null;
    if (this.anthropicKey) return 'anthropic';
    if (this.openaiKey) return 'openai';
    return null;
  },
  /** Nom lisible du modèle utilisé pour les scripts (écran admin). */
  get aiModelLabel(): string {
    if (this.aiProvider === 'openai') return `OpenAI (${this.openaiModel})`;
    if (this.aiProvider === 'anthropic') return `Claude (${this.anthropicModel})`;
    return 'Simulés';
  },
  get stripeSecretKey() {
    return read('STRIPE_SECRET_KEY');
  },
  get stripeWebhookSecret() {
    return read('STRIPE_WEBHOOK_SECRET');
  },
  get stripePrices() {
    return {
      pro_month: read('STRIPE_PRICE_PRO_MONTHLY'),
      pro_year: read('STRIPE_PRICE_PRO_YEARLY'),
      proplus_month: read('STRIPE_PRICE_PROPLUS_MONTHLY'),
      proplus_year: read('STRIPE_PRICE_PROPLUS_YEARLY'),
    };
  },
  get resendKey() {
    return read('RESEND_API_KEY');
  },
  get emailFrom() {
    return read('EMAIL_FROM');
  },
  get founderEmail() {
    return read('FOUNDER_EMAIL');
  },
  get discordBotToken() {
    return read('DISCORD_BOT_TOKEN');
  },
  get discordGuildId() {
    return read('DISCORD_GUILD_ID');
  },
  get discordInviteUrl() {
    return read('NEXT_PUBLIC_DISCORD_INVITE_URL');
  },
  get botApiSecret() {
    return read('BOT_API_SECRET');
  },
  /**
   * Fournisseur demandé. `auto` (ou vide) : TikTok si ses clés sont là, sinon Nexscope, sinon données fictives.
   * Une valeur explicite (`tiktok`, `nexscope`, `mock`) l'emporte toujours.
   */
  get dataProvider(): 'mock' | 'tiktok' | 'nexscope' {
    const value = read('DATA_PROVIDER').toLowerCase();
    if (value === 'tiktok' || value === 'nexscope' || value === 'mock') return value;
    if (this.tiktokAppKey && this.tiktokAppSecret) return 'tiktok';
    if (this.nexscopeApiKey) return 'nexscope';
    return 'mock';
  },
  /** Nombre maximum d'appels au fournisseur réel par exécution de la tâche nocturne. */
  get dataMaxCallsPerNight() {
    return positiveInt(read('DATA_MAX_CALLS_PER_NIGHT'), 60);
  },
  /** Débit maximum vers le fournisseur (requêtes par seconde). */
  get dataRatePerSecond() {
    return positiveInt(read('DATA_RATE_PER_SECOND'), 1);
  },
  /** Durée de vie du cache des réponses du fournisseur, en heures. */
  get dataCacheHours() {
    return positiveInt(read('DATA_CACHE_HOURS'), 20);
  },
  /** Pages lues par niche (TikTok : 20 produits par page ; Nexscope : 10). */
  get dataPagesPerNiche() {
    return positiveInt(read('DATA_PAGES_PER_NICHE'), 3);
  },
  /** Produits les mieux notés dont on demande les vidéos qui vendent (fournisseur réel). */
  get dataVideoProducts() {
    return positiveInt(read('DATA_VIDEO_PRODUCTS'), 10);
  },
  /** Correspondance niche → catégorie de 1er niveau TikTok Shop, ex. « beaute:601450,maison:600001 ». */
  get tiktokCategoryMap() {
    return read('TIKTOK_CATEGORY_MAP');
  },
  get tiktokAppKey() {
    return read('TIKTOK_APP_KEY');
  },
  get tiktokAppSecret() {
    return read('TIKTOK_APP_SECRET');
  },
  get tiktokAccessToken() {
    return read('TIKTOK_ACCESS_TOKEN');
  },
  get nexscopeApiKey() {
    return read('NEXSCOPE_API_KEY');
  },
  get cronSecret() {
    return read('CRON_SECRET');
  },
  get siteUrl() {
    return (read('NEXT_PUBLIC_SITE_URL') || 'http://localhost:3000').replace(/\/$/, '');
  },
  get adminEmails(): string[] {
    return read('ADMIN_EMAILS')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
  get localAuthSecret() {
    return read('LOCAL_AUTH_SECRET') || 'tiktrend-mode-local-uniquement-ne-pas-utiliser-en-production';
  },
  get localDbPath() {
    return read('LOCAL_DB_PATH') || '.data/local-db.json';
  },
};

/** Supabase est utilisé seulement si les trois clés sont présentes. */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceKey);
}

/** Mode local : aucune clé Supabase, base JSON + lien magique simulé. */
export function isLocalMode(): boolean {
  return !isSupabaseConfigured();
}

export function isStripeConfigured(): boolean {
  return Boolean(env.stripeSecretKey);
}

/** Un fournisseur d'IA est choisi et sa clé est présente (sinon : scripts simulés). */
export function isAiConfigured(): boolean {
  return env.aiProvider !== null;
}

export function isResendConfigured(): boolean {
  return Boolean(env.resendKey && env.emailFrom);
}

/** Adresse admin par défaut en mode local, pour que tout le parcours soit testable sans clé. */
export const LOCAL_ADMIN_EMAIL = 'admin@tiktrend.local';

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const admins = env.adminEmails;
  if (admins.length === 0 && isLocalMode()) return normalized === LOCAL_ADMIN_EMAIL;
  return admins.includes(normalized);
}
