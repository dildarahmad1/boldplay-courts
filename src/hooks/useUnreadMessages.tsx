import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDemoData } from "@/hooks/useDemoData";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import type { MessagesChangedDetail } from "@/lib/messageReads";

export const useUnreadMessages = (userId: string | undefined, isAdmin = false) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const { isDemoMode, getAdminSupportUnreadCount, getThreads } = useDemoData();
  const { toast } = useToast();
  const { language } = useLanguage();
  const current = useRef({ getAdminSupportUnreadCount, getThreads, toast, language });
  current.current = { getAdminSupportUnreadCount, getThreads, toast, language };

  useEffect(() => {
    setUnreadCount(0);
    if (!userId) return;
    let active = true;
    let latestRequest = 0;
    const fetchUnreadCount = async () => {
      const request = ++latestRequest;
      try {
        let total = 0;
        if (isDemoMode) {
          total = isAdmin ? current.current.getAdminSupportUnreadCount()
            : current.current.getThreads(null, "recent").reduce((sum, thread) => sum + (Number(thread.unread_count) || 0), 0);
        } else if (isAdmin) {
          const { data, error } = await supabase.rpc("admin_get_support_conversations", { p_admin_user_id: userId, p_search_query: null, p_sort_by: "recent" });
          if (error) throw error;
          total = (data || []).reduce((sum, thread) => sum + (Number(thread.unread_count) || 0), 0);
        } else {
          const { count, error } = await supabase.from("messages").select("id", { count: "exact", head: true })
            .eq("to_user_id", userId).or("read.eq.false,read.is.null");
          if (error) throw error;
          total = count ?? 0;
        }
        if (active && request === latestRequest) setUnreadCount(total);
      } catch (error) { console.error("Error fetching unread count:", error); }
    };
    const handleMessagesChanged = (event: Event) => {
      const detail = (event as CustomEvent<MessagesChangedDetail>).detail;
      if (detail?.userId && detail.userId !== userId) return;
      if (detail?.unreadCount && detail.unreadCount > 0) setUnreadCount(count => Math.max(0, count - detail.unreadCount!));
      void fetchUnreadCount();
    };
    const refresh = () => { if (document.visibilityState === "visible") void fetchUnreadCount(); };
    const storageChanged = (event: StorageEvent) => { if (event.key?.startsWith("demo_snapshot_")) refresh(); };
    window.addEventListener("yarika:messages-changed", handleMessagesChanged);
    window.addEventListener("demo-messages-updated", refresh);
    window.addEventListener("storage", storageChanged);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 30000);
    void fetchUnreadCount();
    const channel = isDemoMode ? null : supabase.channel(`unread:${userId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `to_user_id=eq.${userId}` }, payload => {
        if (payload.eventType === "INSERT") {
          const message = payload.new as { from_user_id?: string; body?: string; read?: boolean | null };
          if (message.from_user_id !== userId && message.read !== true) {
            current.current.toast({ title: translateUiText("New message", current.current.language), description: message.body?.trim().slice(0, 140) || translateUiText("You received a new message.", current.current.language) });
          }
        }
        void fetchUnreadCount();
      }).subscribe();
    return () => {
      active = false; latestRequest++;
      window.clearInterval(interval);
      window.removeEventListener("yarika:messages-changed", handleMessagesChanged);
      window.removeEventListener("demo-messages-updated", refresh);
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, isDemoMode, isAdmin]);
  return unreadCount;
};
