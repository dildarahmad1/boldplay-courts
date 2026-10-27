import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Filter, Loader2, ArrowDownUp, Check, Sparkles, Banknote, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import SearchPageHeader from "@/components/search/SearchPageHeader";
import SearchResultsMap from "@/components/search/SearchResultsMap";
import ListingCard from "@/components/shared/ListingCard";
import HorizontalListingCard from "@/components/search/HorizontalListingCard";
import SearchPageFooter from "@/components/search/SearchPageFooter";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { formatIQD, toIQD } from "@/lib/currency";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { matchesLocation } from "../../supabase/functions/_shared/locationSearch";
import { hasCoordinates, distanceInKm } from "@/lib/nearbySearch";
import { useDemoData } from "@/hooks/useDemoData";

interface Filters {
  priceRange: [number, number];
  courtType: string;
  amenities: string[];
  sortBy: "recommended" | "cheapest" | "rating";
}

const DEFAULT_FILTERS: Filters = {
  priceRange: [0, 150000],
  courtType: "all",
  amenities: [],
  sortBy: "recommended",
};

const AMENITIES = [
  "Changing rooms",
  "Showers",
  "Lighting",
  "Parking",
  "Equipment rental",
  "Seating",
];

const SPORTS = [
  { value: "all", label: "All sports" },
  { value: "football", label: "Football" },
  { value: "padel", label: "Padel" },
  { value: "basketball", label: "Basketball" },
  { value: "tennis", label: "Tennis" },
  { value: "volleyball", label: "Volleyball" },
];

const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended", description: "Best match for your search", icon: Sparkles },
  { value: "cheapest", label: "Cheapest", description: "Lowest hourly price first", icon: Banknote },
  { value: "rating", label: "Top rated", description: "Highest guest ratings first", icon: Star },
] as const;

const readSearchQuery = (params: URLSearchParams) => ({
  location: params.get("location") || (params.has("latitude") && params.has("longitude") ? "Current location" : ""),
  locationSearch: params.get("location") || "",
  city_id: params.get("city_id") || null,
  state_region_id: params.get("state_region_id") || null,
  country_id: params.get("country_id") || null,
  guests: params.get("guests") || "",
  latitude: params.get("latitude") ? Number(params.get("latitude")) : null,
  longitude: params.get("longitude") ? Number(params.get("longitude")) : null,
});
const readSearchDates = (params: URLSearchParams): DateRange | undefined => {
  const from = new Date(params.get("checkIn") || "");
  const to = new Date(params.get("checkOut") || "");
  return Number.isFinite(from.getTime()) && Number.isFinite(to.getTime()) && from <= to ? { from, to } : undefined;
};

