create or replace function public.admin_suspend_user(p_user_id uuid,p_admin_user_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if auth.uid()<>p_admin_user_id or not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  if p_user_id=auth.uid() then raise exception 'you cannot suspend your own account'; end if;
  update profiles set status='suspended',updated_at=now() where id=p_user_id;
  return jsonb_build_object('success',found);
end $$;

create or replace function public.admin_unsuspend_user(p_user_id uuid,p_admin_user_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if auth.uid()<>p_admin_user_id or not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  update profiles set status='active',updated_at=now() where id=p_user_id;
  return jsonb_build_object('success',found);
end $$;

create or replace function public.admin_delete_user_soft(p_user_id uuid,p_admin_user_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if auth.uid()<>p_admin_user_id or not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  if p_user_id=auth.uid() then raise exception 'you cannot delete your own account'; end if;
  update profiles set status='inactive',first_name='Deleted',last_name='User',phone=null,avatar_url=null,updated_at=now() where id=p_user_id;
  return jsonb_build_object('success',found);
end $$;

create or replace function public.admin_search_faqs(search_query text default null,category_filter text default null,
  status_filter text default null,sort_by text default 'created_at',sort_order text default 'desc')
returns setof public.faqs language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
  if not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  return query select f.* from faqs f
  where (search_query is null or f.question ilike '%'||search_query||'%' or f.answer ilike '%'||search_query||'%')
    and (category_filter is null or category_filter='all' or f.category=category_filter)
    and (status_filter is null or status_filter='all' or f.status=status_filter)
  order by case when sort_order='asc' then f.created_at end asc,case when sort_order<>'asc' then f.created_at end desc;
end $$;

create or replace function public.admin_get_detailed_revenue_report(p_start_date date,p_end_date date)
returns table(booking_id uuid,booking_display_id text,guest_user_id uuid,guest_first_name text,guest_last_name text,
  created_at timestamptz,listing_title text,checkin_date date,checkout_date date,total_price numeric,status text,
  refunds_amount numeric,host_payouts_amount numeric,net_revenue numeric)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
  if not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  return query select b.id,'BKG-'||upper(left(b.id::text,8)),b.guest_user_id,p.first_name,p.last_name,b.created_at,
    l.title,b.checkin_date,b.checkout_date,b.total_price,b.status::text,
    coalesce((select sum(t.amount) from transactions t where t.booking_id=b.id and t.type ilike '%refund%'),0),
    coalesce((select sum(py.amount) from payouts py where py.booking_id=b.id),0),
    b.total_price-coalesce((select sum(t.amount) from transactions t where t.booking_id=b.id and t.type ilike '%refund%'),0)-coalesce((select sum(py.amount) from payouts py where py.booking_id=b.id),0)
  from bookings b join listings l on l.id=b.listing_id left join profiles p on p.id=b.guest_user_id
  where b.created_at::date between p_start_date and p_end_date order by b.created_at desc;
end $$;

create or replace function public.search_inbox_conversations(p_user_id uuid,p_search_query text default null,p_sort_by text default 'last_message_time')
returns table(thread_id uuid,other_user_id uuid,other_user_name text,other_user_avatar text,listing_id uuid,
  listing_title text,booking_id uuid,last_message text,last_message_time timestamptz,unread_count bigint)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
  if p_user_id<>auth.uid() and not private.has_role(auth.uid(),'admin') then raise exception 'access denied'; end if;
  return query
  with relevant as (select distinct mt.* from message_threads mt join messages m on m.thread_id=mt.id where m.from_user_id=p_user_id or m.to_user_id=p_user_id),
  other_party as (select r.id tid,(select case when m.from_user_id=p_user_id then m.to_user_id else m.from_user_id end from messages m where m.thread_id=r.id order by m.created_at desc limit 1) uid from relevant r),
  latest as (select distinct on(m.thread_id)m.thread_id,m.body,m.created_at from messages m order by m.thread_id,m.created_at desc)
  select r.id,o.uid,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.email,'User'),p.avatar_url,r.listing_id,l.title,r.booking_id,
    coalesce(lm.body,''),coalesce(lm.created_at,r.last_message_at),(select count(*) from messages u where u.thread_id=r.id and u.to_user_id=p_user_id and coalesce(u.read,false)=false)
  from relevant r join other_party o on o.tid=r.id left join profiles p on p.id=o.uid left join listings l on l.id=r.listing_id left join latest lm on lm.thread_id=r.id
  where p_search_query is null or p.email ilike '%'||p_search_query||'%' or concat_ws(' ',p.first_name,p.last_name) ilike '%'||p_search_query||'%' or l.title ilike '%'||p_search_query||'%'
  order by coalesce(lm.created_at,r.last_message_at) desc;
end $$;

revoke execute on function public.admin_suspend_user(uuid,uuid) from public,anon;
revoke execute on function public.admin_unsuspend_user(uuid,uuid) from public,anon;
revoke execute on function public.admin_delete_user_soft(uuid,uuid) from public,anon;
revoke execute on function public.admin_search_faqs(text,text,text,text,text) from public,anon;
revoke execute on function public.admin_get_detailed_revenue_report(date,date) from public,anon;
revoke execute on function public.search_inbox_conversations(uuid,text,text) from public,anon;
grant execute on function public.admin_suspend_user(uuid,uuid) to authenticated;
grant execute on function public.admin_unsuspend_user(uuid,uuid) to authenticated;
grant execute on function public.admin_delete_user_soft(uuid,uuid) to authenticated;
grant execute on function public.admin_search_faqs(text,text,text,text,text) to authenticated;
grant execute on function public.admin_get_detailed_revenue_report(date,date) to authenticated;
grant execute on function public.search_inbox_conversations(uuid,text,text) to authenticated;
