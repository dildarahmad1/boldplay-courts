import { markConversationRead } from "@/lib/messageReads";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageThread, Message } from "@/types/inbox";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { useDemoData } from "@/hooks/useDemoData";

export const useInbox = (userId: string | undefined) => {
  const { isDemoMode, migrationComplete, getThreads: getDemoThreads, getMessages: getDemoMessages, sendDemoMessage, markDemoMessagesAsRead } = useDemoData();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const { toast } = useToast();
  
  const debouncedSearch = useDebounce(searchQuery, 500);
  const threadRequest = useRef(0);
  const messageRequest = useRef(0);
  const selectedThreadRef = useRef(selectedThreadId);
  selectedThreadRef.current = selectedThreadId;

  // Fetch threads with search and sort
  const fetchThreads = async () => {
    if (!userId) return;
    const request = ++threadRequest.current;
    
    try {
      // Demo mode: use localStorage
      if (isDemoMode) {
        const demoThreads = getDemoThreads(debouncedSearch || null, sortBy);
        setThreads(demoThreads as MessageThread[]);
        setLoading(false);
        return;
      }
      
      // Real mode: RPC call
      const { data, error } = await supabase.rpc('search_inbox_conversations', {
        p_user_id: userId,
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
      console.error('Error fetching threads:', error);
      toast({
        title: "Error",
        description: "Failed to load conversations",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch messages for selected thread
  const fetchMessages = async (threadId: string) => {
    const request = ++messageRequest.current;
    setMessagesLoading(true);
    try {
      // Demo mode: use localStorage
      if (isDemoMode) {
        const demoMessages = getDemoMessages(threadId);
        setMessages(demoMessages as Message[]);
        await markThreadAsRead(threadId);
        if (request === messageRequest.current) setMessagesLoading(false);
        return;
      }
      
      // Real mode: DB query
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (request !== messageRequest.current || selectedThreadRef.current !== threadId) return;
      setMessages(data || []);
      
      // Mark messages as read
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

  // Mark thread messages as read
  const markThreadAsRead = async (threadId: string) => {
    if (!userId || document.visibilityState !== "visible" || selectedThreadRef.current !== threadId) return;
    try {
      if (isDemoMode) markDemoMessagesAsRead(threadId);
      else await markConversationRead(userId, threadId);
      threadRequest.current++;
      setThreads(prev => prev.map(thread => thread.thread_id === threadId ? { ...thread, unread_count: 0 } : thread));
      setMessages(prev => prev.map(message => message.thread_id === threadId && message.to_user_id === userId ? { ...message, read: true } : message));
      void fetchThreads();
    } catch (error) {
      console.error("Error marking messages as read:", error);
      toast({ title: "Could not update read status", description: "Messages could not be marked as read. Please try again.", variant: "destructive" });
    }
  };

  const sendMessage = async (threadId: string, toUserId: string, body: string, attachmentUrl?: string, attachmentType?: string) => {
    if (!userId) return;

    const optimisticId = `pending-${crypto.randomUUID()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      thread_id: threadId,
      from_user_id: userId,
      to_user_id: toUserId,
      body,
      attachment_url: attachmentUrl || null,
      attachment_type: attachmentType || null,
      read: false,
      created_at: new Date().toISOString(),
    };

    try {
      // Demo mode: use localStorage
      if (isDemoMode) {
        const newMessage = sendDemoMessage(threadId, toUserId, body, attachmentUrl, attachmentType);
        if (newMessage) {
          setMessages(prev => [...prev, newMessage]);
          // Refresh threads to update last_message
          await fetchThreads();
        }
        return;
      }
      
      // Show the sender's message immediately instead of relying on Realtime
      // to echo the user's own insert back to this browser.
      setMessages(prev => [...prev, optimisticMessage]);

      // Real mode: DB insert
      const { data: savedMessage, error } = await supabase
        .from('messages')
        .insert({
          thread_id: threadId,
          from_user_id: userId,
          to_user_id: toUserId,
          body,
          attachment_url: attachmentUrl,
          attachment_type: attachmentType
        })
        .select('*')
        .single();

      if (error) throw error;

      window.dispatchEvent(new Event("yarika:messages-changed"));

      setMessages(prev => {
        const withoutPending = prev.filter(message => message.id !== optimisticId);
        return withoutPending.some(message => message.id === savedMessage.id)
          ? withoutPending
          : [...withoutPending, savedMessage];
      });
      
      // Refresh threads to update last_message in conversation list
      await fetchThreads();

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

  // Upload image
  const uploadImage = async (file: File): Promise<string | null> => {
    if (!userId) return null;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('message-attachments')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data, error: signedUrlError } = await supabase.storage
        .from('message-attachments')
        .createSignedUrl(fileName, 60 * 60 * 24 * 7);

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

  // Initial fetch and refetch on search/sort changes
  useEffect(() => {
    if (userId && (!isDemoMode || migrationComplete)) {
      fetchThreads();
    }
  }, [userId, debouncedSearch, sortBy, isDemoMode, migrationComplete]);

  // Fetch messages when thread is selected
  useEffect(() => {
    if (selectedThreadId) {
      fetchMessages(selectedThreadId);
    } else {
      setMessages([]);
    }
  }, [selectedThreadId]);

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

  // Real-time subscription for threads
  useEffect(() => {
    if (!userId) return;

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
      .channel('inbox-threads')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_threads'
        },
        () => fetchThreads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(threadChannel);
    };
  }, [userId, debouncedSearch, sortBy, isDemoMode]);

  // Real-time subscription for messages
  useEffect(() => {
    if (!selectedThreadId || isDemoMode) return; // Skip real-time in demo mode

    const messageChannel = supabase
      .channel('inbox-messages')
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
          if (newMessage.to_user_id === userId && document.visibilityState === "visible") {
            markThreadAsRead(selectedThreadId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
    };
  }, [selectedThreadId, userId, isDemoMode]);

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