const Search = () => {
  const { language } = useLanguage();
  const t = (text: string) => translateUiText(text, language);
  const [loadError, setLoadError] = useState(false);
  const { isDemoMode, getListings } = useDemoData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState(() => readSearchQuery(searchParams));
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => readSearchDates(searchParams));

  useEffect(() => {
    const next = readSearchQuery(searchParams);
    setSearchQuery(current => Object.keys(next).every(key => current[key as keyof typeof current] === next[key as keyof typeof next]) ? current : next);
    const dates = readSearchDates(searchParams);
    setDateRange(current => current?.from?.getTime() === dates?.from?.getTime() && current?.to?.getTime() === dates?.to?.getTime() ? current : dates);
  }, [searchParams]);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [listingsVersion, setListingsVersion] = useState(0);

  useEffect(() => {
    if (isDemoMode) return;
    const channel = supabase
      .channel("public-search-listings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "listings" },
        () => setListingsVersion((version) => version + 1),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isDemoMode]);

  const isNearbySearch = hasCoordinates(searchQuery.latitude, searchQuery.longitude);

  useEffect(() => {
    let active = true;
    const fetchListings = async () => {
      setLoading(true);
      setLoadError(false);
      
      try {
        const { data, error } = await supabase.functions.invoke('search-listings', {
          body: {
            location: isNearbySearch ? "" : searchQuery.locationSearch,
            city_id: isNearbySearch ? null : searchQuery.city_id,
            state_region_id: isNearbySearch ? null : searchQuery.state_region_id,
            country_id: isNearbySearch ? null : searchQuery.country_id,
            checkIn: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : null,
            checkOut: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : null,
            guests: (searchQuery.guests && parseInt(searchQuery.guests) > 0) ? parseInt(searchQuery.guests) : null,
            priceMin: filters.priceRange[0],
            priceMax: filters.priceRange[1],
            courtType: filters.courtType,
            amenities: filters.amenities,
          }
        });
        
        if (!active) return;
        if (error || data?.error) throw error || new Error(data.error);
        if (!Array.isArray(data?.listings)) throw new Error("Invalid search response");
        if (data) {
          const receivedListings = data.listings || [];
          const approvedDemoListings = isDemoMode ? getListings({ status: "approved" }) : [];
          const knownIds = new Set(receivedListings.map((listing: any) => listing.id));
          const combinedListings = [
            ...receivedListings,
            ...approvedDemoListings.filter((listing: any) => !knownIds.has(listing.id)),
          ].filter((listing: any) => {
            const price = toIQD(Number(listing.base_price));
            if (price < filters.priceRange[0] || price > filters.priceRange[1]) return false;
            if (filters.courtType !== "all" && listing.court_type !== filters.courtType) return false;
            if (filters.amenities.some((amenity) => !listing.amenities?.includes(amenity))) return false;
            if (searchQuery.guests && Number(listing.guests_max || 0) < Number(searchQuery.guests)) return false;
            if (!isNearbySearch && (searchQuery.locationSearch || searchQuery.city_id || searchQuery.state_region_id || searchQuery.country_id)) {
              const field = searchQuery.city_id ? "city_id" : searchQuery.state_region_id ? "state_region_id" : searchQuery.country_id ? "country_id" : null;
              if (field && listing[field]) {
                if (listing[field] !== searchQuery[field]) return false;
              } else if (!matchesLocation(listing, searchQuery.locationSearch || searchQuery.location)) return false;
            }
            return true;
          });
          if (isNearbySearch) {
            const nearbyListings = combinedListings
              .filter((listing: any) => hasCoordinates(listing.latitude, listing.longitude))
              .map((listing: any) => ({
                ...listing,
                distance_km: distanceInKm(searchQuery.latitude!, searchQuery.longitude!, Number(listing.latitude), Number(listing.longitude)),
              }))
              .filter((listing: any) => listing.distance_km <= 50);
            if (filters.sortBy === "cheapest") nearbyListings.sort((a: any, b: any) => toIQD(Number(a.base_price)) - toIQD(Number(b.base_price)));
            else if (filters.sortBy === "rating") nearbyListings.sort((a: any, b: any) => Number(b.rating_avg || 0) - Number(a.rating_avg || 0));
            else nearbyListings.sort((a: any, b: any) => a.distance_km - b.distance_km);
            setListings(nearbyListings);
          } else {
            const sortedListings = [...combinedListings];
            if (filters.sortBy === "cheapest") sortedListings.sort((a, b) => toIQD(Number(a.base_price)) - toIQD(Number(b.base_price)));
            if (filters.sortBy === "rating") sortedListings.sort((a, b) => Number(b.rating_avg || 0) - Number(a.rating_avg || 0));
            setListings(sortedListings);
          }
        }
      } catch (error) {
        console.error('Error calling search function:', error);
        if (active) { setLoadError(true); setListings([]); }
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchListings();
    return () => { active = false; };
  }, [searchQuery, dateRange, filters, isDemoMode, listingsVersion, isNearbySearch]);

  const handleSearch = (nextQuery = searchQuery, nextDates = dateRange) => {
    const params = new URLSearchParams();
    if (nextQuery.locationSearch) params.set("location", nextQuery.locationSearch);
    if (nextQuery.city_id) params.set("city_id", nextQuery.city_id);
    if (nextQuery.state_region_id) params.set("state_region_id", nextQuery.state_region_id);
    if (nextQuery.country_id) params.set("country_id", nextQuery.country_id);
    if (nextDates?.from) params.set("checkIn", format(nextDates.from, "yyyy-MM-dd"));
    if (nextDates?.to) params.set("checkOut", format(nextDates.to, "yyyy-MM-dd"));
    if (nextQuery.guests && parseInt(nextQuery.guests) > 0) params.set("guests", nextQuery.guests);
    if (nextQuery.latitude !== null) params.set("latitude", String(nextQuery.latitude));
    if (nextQuery.longitude !== null) params.set("longitude", String(nextQuery.longitude));
    setSearchParams(params);
    
    // The useEffect hook will automatically trigger the search when searchQuery, nextDates, or filters change
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setFiltersOpen(false);
  };

  const activeFilterCount = 
    (filters.courtType !== "all" ? 1 : 0) +
    filters.amenities.length +
    (filters.priceRange[0] > DEFAULT_FILTERS.priceRange[0] || filters.priceRange[1] < DEFAULT_FILTERS.priceRange[1] ? 1 : 0) +
    (filters.sortBy !== DEFAULT_FILTERS.sortBy ? 1 : 0);

  // Format the title based on search params
  const getTitleText = () => {
    const parts = [];
    
    if (dateRange?.from) {
      const fromDate = format(dateRange.from, "MMM d");
      const toDate = dateRange.to ? format(dateRange.to, "MMM d, yyyy") : format(dateRange.from, "MMM d, yyyy");
      parts.push(`${fromDate}-${toDate}`);
    }
    
    if (isNearbySearch) {
      parts.push(t("Courts within 50 km"));
    } else if (searchQuery.location) {
      parts.push(t(searchQuery.location));
    }
    
    return parts.length > 0 ? parts.join(" • ") : "All Properties";
  };

  const isMobile = useIsMobile();

  return (
    <div className="public-page min-h-screen bg-slate-50">
      {/* Search Header */}
      <SearchPageHeader 
        searchQuery={searchQuery}
        dateRange={dateRange}
        onSearchQueryChange={setSearchQuery}
        onDateRangeChange={setDateRange}
        onSearch={handleSearch}
      />

      <div className="flex flex-col lg:flex-row">
        {/* Left Column - Scrollable Content */}
        <div className={cn(
          "w-full bg-slate-50",
          "lg:w-[776px]"
        )}>
          <div className="px-4 pt-8 sm:px-6">
            {/* Results Header */}
            <div className="mb-6">
              <p className="text-sm text-muted-foreground mb-2">Search Results</p>
              <h1 className="mb-2 text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl">
                {getTitleText()}
              </h1>
              {searchQuery.guests && (
                <p className="text-2xl text-foreground">
                  {searchQuery.guests} {Number(searchQuery.guests) === 1 ? 'Guest' : 'Guests'}
                </p>
              )}
            </div>

            {/* Filters */}
            <div className="mb-6 flex items-center gap-2">
              <Sheet open={filtersOpen} onOpenChange={(open) => { setFiltersOpen(open); if (open) setDraftFilters(filters); }}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="h-11 rounded-full border-slate-200 bg-white px-5 font-semibold text-slate-800 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-white hover:shadow-md">
                    <Filter className="me-2 h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge className="ms-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] text-white hover:bg-emerald-600">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side={isMobile ? "bottom" : "right"} className={cn("flex flex-col overflow-hidden border-slate-200 bg-white p-0 shadow-2xl data-[state=open]:duration-500 data-[state=closed]:duration-300", isMobile ? "max-h-[90vh] rounded-t-[28px]" : "w-[430px] sm:max-w-[430px]")}>
                  {isMobile && <div className="absolute start-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-slate-300" />}
                  <SheetHeader className={cn("border-b border-slate-100 px-6 pb-5 text-start", isMobile ? "pt-7" : "pt-6")}>
                    <SheetTitle className="text-2xl font-bold tracking-tight text-slate-950">Find the right court</SheetTitle>
                    <SheetDescription>
                      Choose only what matters for your game.
                    </SheetDescription>
                  </SheetHeader>

                  <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6 overscroll-contain">
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <ArrowDownUp className="h-4 w-4 text-emerald-600" />
                        <Label className="text-sm font-bold text-slate-950">Sort results</Label>
                      </div>
                      <div className="grid gap-2">
                        {SORT_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          const selected = draftFilters.sortBy === option.value;
                          return (
                            <label
                              key={option.value}
                              className={cn(
                                "group flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-3.5 text-start transition-all duration-200",
                                selected
                                  ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
                              )}
                            >
                              <input
                                type="radio"
                                name="search-sort"
                                value={option.value}
                                checked={selected}
                                onChange={() => setDraftFilters((current) => ({ ...current, sortBy: option.value }))}
                                className="sr-only"
                              />
                              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors", selected ? "bg-white/15" : "bg-slate-100 text-slate-700 group-hover:bg-white")}>
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold">{option.label}</span>
                                <span className={cn("mt-0.5 block text-xs", selected ? "text-slate-300" : "text-slate-500")}>{option.description}</span>
                              </span>
                              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-white bg-white text-slate-950" : "border-slate-300")}>
                                {selected && <Check className="h-3 w-3" />}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <Label className="mb-3 block text-sm font-bold">Sport</Label>
                      <div className="flex flex-wrap gap-2">
                        {SPORTS.map((sport) => (
                          <button
                            type="button"
                            key={sport.value}
                            onClick={() => setDraftFilters({ ...draftFilters, courtType: sport.value })}
                            className={cn("rounded-full border px-4 py-2 text-sm font-medium transition", draftFilters.courtType === sport.value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400")}
                          >
                            {sport.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Price Range */}
                    <div>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <Label className="text-sm font-bold">Hourly price</Label>
                        <span className="text-sm font-semibold text-slate-600" dir="ltr">{formatIQD(draftFilters.priceRange[0])} – {formatIQD(draftFilters.priceRange[1])}</span>
                      </div>
                      <Slider
                        value={draftFilters.priceRange}
                        onValueChange={(value) => setDraftFilters({ ...draftFilters, priceRange: value as [number, number] })}
                        max={150000}
                        step={5000}
                      />
                    </div>

                    {/* Amenities */}
                    <div>
                      <Label className="mb-3 block text-sm font-bold">Court features</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {AMENITIES.map((amenity) => (
                          <label key={amenity} htmlFor={`filter-${amenity}`} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-3 text-sm transition", draftFilters.amenities.includes(amenity) ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white hover:border-slate-300")}>
                            <Checkbox
                              id={`filter-${amenity}`}
                              checked={draftFilters.amenities.includes(amenity)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setDraftFilters({
                                    ...draftFilters,
                                    amenities: [...draftFilters.amenities, amenity]
                                  });
                                } else {
                                  setDraftFilters({
                                    ...draftFilters,
                                    amenities: draftFilters.amenities.filter(a => a !== amenity)
                                  });
                                }
                              }}
                            />
                            <span>{amenity}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                  </div>
                  <div className="flex shrink-0 gap-3 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
                    <Button onClick={() => setDraftFilters(DEFAULT_FILTERS)} variant="ghost" className="h-12 px-4 font-semibold text-slate-600 hover:bg-slate-100">Clear</Button>
                    <Button onClick={applyFilters} className="h-12 flex-1 rounded-xl bg-emerald-600 font-bold shadow-sm transition-all duration-200 hover:bg-emerald-700 hover:shadow-md"><Check className="me-2 h-4 w-4" />Show courts</Button>
                  </div>
                </SheetContent>
              </Sheet>
              <span className="truncate text-sm text-slate-500">
                {SORT_OPTIONS.find((option) => option.value === filters.sortBy)?.label}
              </span>
            </div>

            {/* Gray Container - Listings Only */}
            <div className="bg-[#F8FAFF] rounded-2xl p-6">
              <div className="space-y-4">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                 ) : loadError ? (
                   <div role="alert" className="text-center py-12 text-destructive">
                     <p>{t("Could not load courts. Please try again.")}</p>
                     <Button variant="outline" className="mt-4" onClick={() => setListingsVersion(v => v + 1)}>{t("Try again")}</Button>
                   </div>
                 ) : listings.length === 0 ? (
                   <div className="text-center py-12 text-muted-foreground">
                     {t(isNearbySearch ? "No bookable courts within 50 km. Try another city or remove filters." : "No properties match your filters. Try adjusting your search criteria.")}
                   </div>
                 ) : (
                   listings.map((listing) => (
                     <div key={listing.id}>
                       {isMobile ? (
                         <ListingCard listing={listing} />
                       ) : (
                         <HorizontalListingCard 
                           listing={listing}
                           dateRange={dateRange}
                         />
                       )}
                     </div>
                   ))
                 )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Right Column - Sticky Map (hidden on mobile/tablet) */}
        <div className="hidden lg:block flex-1">
          <div className="sticky top-20 h-[calc(100vh-80px)] p-6">
            <SearchResultsMap listings={listings} dateRange={dateRange} />
          </div>
        </div>
      </div>

      {/* Footer - Full Width */}
      <SearchPageFooter />
    </div>
  );
};

export default Search;
