import { describe, expect, it } from 'vitest';
import { createLocalSessionToken, verifyLocalSessionToken } from '@/lib/auth/local-session';
import { safeNextPath } from '@/lib/auth/redirects';
import { eligibilityFor } from '@/lib/profile-rules';
import { normalizeCode } from '@/lib/referral';

describe('session locale', () => {
  it('signe puis vérifie un jeton', () => {
    const token = createLocalSessionToken({ id: 'u1', email: 'a@b.fr' });
    expect(verifyLocalSessionToken(token)).toMatchObject({ uid: 'u1', email: 'a@b.fr' });
  });

  it('refuse un jeton modifié', () => {
    const token = createLocalSessionToken({ id: 'u1', email: 'a@b.fr' });
    const [data, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ uid: 'admin', email: 'x@y.fr', exp: 9e9 })).toString('base64url');
    expect(verifyLocalSessionToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyLocalSessionToken(`${data}.abc`)).toBeNull();
    expect(verifyLocalSessionToken(undefined)).toBeNull();
  });
});

describe('redirections', () => {
  it("n'accepte que les chemins internes", () => {
    expect(safeNextPath('/app/studio')).toBe('/app/studio');
    expect(safeNextPath('https://evil.com')).toBe('/app');
    expect(safeNextPath('//evil.com')).toBe('/app');
    expect(safeNextPath(null, '/x')).toBe('/x');
  });
});

describe('règles de profil', () => {
  it('passe en affilié à partir de 1 500 abonnés', () => {
    expect(eligibilityFor('0-500')).toBe('preparation');
    expect(eligibilityFor('500-1500')).toBe('preparation');
    expect(eligibilityFor('1500-5000')).toBe('affilie');
    expect(eligibilityFor(null)).toBe('preparation');
  });

  it('normalise les codes', () => {
    expect(normalizeCode(' léa-30 ')).toBe('LEA-30');
    expect(normalizeCode('abc123')).toBe('ABC123');
  });
});
