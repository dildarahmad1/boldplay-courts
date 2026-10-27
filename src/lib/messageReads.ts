import { supabase } from "@/integrations/supabase/client";

export interface MessagesChangedDetail {
  userId?: string;
  threadId?: string;
  unreadCount?: number;
}

/** Mark incoming messages only. Legacy NULL read flags also mean unread. */
export async function markConversationRead(userId: string, threadId: string) {
  const { data, error } = await supabase.from("messages")
    .update({ read: true }).eq("thread_id", threadId).eq("to_user_id", userId)
    .or("read.eq.false,read.is.null").select("id");
  if (error) throw error;
  if (!data?.length) {
    const { count, error: checkError } = await supabase.from("messages")
      .select("id", { count: "exact", head: true }).eq("thread_id", threadId)
      .eq("to_user_id", userId).or("read.eq.false,read.is.null");
    if (checkError) throw checkError;
    if (count) throw new Error("Messages could not be marked as read. Please try again.");
  }
  window.dispatchEvent(new CustomEvent<MessagesChangedDetail>("yarika:messages-changed", {
    detail: { userId, threadId, unreadCount: data?.length ?? 0 },
  }));
}
