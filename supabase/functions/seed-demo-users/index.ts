import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

import { authenticateCronRequest } from '../_shared/cron-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEMO_USERS = [
  {
    email: 'guest@demo.com',
    password: Deno.env.get('DEMO_GUEST_PASSWORD') || '',
    role: 'guest',
    first_name: 'Demo',
    last_name: 'Player',
  },
  {
    email: 'host@demo.com',
    password: Deno.env.get('DEMO_HOST_PASSWORD') || '',
    role: 'host',
    first_name: 'Demo',
    last_name: 'Venue Owner',
  },
  {
    email: 'admin@demo.com',
    password: Deno.env.get('DEMO_ADMIN_PASSWORD') || '',
    role: 'admin',
    first_name: 'Demo',
    last_name: 'Admin',
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Development utility: disabled unless explicitly enabled and authenticated.
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  if (Deno.env.get('ALLOW_DEMO_SEED') !== 'true') return new Response('Not found', { status: 404, headers: corsHeaders });
  const authError = authenticateCronRequest(req);
  if (authError) return authError;
  if (DEMO_USERS.some(user => user.password.length < 12)) {
    return new Response('Set all DEMO_*_PASSWORD secrets to at least 12 characters', { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const results: Record<string, unknown>[] = [];

  try {
    for (const u of DEMO_USERS) {
      let userId: string | null = null;

      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { first_name: u.first_name, last_name: u.last_name },
      });

      if (created?.user) {
        userId = created.user.id;
      } else {
        // Already exists: find and reset the password so the demo login always works
        const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existing = list?.users?.find((x) => x.email?.toLowerCase() === u.email);
        if (!existing) {
          results.push({ email: u.email, ok: false, error: createError?.message ?? 'not found' });
          continue;
        }
        userId = existing.id;
        await supabase.auth.admin.updateUserById(userId, {
          password: u.password,
          email_confirm: true,
        });
      }

      await supabase.from('profiles').upsert({
        id: userId,
        email: u.email,
        first_name: u.first_name,
        last_name: u.last_name,
        verified: true,
        is_demo: true,
        status: 'active',
      }, { onConflict: 'id' });

      await supabase.from('user_roles').upsert(
        { user_id: userId, role: u.role },
        { onConflict: 'user_id,role' },
      );

      results.push({ email: u.email, ok: true, user_id: userId, role: u.role });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e), results }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
