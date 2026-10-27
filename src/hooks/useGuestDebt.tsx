import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface GuestDebt {
  id: string;
  guest_user_id: string;
  dispute_id: string;
  booking_id: string;
  amount: number;
  currency: string;
  status: string;
  reason: string;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
  notes: string | null;
  disputes?: {
    id: string;
    category: string;
    description: string;
    subject: string;
  };
  bookings?: {
    id: string;
    checkin_date: string;
    checkout_date: string;
    listings: {
      title: string;
    };
  };
}

export const useGuestDebt = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const requestSequence = useRef({ value: 0 }).current;
  const [debts, setDebts] = useState<GuestDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasOutstandingDebt, setHasOutstandingDebt] = useState(false);
  const [error, setError] = useState(false);

  const fetchDebts = useCallback(async () => {
    const request = ++requestSequence.value;
    if (!userId) {
      setDebts([]);
      setHasOutstandingDebt(false);
      setError(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);
    try {
      const { data, error } = await supabase
        .from("guest_debts")
        .select(`
          *,
          disputes (
            id,
            category,
            description,
            subject
          ),
          bookings (
            id,
            checkin_date,
            checkout_date,
            listings (
              title
            )
          )
        `)
        .eq("guest_user_id", userId)
        .eq("status", "outstanding")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (request !== requestSequence.value) return;

      setDebts(data || []);
      setHasOutstandingDebt((data || []).length > 0);
    } catch (error) {
      console.error("Error fetching guest debts:", error);
      if (request === requestSequence.value) setError(true);
    } finally {
      if (request === requestSequence.value) setLoading(false);
    }
  }, [userId, requestSequence]);

  useEffect(() => {
    void fetchDebts();
    return () => { requestSequence.value++; };
  }, [fetchDebts, requestSequence]);

  return {
    debts,
    hasOutstandingDebt,
    loading,
    error,
    refetch: fetchDebts,
  };
};
