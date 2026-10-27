import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { ensureHostRole } from "@/lib/hostRegistration";

export const useUserRole = () => {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  useEffect(() => {
    // CRITICAL: Wait for auth to finish loading first
    if (authLoading) {
      return; // Don't do anything while auth is loading
    }

    // Auth has finished loading
    if (!user) {
      // No user found after auth finished - set empty roles
      setRoles([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setRoles([]);
    setLoading(true);
    // Discard responses belonging to a previous signed-in account.
    const fetchRoles = async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (cancelled) return;
      // app_metadata is written only by the trusted backend. Merge it with the
      // role table so accounts created before the role-table grant was fixed
      // are still routed to the correct protected dashboard.
      const metadataRole = typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null;
      const databaseRoles = !error && data ? data.map((r) => r.role) : [];
      setRoles([...new Set([...databaseRoles, ...(metadataRole ? [metadataRole] : [])])]);
      setLoadedUserId(user.id);
      setLoading(false);
    };

    fetchRoles();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const hasRole = (role: string) => !authLoading && loadedUserId === user?.id && roles.includes(role);
  const isAdmin = hasRole("admin");
  const isHost = !isAdmin && hasRole("host");
  const isGuest = !isAdmin && !isHost && hasRole("guest");
  const primaryRole: "admin" | "host" | "guest" | null = isAdmin ? "admin" : isHost ? "host" : isGuest ? "guest" : null;

  const requestHostRole = async () => {
    if (!user) return { error: "Not authenticated" };

    try {
      await ensureHostRole();
      setRoles(current => [...new Set([...current, "host"])]);
      return { error: null };
    } catch (error) {
      return { error: error && typeof error === "object" && "message" in error ? String(error.message) : "Please try again." };
    }
  };

  return { roles, primaryRole, loading: authLoading || loading || (!!user && loadedUserId !== user.id), hasRole, isHost, isAdmin, isGuest, requestHostRole };
};
