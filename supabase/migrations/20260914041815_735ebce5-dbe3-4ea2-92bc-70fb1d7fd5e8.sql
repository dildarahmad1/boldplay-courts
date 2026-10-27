CREATE TYPE public.court_type AS ENUM ('football', 'padel', 'basketball', 'tennis', 'volleyball', 'multi_use', 'other');
CREATE TYPE public.surface_type AS ENUM ('grass', 'artificial_turf', 'hardwood', 'concrete', 'clay', 'sand', 'rubber', 'other');

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS court_type public.court_type,
  ADD COLUMN IF NOT EXISTS surface_type public.surface_type,
  ADD COLUMN IF NOT EXISTS is_indoor BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_lighting BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_changing_rooms BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_parking BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_showers BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS slot_duration_minutes INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS opening_time TIME WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS closing_time TIME WITHOUT TIME ZONE;

COMMENT ON COLUMN public.listings.court_type IS 'Type of sports court or playground';
COMMENT ON COLUMN public.listings.surface_type IS 'Playing surface material';
COMMENT ON COLUMN public.listings.is_indoor IS 'Whether the court is indoor/covered';
COMMENT ON COLUMN public.listings.has_lighting IS 'Whether floodlights are available';
COMMENT ON COLUMN public.listings.has_changing_rooms IS 'Whether changing rooms are available';
COMMENT ON COLUMN public.listings.has_parking IS 'Whether parking is available';
COMMENT ON COLUMN public.listings.has_showers IS 'Whether showers are available';
COMMENT ON COLUMN public.listings.slot_duration_minutes IS 'Default booking slot duration in minutes';
COMMENT ON COLUMN public.listings.opening_time IS 'Venue opening time';
COMMENT ON COLUMN public.listings.closing_time IS 'Venue closing time';