import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DENIED_CODES, RUN, adminClient, anonClient, cleanupRun, createTestUser, supabaseReady, type TestUser } from './helpers';

/**
 * RLS avec de vrais utilisateurs connectés (clé anon + jeton de session), comme le ferait un navigateur
 * qui contournerait l'appli : deux utilisateurs et un formateur.
 */

const denied = (error: { code?: string } | null) => Boolean(error && DENIED_CODES.has(error.code ?? ''));

describe.skipIf(!supabaseReady)('RLS : chacun ne voit que ses données', () => {
  let alice: TestUser;
  let bob: TestUser;
  let coach: TestUser;
  let coachId = '';
  const productId = `${RUN}-rls`;

  beforeAll(async () => {
    alice = await createTestUser('alice');
    bob = await createTestUser('bob');
    coach = await createTestUser('coach');
    const admin = adminClient();
    const insertedCoach = await admin
      .from('coaches')
      .insert({ user_id: coach.id, training_name: 'Formation RLS', promo_code: `RLS${RUN.slice(-6).toUpperCase()}` })
      .select('id')
      .single();
    if (insertedCoach.error) throw new Error(insertedCoach.error.message);
    coachId = insertedCoach.data.id;
    // Alice est l'élève du formateur, Bob non.
    await admin.from('profiles').update({ coach_id: coachId, first_name: 'Alice', niches: ['beaute'] }).eq('id', alice.id);
    await admin.from('profiles').update({ first_name: 'Bob' }).eq('id', bob.id);
    const productInsert = await admin.from('products').insert({
      id: productId,
      provider: 'test',
      name: 'Produit RLS',
      niche: 'beaute',
      price_cents: 1500,
      commission_rate: 0.1,
    });
    if (productInsert.error) throw new Error(productInsert.error.message);
    await admin.from('scripts').insert([
      { user_id: alice.id, product_id: productId, format: 'demo', full_text: 'script d’Alice' },
      { user_id: bob.id, product_id: productId, format: 'demo', full_text: 'script de Bob' },
    ]);
    await admin.from('usage').insert({ user_id: bob.id, day: '2026-11-12', scripts_generated: 2 });
  }, 60_000);

  afterAll(async () => {
    if (supabaseReady) await cleanupRun([alice?.id, bob?.id, coach?.id].filter(Boolean));
  }, 60_000);

  it('un visiteur non connecté ne lit rien', async () => {
    const anon = anonClient();
    const profiles = await anon.from('profiles').select('id');
    expect(profiles.data ?? []).toHaveLength(0);
    const products = await anon.from('products').select('id');
    expect(denied(products.error) || (products.data ?? []).length === 0).toBe(true);
    const coachRpc = await anon.rpc('coach_students');
    expect(coachRpc.error).not.toBeNull();
  });

  it('un utilisateur ne lit que son profil', async () => {
    const { data, error } = await alice.client.from('profiles').select('id, email');
    expect(error).toBeNull();
    expect(data).toEqual([{ id: alice.id, email: alice.email }]);
    const bobRow = await alice.client.from('profiles').select('id').eq('id', bob.id);
    expect(bobRow.data).toEqual([]);
  });

  it('peut modifier son prénom, mais pas son plan ni son formateur', async () => {
    const ok = await alice.client.from('profiles').update({ first_name: 'Alice B.' }).eq('id', alice.id);
    expect(ok.error).toBeNull();
    const plan = await alice.client.from('profiles').update({ plan: 'proplus' }).eq('id', alice.id);
    expect(denied(plan.error)).toBe(true);
    const coachChange = await alice.client.from('profiles').update({ coach_id: null }).eq('id', alice.id);
    expect(denied(coachChange.error)).toBe(true);
    const other = await alice.client.from('profiles').update({ first_name: 'Piraté' }).eq('id', bob.id).select('id');
    expect(other.data ?? []).toHaveLength(0);
    const check = await adminClient().from('profiles').select('first_name, plan').eq('id', bob.id).single();
    expect(check.data).toEqual({ first_name: 'Bob', plan: 'free' });
  });

  it('ne peut lire ni le catalogue ni les instantanés (limites de plan)', async () => {
    for (const table of ['products', 'product_snapshots']) {
      const result = await alice.client.from(table).select('*').limit(1);
      expect(denied(result.error) || (result.data ?? []).length === 0).toBe(true);
    }
  });

  it('ne voit que ses scripts et ne peut pas en créer sans passer par le serveur', async () => {
    const mine = await alice.client.from('scripts').select('full_text');
    expect(mine.data?.map((s) => s.full_text)).toEqual(['script d’Alice']);
    const insert = await alice.client.from('scripts').insert({ user_id: alice.id, product_id: productId, format: 'demo' });
    expect(denied(insert.error)).toBe(true);
    const deleteBob = await alice.client.from('scripts').delete().eq('user_id', bob.id).select('id');
    expect(deleteBob.data ?? []).toHaveLength(0);
  });

  it('ne peut pas s’offrir des scripts (compteur d’usage)', async () => {
    const rpc = await alice.client.rpc('increment_usage', { p_user: alice.id, p_day: '2026-11-12', p_limit: -1 });
    expect(rpc.error).not.toBeNull();
    const write = await alice.client.from('usage').insert({ user_id: alice.id, day: '2026-11-12', scripts_generated: 0 });
    expect(denied(write.error)).toBe(true);
    const bobUsage = await alice.client.from('usage').select('*').eq('user_id', bob.id);
    expect(bobUsage.data ?? []).toHaveLength(0);
    const own = await bob.client.from('usage').select('scripts_generated');
    expect(own.data).toEqual([{ scripts_generated: 2 }]);
  });

  it('gère sa liste « mes produits » sans toucher à celle des autres', async () => {
    const mine = await alice.client.from('saved_products').insert({ user_id: alice.id, product_id: productId });
    expect(mine.error).toBeNull();
    const forBob = await alice.client.from('saved_products').insert({ user_id: bob.id, product_id: productId });
    expect(forBob.error).not.toBeNull();
    const bobSees = await bob.client.from('saved_products').select('*');
    expect(bobSees.data ?? []).toHaveLength(0);
  });

  it('le formateur ne voit ses élèves qu’en agrégé, jamais leur profil', async () => {
    const direct = await coach.client.from('profiles').select('id').eq('id', alice.id);
    expect(direct.data ?? []).toHaveLength(0);
    const scripts = await coach.client.from('scripts').select('id').eq('user_id', alice.id);
    expect(scripts.data ?? []).toHaveLength(0);

    const { data, error } = await coach.client.rpc('coach_students');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ student_id: alice.id, scripts_generated: 1, email: null });
    expect(Object.keys(data[0]).sort()).toEqual(
      ['eligibility', 'email', 'first_name', 'joined_at', 'last_seen_at', 'plan', 'products_followed', 'scripts_generated', 'student_id'].sort(),
    );

    // L'e-mail n'apparaît qu'avec le consentement de l'élève, qu'il donne lui-même.
    await alice.client.from('profiles').update({ share_email_with_coach: true }).eq('id', alice.id);
    const after = await coach.client.rpc('coach_students');
    expect(after.data?.[0].email).toBe(alice.email);

    // La fonction détaillée, qui prend un identifiant de formateur, reste réservée au serveur.
    const raw = await coach.client.rpc('coach_student_stats', { p_coach_id: coachId });
    expect(raw.error).not.toBeNull();
  });

  it('un élève ou un inconnu n’obtient aucun élève', async () => {
    const asStudent = await alice.client.rpc('coach_students');
    expect(asStudent.data ?? []).toHaveLength(0);
    const asOther = await bob.client.rpc('coach_students');
    expect(asOther.data ?? []).toHaveLength(0);
  });

  it('les tables techniques restent fermées', async () => {
    for (const table of ['billing_events', 'cron_runs', 'coach_applications']) {
      const result = await bob.client.from(table).select('*').limit(1);
      expect(denied(result.error) || (result.data ?? []).length === 0).toBe(true);
    }
  });
});
