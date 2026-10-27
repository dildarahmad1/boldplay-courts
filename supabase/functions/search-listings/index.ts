import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

import { matchesLocation } from '../_shared/locationSearch.ts';

const toIQD = (amount: number) => amount > 0 && amount < 1000 ? amount * 1000 : amount;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: req.headers.get('Authorization') ?? '',
          },
        },
      },
    );

    const {
      location,
      city_id,
      state_region_id,
      country_id,
      checkIn,
      checkOut,
      guests,
      priceMin,
      priceMax,
      courtType,
      propertyType,
      amenities,
    } = await req.json();

    console.log('Search parameters:', {
      location,
      city_id,
      state_region_id,
      country_id,
      checkIn,
      checkOut,
      guests,
      priceMin,
      priceMax,
      courtType,
      propertyType,
      amenities: amenities?.length || 0,
    });

    // Build base query
    let query = supabase
      .from('listings')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    // Apply guest count
    if (guests && guests > 0) {
      query = query.gte('guests_max', guests);
    }

    // Include legacy venues without location IDs, matching their city names below.
    let placeName = typeof location === 'string' ? location.trim() : '';
    const selectedLocation = city_id ? { table: 'cities', field: 'city_id', id: city_id }
      : state_region_id ? { table: 'states_regions', field: 'state_region_id', id: state_region_id }
      : country_id ? { table: 'countries', field: 'country_id', id: country_id } : null;
    if (selectedLocation) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedLocation.id)) {
        throw new Error('Invalid location');
      }
      const { data: place, error: placeError } = await supabase.from(selectedLocation.table)
        .select('name').eq('id', selectedLocation.id).maybeSingle();
      if (placeError) throw placeError;
      if (!place) throw new Error('Location not found');
      placeName = place.name;
      query = query.or(`${selectedLocation.field}.eq.${selectedLocation.id},${selectedLocation.field}.is.null`);
    }

    // Apply property type filter
    if (propertyType && propertyType !== 'all') {
      query = query.eq('type', propertyType);
    }

    // Apply court type filter
    if (courtType && courtType !== 'all') {
      query = query.eq('court_type', courtType);
    }


    const { data: listings, error } = await query;

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    console.log(`Initial query returned ${listings?.length || 0} listings`);

    // Apply amenities filter (client-side since we need array containment)
    let filteredListings = (listings || []).filter(listing => {
      if (selectedLocation && listing[selectedLocation.field] === selectedLocation.id) return true;
      return matchesLocation(listing, placeName);
    });
    // Normalize legacy compact prices (45 = 45,000 IQD) and current IQD prices
    // before filtering so newly published courts and older seed data behave alike.
    if (priceMin !== undefined && priceMin >= 0) {
      filteredListings = filteredListings.filter((listing) => toIQD(Number(listing.base_price)) >= priceMin);
    }
    if (priceMax !== undefined && priceMax > 0) {
      filteredListings = filteredListings.filter((listing) => toIQD(Number(listing.base_price)) <= priceMax);
    }
    if (amenities && amenities.length > 0) {
      filteredListings = filteredListings.filter((listing) =>
        amenities.every((amenity: string) => listing.amenities?.includes(amenity))
      );
      console.log(`After amenities filter: ${filteredListings.length} listings`);
    }

    // Apply date availability filter
    if (checkIn && checkOut) {
      // Query bookings table for confirmed/pending bookings that overlap with search dates
      const { data: conflictingBookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('listing_id')
        .in('status', ['confirmed', 'pending_payment', 'completed'])
        .or(`and(checkin_date.lte.${checkOut},checkout_date.gte.${checkIn})`);

      if (bookingsError) {
        console.error('Error fetching bookings:', bookingsError);
      }

      // Query listing_availability table for manually blocked dates that overlap with search dates
      const { data: blockedDates, error: blockedDatesError } = await supabase
        .from('listing_availability')
        .select('listing_id')
        .is('price', null)
        .lte('start_date', checkOut)
        .gte('end_date', checkIn);

      if (blockedDatesError) {
        console.error('Error fetching blocked dates:', blockedDatesError);
      }

      // Combine both booking conflicts and manually blocked dates
      const unavailableListingIds = new Set([
        ...(conflictingBookings?.map((b) => b.listing_id) || []),
        ...(blockedDates?.map((b) => b.listing_id) || [])
      ]);

      // Filter out listings with conflicts or blocked dates
      const beforeFilterCount = filteredListings.length;
      filteredListings = filteredListings.filter(
        (listing) => !unavailableListingIds.has(listing.id)
      );

      console.log(`Filtered out ${beforeFilterCount - filteredListings.length} listings due to availability conflicts (bookings + manual blocks)`);
      console.log(`After date availability filter: ${filteredListings.length} listings`);
    }

    console.log(`Final result: ${filteredListings.length} listings matching all criteria`);

    return new Response(
      JSON.stringify({
        listings: filteredListings,
        count: filteredListings.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in search-listings function:', error);
    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
