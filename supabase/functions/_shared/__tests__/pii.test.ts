/**
 * Deno unit tests for the anti-disintermediation helpers in `../pii.ts`.
 *   Run:  deno test supabase/functions/_shared/__tests__/pii.test.ts
 *
 * The reveal predicates (`can_reveal_driver` / `can_reveal_agent`) live in SQL
 * (migration 022) and are tested at the integration level by
 * `scripts/test-pii-redaction.cjs`. This file only covers the in-memory pieces:
 * `stripPhones`, `assertNoPhones`, `redactDriver`, `redactAgent`, `logPiiReveal`.
 */
import {
  assertNoPhones,
  logPiiReveal,
  PhoneInTextError,
  redactAgent,
  redactDriver,
  stripPhones,
} from '../pii.ts';

Deno.test('stripPhones — replaces a 10-digit Indian mobile', () => {
  const got = stripPhones('Call me on 9876543210 please');
  if (got !== 'Call me on [contact hidden] please') {
    throw new Error(`unexpected: ${got}`);
  }
});

Deno.test('stripPhones — handles multiple numbers in one string', () => {
  const got = stripPhones('Try 9876543210 or 6012345678 (the second is fine)');
  if (got !== 'Try [contact hidden] or [contact hidden] (the second is fine)') {
    throw new Error(`unexpected: ${got}`);
  }
});

Deno.test('stripPhones — leaves landline / non-mobile alone', () => {
  // landlines start 2-5, mobiles 6-9; a 10-digit number starting with 5 is left alone
  const got = stripPhones('Try 5876543210 or 044-2345-6789');
  if (got !== 'Try 5876543210 or 044-2345-6789') {
    throw new Error(`unexpected: ${got}`);
  }
});

Deno.test('stripPhones — passes through null / undefined / empty', () => {
  if (stripPhones(null) !== null) throw new Error('null');
  if (stripPhones(undefined) !== null) throw new Error('undefined');
  if (stripPhones('') !== '') throw new Error('empty');
});

Deno.test('assertNoPhones — throws PhoneInTextError when a mobile is present', () => {
  let caught: unknown = null;
  try {
    assertNoPhones('Reach me at 9876543210', 'notes');
  } catch (e) {
    caught = e;
  }
  if (!(caught instanceof PhoneInTextError)) {
    throw new Error(`expected PhoneInTextError, got ${caught}`);
  }
  if ((caught as PhoneInTextError).field !== 'notes') {
    throw new Error('field not propagated');
  }
});

Deno.test('assertNoPhones — passes when no mobile is present', () => {
  assertNoPhones('No contact details here', 'notes');
  assertNoPhones(null, 'notes');
  assertNoPhones(undefined, 'notes');
});

Deno.test('redactDriver — strips phone + email when reveal=false; keeps name + photo (commercial branding)', () => {
  const row = {
    id: 'd1',
    user_id: 'u1',
    full_name: 'Raj',
    phone: '9876543210',
    email: 'raj@example.com',
    profile_photo_url: 'https://example.com/r.jpg',
    display_handle: 'A2X9F1',
    rating_avg: 4.7,
  };
  const out = redactDriver(row, false);
  if ('phone' in out) throw new Error('phone leaked');
  if ('email' in out) throw new Error('email leaked');
  if (out.full_name !== 'Raj') throw new Error('name should stay visible — commercial branding');
  if (out.profile_photo_url !== 'https://example.com/r.jpg') throw new Error('photo should stay visible — commercial branding');
  if (out.display_handle !== 'A2X9F1') throw new Error('handle missing');
  if (out.rating_avg !== 4.7) throw new Error('rating dropped');
});

Deno.test('redactDriver — returns the row unchanged when reveal=true', () => {
  const row = { id: 'd1', user_id: 'u1', full_name: 'Raj', phone: '9876543210' };
  const out = redactDriver(row, true);
  if (out.full_name !== 'Raj') throw new Error('name dropped on reveal');
  if (out.phone !== '9876543210') throw new Error('phone dropped on reveal');
});

Deno.test('redactDriver — does not mutate the input row', () => {
  const row = { id: 'd1', user_id: 'u1', full_name: 'Raj', phone: '9876543210' };
  redactDriver(row, false);
  if (row.full_name !== 'Raj') throw new Error('input mutated');
});

Deno.test('redactAgent — mirrors redactDriver (strips phone + email, keeps name + photo)', () => {
  const row = {
    id: 'a1',
    user_id: 'u2',
    full_name: 'Priya',
    phone: '9000000000',
    email: 'p@x.com',
    profile_photo_url: 'p.jpg',
    display_handle: 'A11111',
  };
  const out = redactAgent(row, false);
  if ('phone' in out || 'email' in out) throw new Error('contact PII leaked');
  if (out.full_name !== 'Priya') throw new Error('name should stay visible');
  if (out.profile_photo_url !== 'p.jpg') throw new Error('photo should stay visible');
  if (out.display_handle !== 'A11111') throw new Error('handle missing');
});

Deno.test('logPiiReveal — skips self-views and missing ids', async () => {
  const inserts: string[] = [];
  const fakeDb = {
    from() {
      return {
        insert(row: { surface: string }) {
          inserts.push(row.surface);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as Parameters<typeof logPiiReveal>[0];

  const count = (): number => inserts.length;

  await logPiiReveal(fakeDb, { viewer_user_id: 'u1', target_user_id: 'u1', surface: 'self' });
  if (count() !== 0) throw new Error('self-view should not insert');

  await logPiiReveal(fakeDb, { viewer_user_id: '', target_user_id: 'u2', surface: 'empty' });
  if (count() !== 0) throw new Error('empty viewer should not insert');

  await logPiiReveal(fakeDb, { viewer_user_id: 'u1', target_user_id: 'u2', surface: 'ok' });
  if (count() !== 1 || inserts[0] !== 'ok') {
    throw new Error('valid reveal should insert exactly once');
  }
});

Deno.test('logPiiReveal — swallows insert errors', async () => {
  const failingDb = {
    from() {
      return {
        insert() {
          throw new Error('boom');
        },
      };
    },
  } as unknown as Parameters<typeof logPiiReveal>[0];

  // Must not propagate
  await logPiiReveal(failingDb, { viewer_user_id: 'u1', target_user_id: 'u2', surface: 's' });
});
