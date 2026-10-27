create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'host', 'guest');
create type public.booking_status as enum ('pending_payment', 'confirmed', 'cancelled_guest', 'cancelled_host', 'completed', 'expired');
create type public.cancellation_policy as enum ('flexible', 'moderate', 'strict');
create type public.court_type as enum ('football', 'padel', 'basketball', 'tennis', 'volleyball', 'multi_use', 'other');
create type public.dispute_category as enum ('refund_request', 'policy_violation', 'property_damage', 'cleanliness_issue', 'amenity_issue', 'safety_concern', 'billing_dispute', 'other');
create type public.dispute_status as enum ('open', 'in_progress', 'resolved', 'closed', 'escalated', 'pending', 'on_hold', 'resolved_approved', 'resolved_declined');
create type public.listing_status as enum ('draft', 'pending', 'approved', 'rejected', 'blocked');
create type public.payout_status_enum as enum ('pending', 'completed', 'failed', 'cancelled');
create type public.property_type as enum ('court', 'field', 'arena', 'sports_complex', 'venue');
create type public.review_status as enum ('pending', 'approved', 'rejected', 'blocked');
create type public.surface_type as enum ('grass', 'artificial_turf', 'hardwood', 'concrete', 'clay', 'sand', 'rubber', 'other');
create type public.thread_type as enum ('user_to_user', 'user_to_support');
create type public.user_status as enum ('active', 'inactive', 'suspended');

create table public.bookings (
  booking_date date,
  cancellation_policy_snapshot jsonb,
  checkin_date date not null,
  checkout_date date not null,
  cleaning_fee numeric,
  created_at timestamptz default now() not null,
  currency text,
  end_time time,
  guest_service_fee_rate numeric,
  guest_user_id uuid not null,
  guests numeric not null,
  host_commission_amount numeric,
  host_commission_rate numeric,
  host_payout_gross numeric,
  host_payout_net numeric,
  hours numeric,
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  nights numeric not null,
  notes text,
  platform_revenue_total numeric,
  price_per_hour numeric,
  pricing_breakdown jsonb,
  service_fee numeric,
  start_time time,
  status public.booking_status,
  subtotal numeric not null,
  tax_rate numeric,
  taxes numeric,
  total_price numeric not null,
  updated_at timestamptz default now() not null
);

create table public.cancellation_policies (
  created_at timestamptz default now() not null,
  days_before_checkin numeric not null,
  description text not null,
  id uuid primary key default gen_random_uuid(),
  is_active boolean default false not null,
  name text not null,
  policy_key text not null,
  refund_percentage numeric not null
);

create table public.cities (
  country_id uuid not null,
  created_at timestamptz default now() not null,
  featured_image_url text,
  id uuid primary key default gen_random_uuid(),
  is_active boolean default false not null,
  is_featured boolean,
  name text not null,
  state_region_id uuid,
  timezone text,
  updated_at timestamptz default now() not null
);

create table public.countries (
  code text not null,
  created_at timestamptz default now() not null,
  id uuid primary key default gen_random_uuid(),
  is_active boolean default false not null,
  name text not null,
  phone_code text,
  updated_at timestamptz default now() not null
);

create table public.disputes (
  admin_decision text,
  approved_refund_amount numeric,
  assigned_admin_id uuid,
  attachment_urls text[],
  booking_id uuid not null,
  category public.dispute_category not null,
  created_at timestamptz default now() not null,
  description text not null,
  id uuid primary key default gen_random_uuid(),
  initiated_by_user_id uuid not null,
  listing_id uuid not null,
  refund_transaction_id uuid,
  requested_refund_amount numeric,
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by_admin_id uuid,
  status public.dispute_status not null,
  subject text not null,
  support_thread_id uuid,
  updated_at timestamptz default now() not null,
  user_role text not null
);

create table public.faqs (
  answer text not null,
  category text not null,
  created_at timestamptz default now() not null,
  created_by_admin_id uuid,
  id uuid primary key default gen_random_uuid(),
  question text not null,
  status text not null,
  updated_at timestamptz default now() not null,
  updated_by_admin_id uuid
);

create table public.guest_debts (
  amount numeric not null,
  booking_id uuid not null,
  created_at timestamptz default now() not null,
  currency text not null,
  dispute_id uuid not null,
  expires_at timestamptz,
  guest_user_id uuid not null,
  id uuid primary key default gen_random_uuid(),
  notes text,
  paid_at timestamptz,
  payment_transaction_id uuid,
  reason text not null,
  status text not null,
  waived_at timestamptz,
  waived_by_admin_id uuid
);

create table public.listing_availability (
  created_at timestamptz default now() not null,
  end_date date not null,
  end_time time,
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  price numeric,
  start_date date not null,
  start_time time,
  updated_at timestamptz default now() not null
);

create table public.listing_moderation_feedback (
  admin_user_id uuid not null,
  comment text,
  created_at timestamptz default now() not null,
  id uuid primary key default gen_random_uuid(),
  is_resolved boolean default false not null,
  listing_id uuid not null,
  section_key text not null,
  status text not null
);

