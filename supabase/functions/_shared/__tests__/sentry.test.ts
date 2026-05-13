/**
 * Deno unit tests for captureServerException.
 *   Run:  deno test --allow-env --allow-net supabase/functions/_shared/__tests__/sentry.test.ts
 * The DSN cache is memoised at module-load — each test sets the env BEFORE the dynamic import
 * so it gets its own module evaluation and its own _dsn value.
 */

const origFetch = globalThis.fetch;

function stubFetch(): { calls: Array<{ url: string; body: string }> } {
  const calls: Array<{ url: string; body: string }> = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;
  return { calls };
}

function restoreFetch(): void {
  globalThis.fetch = origFetch;
}

// Cache-bust the import on each test so the module re-reads SENTRY_DSN at load.
let cacheBust = 0;
async function freshImport(): Promise<typeof import('../sentry.ts')> {
  cacheBust++;
  return await import(`../sentry.ts?t=${cacheBust}`);
}

Deno.test('captureServerException — no-op when SENTRY_DSN unset', async () => {
  Deno.env.delete('SENTRY_DSN');
  const { captureServerException } = await freshImport();
  const { calls } = stubFetch();
  try {
    captureServerException(new Error('x'), { fn: 'trips' });
    // give the (synchronous) fetch path a tick — but here, no fetch should fire at all.
    await new Promise((r) => setTimeout(r, 5));
    if (calls.length !== 0) throw new Error(`expected 0 fetch calls, got ${calls.length}`);
  } finally {
    restoreFetch();
  }
});

Deno.test('captureServerException — POSTs an envelope when SENTRY_DSN is a valid DSN', async () => {
  Deno.env.set('SENTRY_DSN', 'https://abc123@o1.ingest.sentry.io/42');
  const { captureServerException } = await freshImport();
  const { calls } = stubFetch();
  try {
    captureServerException(new Error('boom'), { fn: 'trips', method: 'POST', path: '/trips', status: 500 });
    await new Promise((r) => setTimeout(r, 5));
    if (calls.length !== 1) throw new Error(`expected 1 fetch call, got ${calls.length}`);
    if (!calls[0].url.endsWith('/api/42/envelope/')) throw new Error(`bad ingest url: ${calls[0].url}`);
    if (!calls[0].body.includes('"exception"')) throw new Error('envelope missing exception block');
    if (!calls[0].body.includes('"boom"')) throw new Error('envelope missing error message');
    if (!calls[0].body.includes('"fn":"trips"')) throw new Error('envelope missing fn tag');
  } finally {
    restoreFetch();
    Deno.env.delete('SENTRY_DSN');
  }
});

Deno.test('captureServerException — no-op when DSN string is malformed', async () => {
  Deno.env.set('SENTRY_DSN', 'not-a-url');
  const { captureServerException } = await freshImport();
  const { calls } = stubFetch();
  try {
    captureServerException(new Error('x'), { fn: 'trips' });
    await new Promise((r) => setTimeout(r, 5));
    if (calls.length !== 0) throw new Error('malformed DSN should be a no-op');
  } finally {
    restoreFetch();
    Deno.env.delete('SENTRY_DSN');
  }
});

Deno.test('captureServerException — wraps non-Error throwables', async () => {
  Deno.env.set('SENTRY_DSN', 'https://abc123@o1.ingest.sentry.io/42');
  const { captureServerException } = await freshImport();
  const { calls } = stubFetch();
  try {
    captureServerException('plain string error', { fn: 'auth' });
    await new Promise((r) => setTimeout(r, 5));
    if (calls.length !== 1) throw new Error('expected 1 fetch call');
    if (!calls[0].body.includes('plain string error')) throw new Error('string error message missing');
  } finally {
    restoreFetch();
    Deno.env.delete('SENTRY_DSN');
  }
});
