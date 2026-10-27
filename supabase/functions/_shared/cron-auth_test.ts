import { authenticateCronRequest } from './cron-auth.ts';

Deno.test('scheduled task authentication rejects missing, absent and incorrect secrets', () => {
  const current = Deno.env.get('LOVABLE_CRON_SECRET');
  const previous = Deno.env.get('LOVABLE_CRON_SECRET_PREVIOUS');
  try {
    Deno.env.delete('LOVABLE_CRON_SECRET');
    if (authenticateCronRequest(new Request('http://localhost'))?.status !== 500) throw new Error('Missing configuration must fail closed');
    Deno.env.set('LOVABLE_CRON_SECRET', 'current-test-fixture');
    Deno.env.set('LOVABLE_CRON_SECRET_PREVIOUS', 'previous-test-fixture');
    for (const header of ['', 'Bearer incorrect', 'Basic current-test-fixture']) {
      if (authenticateCronRequest(new Request('http://localhost', { headers: { authorization: header } }))?.status !== 401) throw new Error('Invalid authorization accepted');
    }
    for (const token of ['current-test-fixture', 'previous-test-fixture']) {
      if (authenticateCronRequest(new Request('http://localhost', { headers: { authorization: `Bearer ${token}` } })) !== null) throw new Error('Valid rotation token rejected');
    }
  } finally {
    if (current === undefined) Deno.env.delete('LOVABLE_CRON_SECRET'); else Deno.env.set('LOVABLE_CRON_SECRET', current);
    if (previous === undefined) Deno.env.delete('LOVABLE_CRON_SECRET_PREVIOUS'); else Deno.env.set('LOVABLE_CRON_SECRET_PREVIOUS', previous);
  }
});
