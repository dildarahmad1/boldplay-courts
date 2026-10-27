-- Match the stored support-thread enum so admin inboxes and unread badges include support messages.
CREATE OR REPLACE FUNCTION public.admin_get_support_conversations(p_admin_user_id uuid, p_search_query text DEFAULT NULL::text, p_sort_by text DEFAULT 'recent'::text)
 RETURNS TABLE(thread_id uuid, user_id uuid, user_name text, user_email text, user_avatar text, last_message text, last_message_time timestamp with time zone, unread_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_admin_user_id OR NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  RETURN QUERY
  WITH relevant AS (
    SELECT DISTINCT t.*
      FROM public.message_threads t
      JOIN public.messages m ON m.thread_id = t.id
     WHERE t.thread_type = 'user_to_support'::public.thread_type
       AND (m.from_user_id = p_admin_user_id OR m.to_user_id = p_admin_user_id)
  ), latest AS (
    SELECT DISTINCT ON (m.thread_id) m.thread_id, m.from_user_id, m.to_user_id, m.body, m.created_at
      FROM public.messages m JOIN relevant r ON r.id = m.thread_id
     ORDER BY m.thread_id, m.created_at DESC
  ), other_party AS (
    SELECT l.thread_id, CASE WHEN l.from_user_id = p_admin_user_id THEN l.to_user_id ELSE l.from_user_id END AS user_id
      FROM latest l
  )
  SELECT r.id, o.user_id,
    COALESCE(NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Player')::text,
    COALESCE(p.email, '')::text, p.avatar_url::text, COALESCE(latest.body, '')::text,
    COALESCE(latest.created_at, r.last_message_at),
    (SELECT count(*) FROM public.messages unread
      WHERE unread.thread_id = r.id AND unread.to_user_id = p_admin_user_id AND COALESCE(unread.read, false) = false)
  FROM relevant r
  JOIN other_party o ON o.thread_id = r.id
  JOIN latest ON latest.thread_id = r.id
  LEFT JOIN public.profiles p ON p.id = o.user_id
  WHERE p_search_query IS NULL OR p_search_query = ''
    OR COALESCE(p.email, '') ILIKE '%' || p_search_query || '%'
    OR COALESCE(p.first_name, '') ILIKE '%' || p_search_query || '%'
    OR COALESCE(p.last_name, '') ILIKE '%' || p_search_query || '%'
  ORDER BY
    CASE WHEN p_sort_by = 'oldest' THEN COALESCE(latest.created_at, r.last_message_at) END ASC,
    CASE WHEN p_sort_by <> 'oldest' THEN COALESCE(latest.created_at, r.last_message_at) END DESC;
END;
$function$

