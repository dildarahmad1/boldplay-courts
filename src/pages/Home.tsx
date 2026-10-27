import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, MapPin, Calendar, Users, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import heroImage from "@/assets/kurdistan-multisport-hero.jpg";
import type { DateRange } from "react-day-picker";
import PopularBookings from "@/components/home/PopularBookings";
import DiscoverBanner from "@/components/home/DiscoverBanner";
import FeaturedDestinations from "@/components/home/FeaturedDestinations";
import ComingCities from "@/components/home/ComingCities";
import FAQSection from "@/components/home/FAQSection";
import Footer from "@/components/Footer";
import DestinationAutocomplete from "@/components/search/DestinationAutocomplete";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";

const Home = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { t, direction } = useLanguage();
  const searchFormRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState({
    location: "",
    locationSearch: "",
    city_id: null as string | null,
    state_region_id: null as string | null,
    country_id: null as string | null,
    guests: "",
    latitude: null as number | null,
    longitude: null as number | null,
  });
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [dateDrawerOpen, setDateDrawerOpen] = useState(false);
  const [playersDrawerOpen, setPlayersDrawerOpen] = useState(false);

  const playerCount = Number(searchQuery.guests) || 0;
  const changePlayers = (change: number) => {
    const nextCount = Math.min(25, Math.max(0, playerCount + change));
    setSearchQuery({ ...searchQuery, guests: String(nextCount) });
  };

  const dateLabel = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, "MMM dd")} - ${format(dateRange.to, "MMM dd")}`
      : format(dateRange.from, "MMM dd, yyyy")
    : t("dates");

  const dateTrigger = (
    <Button
      variant="ghost"
      className={cn(
        "h-full flex-1 justify-start p-0 text-left text-sm font-medium hover:bg-transparent",
        !dateRange?.from && "text-muted-foreground"
      )}
    >
      {dateLabel}
    </Button>
  );

  const playersTrigger = (
    <Button
      variant="ghost"
      className={cn(
        "h-full flex-1 justify-start p-0 text-left text-sm font-medium hover:bg-transparent",
        playerCount === 0 && "text-muted-foreground"
      )}
    >
      {playerCount > 0 ? `${playerCount} ${t("players")}` : t("players")}
    </Button>
  );

  const playerSelector = (
    <div className="grid grid-cols-[3rem_1fr_3rem] items-center rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <Button variant="outline" size="icon" className="h-11 w-11 rounded-full bg-white" onClick={() => changePlayers(-1)} disabled={playerCount <= 0} aria-label="Remove player">
        <Minus className="h-4 w-4" />
      </Button>
      <div className="text-center">
        <span className="block text-3xl font-semibold tabular-nums text-slate-950">{playerCount}</span>
        <span className="text-xs font-medium text-muted-foreground">Up to 25 players</span>
      </div>
      <Button variant="outline" size="icon" className="h-11 w-11 rounded-full bg-white" onClick={() => changePlayers(1)} disabled={playerCount >= 25} aria-label="Add player">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );

  const handleScrollToSearch = () => {
    searchFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    searchFormRef.current?.classList.add('search-highlight');
    setTimeout(() => {
      searchFormRef.current?.classList.remove('search-highlight');
    }, 2000);
  };

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchQuery.locationSearch) params.set("location", searchQuery.locationSearch);
    if (searchQuery.city_id) params.set("city_id", searchQuery.city_id);
    if (searchQuery.state_region_id) params.set("state_region_id", searchQuery.state_region_id);
    if (searchQuery.country_id) params.set("country_id", searchQuery.country_id);
    if (dateRange?.from) params.set("checkIn", format(dateRange.from, "yyyy-MM-dd"));
    if (dateRange?.to) params.set("checkOut", format(dateRange.to, "yyyy-MM-dd"));
    if (searchQuery.guests && searchQuery.guests !== "0") params.set("guests", searchQuery.guests);
    if (searchQuery.latitude !== null) params.set("latitude", String(searchQuery.latitude));
    if (searchQuery.longitude !== null) params.set("longitude", String(searchQuery.longitude));
    navigate(`/search?${params.toString()}`);
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section
        className="relative isolate flex min-h-[620px] items-center overflow-hidden bg-slate-950 py-20 sm:min-h-[680px] lg:min-h-[720px] lg:py-24"
        style={{ backgroundImage: `url(${heroImage})`, backgroundPosition: "center", backgroundSize: "cover" }}
      >
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/60 via-slate-950/45 to-slate-950/75" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,transparent_5%,rgba(2,6,23,0.32)_72%)]" />

        <div className="container mx-auto px-4">
          <div className="mx-auto w-full max-w-6xl text-center" dir={direction}>
            <div className="mx-auto mb-5 inline-flex items-center rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white backdrop-blur-md sm:text-sm">
              {t("eyebrow")}
            </div>
            <h1 className="mx-auto max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight text-white drop-shadow-sm sm:text-6xl lg:text-7xl">
              {t("title")}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/85 sm:text-xl">
              {t("subtitle")}
            </p>

            {/* Search Box */}
            <div ref={searchFormRef} className="mx-auto mt-9 max-w-5xl rounded-2xl border border-white/50 bg-white p-2.5 text-left shadow-[0_24px_70px_rgba(2,6,23,0.35)] transition-shadow duration-500 sm:p-2">
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-1.5">
                {/* Destination */}
                <div className="flex h-14 min-w-0 flex-1 items-center gap-3 rounded-xl bg-slate-50 px-4 sm:h-12 sm:w-auto sm:gap-2.5 sm:px-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 sm:h-8 sm:w-8">
                    <MapPin className="h-4 w-4 text-primary" />
                  </span>
                  <DestinationAutocomplete
                    value={searchQuery.location}
                    onChange={(destination) => setSearchQuery({
                      ...searchQuery,
                      location: destination.displayText,
                      locationSearch: destination.searchValue,
                      city_id: destination.city_id || null,
                      state_region_id: destination.state_region_id || null,
                      country_id: destination.country_id || null,
                      latitude: destination.latitude ?? null,
                      longitude: destination.longitude ?? null,
                    })}
                    placeholder={t("location")}
                    className="h-12 font-medium text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                
                {/* Dates */}
                <div className="flex h-14 min-w-0 flex-1 items-center gap-3 rounded-xl bg-slate-50 px-4 sm:h-12 sm:w-auto sm:gap-2.5 sm:px-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 sm:h-8 sm:w-8">
                    <Calendar className="h-4 w-4 text-primary" />
                  </span>
                  {isMobile ? (
                    <Sheet open={dateDrawerOpen} onOpenChange={setDateDrawerOpen}>
                      <SheetTrigger asChild>{dateTrigger}</SheetTrigger>
                      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-[28px] px-4 pb-5 pt-7">
                        <SheetHeader className="mb-3 text-left">
                          <SheetTitle>Choose your dates</SheetTitle>
                          <SheetDescription>Select the day or date range you want to play.</SheetDescription>
                        </SheetHeader>
                        <div className="flex justify-center">
                          <CalendarComponent mode="range" selected={dateRange} onSelect={setDateRange} disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))} numberOfMonths={1} initialFocus className="p-2" />
                        </div>
                        <SheetFooter className="mt-3">
                          <Button className="h-12 w-full rounded-xl" onClick={() => setDateDrawerOpen(false)}>Done</Button>
                        </SheetFooter>
                      </SheetContent>
                    </Sheet>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>{dateTrigger}</PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="center" sideOffset={12} collisionPadding={16}>
                        <CalendarComponent mode="range" selected={dateRange} onSelect={setDateRange} disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))} numberOfMonths={2} initialFocus className="p-4" />
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                
                {/* Players */}
                <div className="flex h-14 min-w-0 flex-1 items-center gap-3 rounded-xl bg-slate-50 px-4 sm:h-12 sm:w-auto sm:gap-2.5 sm:px-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 sm:h-8 sm:w-8">
                    <Users className="h-4 w-4 text-primary" />
                  </span>
                  {isMobile ? (
                    <Sheet open={playersDrawerOpen} onOpenChange={setPlayersDrawerOpen}>
                      <SheetTrigger asChild>{playersTrigger}</SheetTrigger>
                      <SheetContent side="bottom" className="rounded-t-[28px] px-5 pb-5 pt-7">
                        <SheetHeader className="mb-6 text-left">
                          <SheetTitle>How many players?</SheetTitle>
                          <SheetDescription>Choose the number of people joining the game.</SheetDescription>
                        </SheetHeader>
                        {playerSelector}
                        <SheetFooter className="mt-6">
                          <Button className="h-12 w-full rounded-xl" onClick={() => setPlayersDrawerOpen(false)}>Done</Button>
                        </SheetFooter>
                      </SheetContent>
                    </Sheet>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>{playersTrigger}</PopoverTrigger>
                      <PopoverContent className="w-80 p-5" align="center" sideOffset={12} collisionPadding={16}>
                        <p className="mb-4 font-semibold">Players</p>
                        {playerSelector}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                
                {/* Search Button */}
                <Button 
                  className="h-14 w-full flex-shrink-0 rounded-xl px-7 text-base font-semibold shadow-lg shadow-primary/20 sm:h-12 sm:w-auto" 
                  onClick={handleSearch}
                >
                  <Search className="mr-2 h-5 w-5" />
                  {t("find")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Bookings */}
      <PopularBookings />

      {/* Discover Banner */}
      <DiscoverBanner onExploreClick={handleScrollToSearch} />

      {/* Featured Destinations */}
      <FeaturedDestinations />

      <ComingCities />

      {/* FAQ Section */}
      <FAQSection />

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Home;
