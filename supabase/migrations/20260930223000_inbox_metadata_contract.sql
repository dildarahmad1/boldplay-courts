-- The inbox needs court metadata and avatars for its conversation list.
DROP FUNCTION IF EXISTS public.search_inbox_conversations(uuid, text, text);
CREATE FUNCTION public.search_inbox_conversations(
  p_user_id uuid,
  p_search_query text DEFAULT NULL,
  p_sort_by text DEFAULT 'recent'
)
RETURNS TABLE(
  thread_id uuid, other_user_id uuid, other_user_name text, other_user_avatar text,
  listing_id uuid, listing_title text, listing_address text, booking_id uuid,
  last_message text, last_message_time timestamp with time zone, unread_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'private', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT private.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'You can only view your own conversations';
  END IF;

  RETURN QUERY
  WITH relevant AS (
    SELECT DISTINCT t.*
      FROM public.message_threads t
      JOIN public.messages m ON m.thread_id = t.id
     WHERE m.from_user_id = p_user_id OR m.to_user_id = p_user_id
  ), latest AS (
    SELECT DISTINCT ON (m.thread_id) m.thread_id, m.from_user_id, m.to_user_id, m.body, m.created_at
      FROM public.messages m JOIN relevant r ON r.id = m.thread_id
     ORDER BY m.thread_id, m.created_at DESC
  ), other_party AS (
    SELECT l.thread_id, CASE WHEN l.from_user_id = p_user_id THEN l.to_user_id ELSE l.from_user_id END AS user_id
      FROM latest l
  )
  SELECT r.id, o.user_id,
    COALESCE(NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email, 'Player')::text,
    p.avatar_url::text, r.listing_id, COALESCE(l.title, 'Yarika')::text,
    COALESCE(l.address, l.city, '')::text, r.booking_id,
    COALESCE(latest.body, '')::text, COALESCE(latest.created_at, r.last_message_at),
    (SELECT count(*) FROM public.messages unread
      WHERE unread.thread_id = r.id AND unread.to_user_id = p_user_id AND COALESCE(unread.read, false) = false)
  FROM relevant r
  JOIN other_party o ON o.thread_id = r.id
  JOIN latest ON latest.thread_id = r.id
  LEFT JOIN public.profiles p ON p.id = o.user_id
  LEFT JOIN public.listings l ON l.id = r.listing_id
  WHERE p_search_query IS NULL OR p_search_query = ''
    OR COALESCE(p.email, '') ILIKE '%' || p_search_query || '%'
    OR COALESCE(p.first_name, '') ILIKE '%' || p_search_query || '%'
    OR COALESCE(p.last_name, '') ILIKE '%' || p_search_query || '%'
    OR l.title ILIKE '%' || p_search_query || '%'
  ORDER BY
    CASE WHEN p_sort_by = 'oldest' THEN COALESCE(latest.created_at, r.last_message_at) END ASC,
    CASE WHEN p_sort_by <> 'oldest' THEN COALESCE(latest.created_at, r.last_message_at) END DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.search_inbox_conversations(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_inbox_conversations(uuid, text, text) TO authenticated;