create table public.listings (
  address text not null,
  amenities text[],
  base_price numeric not null,
  bathrooms numeric,
  bedrooms numeric,
  beds numeric,
  cancellation_policy_id uuid not null,
  checkin_from text,
  checkout_until text,
  city text not null,
  city_id uuid,
  cleaning_fee numeric,
  closing_time time,
  country text not null,
  country_id uuid,
  court_type public.court_type,
  cover_image text,
  created_at timestamptz default now() not null,
  currency text,
  description text,
  guests_max numeric not null,
  has_changing_rooms boolean,
  has_lighting boolean,
  has_parking boolean,
  has_showers boolean,
  host_user_id uuid not null,
  house_rules text,
  id uuid primary key default gen_random_uuid(),
  images text[],
  is_indoor boolean,
  latitude numeric,
  longitude numeric,
  max_hours numeric,
  max_nights numeric,
  min_hours numeric,
  min_nights numeric,
  monthly_discount numeric,
  opening_time time,
  postal_code text,
  rating_avg numeric,
  rating_count numeric,
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by text,
  security_deposit numeric,
  size_sqft numeric,
  slot_duration_minutes numeric,
  state text,
  state_region_id uuid,
  status public.listing_status,
  surface_type public.surface_type,
  title text not null,
  type public.property_type not null,
  updated_at timestamptz default now() not null,
  weekly_discount numeric
);

create table public.message_threads (
  booking_id uuid,
  created_at timestamptz default now() not null,
  id uuid primary key default gen_random_uuid(),
  is_locked boolean default false not null,
  last_message_at timestamptz not null,
  listing_id uuid,
  locked_at timestamptz,
  locked_reason text,
  thread_type public.thread_type,
  updated_at timestamptz default now() not null
);

create table public.messages (
  attachment_type text,
  attachment_url text,
  body text not null,
  booking_id uuid,
  created_at timestamptz default now() not null,
  from_user_id uuid not null,
  id uuid primary key default gen_random_uuid(),
  read boolean,
  thread_id uuid,
  to_user_id uuid not null
);

create table public.payouts (
  amount numeric not null,
  base_cleaning_fee numeric,
  base_subtotal numeric,
  booking_id uuid not null,
  commission_amount numeric,
  commission_on_retained numeric,
  created_at timestamptz default now() not null,
  currency text not null,
  dispute_ids text[],
  gross_revenue numeric,
  guest_total_payment numeric,
  host_retained_gross numeric,
  host_user_id uuid not null,
  id uuid primary key default gen_random_uuid(),
  net_before_adjustments numeric,
  notes text,
  original_amount numeric,
  payout_date date,
  refund_percentage_applied numeric,
  status text not null,
  total_dispute_refunds numeric,
  transaction_type text not null,
  updated_at timestamptz default now() not null
);

create table public.platform_settings (
  created_at timestamptz default now() not null,
  description text,
  effective_from text not null,
  id uuid primary key default gen_random_uuid(),
  is_active boolean default false not null,
  setting_key text not null,
  setting_type text not null,
  setting_value text not null,
  updated_at timestamptz default now() not null
);

create table public.profiles (
  about text,
  avatar_url text,
  created_at timestamptz default now() not null,
  email text not null,
  first_name text,
  id uuid primary key default gen_random_uuid(),
  is_demo boolean,
  is_system boolean,
  last_name text,
  phone text,
  status public.user_status not null,
  updated_at timestamptz default now() not null,
  verified boolean
);

create table public.reviews (
  author_user_id uuid not null,
  booking_id uuid not null,
  created_at timestamptz default now() not null,
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  rating numeric not null,
  status public.review_status not null,
  text text,
  updated_at timestamptz default now() not null
);

create table public.states_regions (
  code text,
  country_id uuid not null,
  created_at timestamptz default now() not null,
  id uuid primary key default gen_random_uuid(),
  is_active boolean default false not null,
  name text not null,
  type text,
  updated_at timestamptz default now() not null
);

create table public.transactions (
  amount numeric not null,
  booking_id uuid not null,
  created_at timestamptz default now() not null,
  currency text not null,
  dispute_id uuid,
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  status text not null,
  type text not null
);

create table public.user_roles (
  created_at timestamptz default now() not null,
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null,
  user_id uuid not null
);
alter table public.bookings enable row level security;
alter table public.cancellation_policies enable row level security;
alter table public.cities enable row level security;
alter table public.countries enable row level security;
alter table public.disputes enable row level security;
alter table public.faqs enable row level security;
alter table public.guest_debts enable row level security;
alter table public.listing_availability enable row level security;
alter table public.listing_moderation_feedback enable row level security;
alter table public.listings enable row level security;
alter table public.message_threads enable row level security;
alter table public.messages enable row level security;
alter table public.payouts enable row level security;
alter table public.platform_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.reviews enable row level security;
alter table public.states_regions enable row level security;
alter table public.transactions enable row level security;
alter table public.user_roles enable row level security;
