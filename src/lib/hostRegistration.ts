import { supabase } from "@/integrations/supabase/client";

// Requests only the signed-in user's host role; database RLS remains authoritative.
export async function ensureHostRole() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error("Please sign in again.");
  const readRoles = () => supabase.from("user_roles").select("role").eq("user_id", user.id);
  const existing = await readRoles();
  if (existing.error) throw existing.error;
  if (existing.data.some(row => row.role === "host" || row.role === "admin")) return;
  const result = await supabase.from("user_roles").insert({ user_id: user.id, role: "host" });
  if (result.error && result.error.code !== "23505") throw result.error;
  const verified = await readRoles();
  if (verified.error) throw verified.error;
  if (!verified.data.some(row => row.role === "host" || row.role === "admin")) {
    throw new Error("Host access could not be confirmed. Please try again.");
  }
}
