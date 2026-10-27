import { markConversationRead } from "@/lib/messageReads";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "./useDebounce";
import { useToast } from "@/hooks/use-toast";
import { SupportThread } from "@/types/support-inbox";
import { Message } from "@/types/inbox";
import { useDemoData } from "@/hooks/useDemoData";

export const useAdminSupportInbox = (adminUserId: string | undefined) => {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const { toast } = useToast();
  const { isDemoMode, getAdminSupportThreads, getAdminSupportMessages, sendAdminSupportMessage, markAdminSupportThreadAsRead } = useDemoData();
  
  const debouncedSearch = useDebounce(searchQuery, 500);
  const threadRequest = useRef(0);
  const messageRequest = useRef(0);
  const selectedThreadRef = useRef(selectedThreadId);
  selectedThreadRef.current = selectedThreadId;

  const fetchThreads = async () => {
    if (!adminUserId) return;
    const request = ++threadRequest.current;
    
    try {
      if (isDemoMode) {
        setThreads(getAdminSupportThreads(debouncedSearch, sortBy));
        setLoading(false);
        return;
      }
      
      const { data, error } = await supabase.rpc('admin_get_support_conversations', {
        p_admin_user_id: adminUserId,
        p_search_query: debouncedSearch || null,
        p_sort_by: sortBy
      });

      if (error) throw error;
      
      // Fetch lock status for each thread
      const threadsWithLockStatus = await Promise.all(
        (data || []).map(async (thread) => {
          const { data: threadData } = await supabase
            .from('message_threads')
            .select('is_locked, locked_at, locked_reason')
            .eq('id', thread.thread_id)
            .single();
          
          return {
            ...thread,
            is_locked: threadData?.is_locked || false,
            locked_at: threadData?.locked_at,
            locked_reason: threadData?.locked_reason
          };
        })
      );
      
      if (request === threadRequest.current) setThreads(threadsWithLockStatus);
    } catch (error) {
      console.error('Error fetching support threads:', error);
      toast({
        title: "Error",
        description: "Failed to load support conversations",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (threadId: string) => {
    const request = ++messageRequest.current;
    setMessagesLoading(true);
    try {
      if (isDemoMode) {
        setMessages(getAdminSupportMessages(threadId));
        
        await markThreadAsRead(threadId);

        if (request === messageRequest.current) setMessagesLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (request !== messageRequest.current || selectedThreadRef.current !== threadId) return;

      setMessages(data || []);

      // Mark messages as read for admins
      await markThreadAsRead(threadId);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Error",
        description: "Failed to load messages",
        variant: "destructive"
      });
    } finally {
      if (request === messageRequest.current) setMessagesLoading(false);
    }
  };

  const markThreadAsRead = async (threadId: string) => {
    if (!adminUserId || document.visibilityState !== "visible" || selectedThreadRef.current !== threadId) return;
    try {
      if (isDemoMode) markAdminSupportThreadAsRead(threadId);
      else await markConversationRead(adminUserId, threadId);
      threadRequest.current++;
      setThreads(prev => prev.map(thread => thread.thread_id === threadId ? { ...thread, unread_count: 0 } : thread));
      setMessages(prev => prev.map(message => message.thread_id === threadId && message.to_user_id === adminUserId ? { ...message, read: true } : message));
      void fetchThreads();
    } catch (error) {
      console.error("Error marking messages as read:", error);
      toast({ title: "Could not update read status", description: "Messages could not be marked as read. Please try again.", variant: "destructive" });
    }
  };

  const sendMessage = async (
    threadId: string,
    toUserId: string,
    body: string,
    attachmentUrl?: string,
    attachmentType?: string
  ) => {
    if (!adminUserId) return;

    const optimisticId = `pending-${crypto.randomUUID()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      thread_id: threadId,
      from_user_id: adminUserId,
      to_user_id: toUserId,
      body,
      attachment_url: attachmentUrl || null,
      attachment_type: attachmentType || null,
      read: false,
      created_at: new Date().toISOString(),
    };
    
    try {
      if (isDemoMode) {
        const msg = sendAdminSupportMessage(threadId, toUserId, body);
        if (msg) {
          setMessages(prev => [...prev, msg]);
          
          // Update the thread's last_message and last_message_time in UI
          setThreads(prev => prev.map(thread => 
            thread.thread_id === threadId
              ? {
                  ...thread,
                  last_message: body,
                  last_message_time: msg.created_at
                }
              : thread
          ));
        }
        return;
      }
      
      setMessages(prev => [...prev, optimisticMessage]);

      const { data: savedMessage, error } = await supabase
        .from('messages')
        .insert({
          thread_id: threadId,
          from_user_id: adminUserId,
          to_user_id: toUserId,
          body,
          attachment_url: attachmentUrl,
          attachment_type: attachmentType,
          read: false,
        })
        .select('*')
        .single();

      if (error) throw error;

      setMessages(prev => {
        const withoutPending = prev.filter(message => message.id !== optimisticId);
        return withoutPending.some(message => message.id === savedMessage.id)
          ? withoutPending
          : [...withoutPending, savedMessage];
      });

      setThreads(prev => prev.map(thread =>
        thread.thread_id === threadId
          ? { ...thread, last_message: body, last_message_time: savedMessage.created_at }
          : thread
      ));
    } catch (error) {
      setMessages(prev => prev.filter(message => message.id !== optimisticId));
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive"
      });
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      if (!adminUserId) throw new Error("You must be signed in to upload attachments");
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${adminUserId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('message-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data, error: signedUrlError } = await supabase.storage
        .from('message-attachments')
        .createSignedUrl(filePath, 60 * 60 * 24 * 7);

      if (signedUrlError) throw signedUrlError;
      return data.signedUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: "Error",
        description: "Failed to upload image",
        variant: "destructive"
      });
      return null;
    }
  };

  // Fetch threads when dependencies change
  useEffect(() => {
    if (adminUserId) {
      fetchThreads();
    }
  }, [adminUserId, debouncedSearch, sortBy]);

  // Fetch messages when thread is selected
  useEffect(() => {
    if (selectedThreadId) {
      fetchMessages(selectedThreadId);
    } else {
      setMessages([]);
    }
  }, [selectedThreadId]);

  // Real-time updates for support threads
  useEffect(() => {
    if (!adminUserId) return;

    // In demo mode, listen for message updates
    if (isDemoMode) {
      const handleDemoUpdate = () => {
        fetchThreads();
      };
      window.addEventListener('demo-messages-updated', handleDemoUpdate);

      return () => {
        window.removeEventListener('demo-messages-updated', handleDemoUpdate);
      };
    }

    // Real mode: Supabase real-time
    const threadChannel = supabase
      .channel('admin-support-threads')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_threads',
          filter: `thread_type=eq.user_to_support`
        },
        () => fetchThreads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(threadChannel);
    };
  }, [adminUserId, debouncedSearch, sortBy, isDemoMode]);

  // Real-time updates for messages in selected thread
  useEffect(() => {
    if (!selectedThreadId) return;

    const messageChannel = supabase
      .channel(`admin-support-messages-${selectedThreadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${selectedThreadId}`
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages(prev => prev.some(message => message.id === newMessage.id)
            ? prev
            : [...prev, newMessage]);
          
          // Mark as read if it's for the admin
          if (newMessage.to_user_id === adminUserId && document.visibilityState === "visible") {
            markThreadAsRead(selectedThreadId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
    };
  }, [selectedThreadId, adminUserId]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const refreshOpenThread = () => {
      if (document.visibilityState === "visible") void fetchMessages(selectedThreadId);
    };
    window.addEventListener("focus", refreshOpenThread);
    document.addEventListener("visibilitychange", refreshOpenThread);
    return () => {
      window.removeEventListener("focus", refreshOpenThread);
      document.removeEventListener("visibilitychange", refreshOpenThread);
    };
  }, [selectedThreadId, isDemoMode]);

  return {
    threads,
    selectedThreadId,
    setSelectedThreadId,
    messages,
    loading,
    messagesLoading,
    sendMessage,
    uploadImage,
    fetchThreads,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy
  };
};
