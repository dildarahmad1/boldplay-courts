import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authorization = req.headers.get('Authorization') ?? '';
    const token = authorization.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Authentication required' }, 401);

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: 'Invalid session' }, 401);

    const { data: adminRole, error: roleLookupError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', authData.user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (roleLookupError) return json({ error: 'Could not verify administrator access. Please try again.' }, 503);
    if (!adminRole) return json({ error: 'Administrator access required' }, 403);
    const { data: adminProfile, error: adminProfileError } = await adminClient.from('profiles').select('status').eq('id', authData.user.id).maybeSingle();
    if (adminProfileError) return json({ error: 'Could not verify administrator access. Please try again.' }, 503);
    if (adminProfile?.status !== 'active') return json({ error: 'An active administrator account is required.' }, 403);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid account details' }, 400);
    const email = String(body.email ?? '').trim().toLowerCase();
    const firstName = String(body.first_name ?? '').trim();
    const lastName = String(body.last_name ?? '').trim();
    const phone = String(body.phone ?? '').trim() || null;
    const password = String(body.password ?? '');
    const language = ['en', 'ckb', 'kmr', 'ar'].includes(body.language) ? body.language : 'ckb';
    if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'A valid email is required' }, 400);
    if (!firstName) return json({ error: 'Host name is required' }, 400);
    if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, phone, requested_role: 'host', language },
      app_metadata: { role: 'host' },
    });
    if (createError) return json({ error: ['email_exists', 'user_already_exists'].includes(createError.code || '')
      ? 'An account with this email already exists.' : 'Host creation failed. Check the details and try again.' }, 400);

    const userId = created.user?.id;
    if (!userId) return json({ error: 'Host account was not created' }, 500);

    try {
    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName || null,
      phone,
      verified: true,
      status: 'active',
    }, { onConflict: 'id' });
    if (profileError) throw profileError;

    const { error: roleError } = await adminClient.from('user_roles').upsert({
      user_id: userId,
      role: 'host',
    }, { onConflict: 'user_id,role' });
    if (roleError) throw roleError;

    } catch (setupError) {
      console.error('Host account setup failed', setupError);
      // Remove only the provisional account created by this request, so a
      // failed role/profile write cannot leave unusable credentials behind.
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(userId);
      if (cleanupError) {
        console.error('Host account cleanup failed', cleanupError);
        return json({ error: 'Account setup could not be completed. Contact support before trying this email again.' }, 500);
      }
      return json({ error: 'Host creation failed. Check the details and try again.' }, 500);
    }

    return json({ success: true, user_id: userId, email, credentials_created: true }, 201);
  } catch (error) {
    console.error('admin-create-host failed', error);
    return json({ error: 'Host creation failed. Check the details and try again.' }, 500);
  }
});
