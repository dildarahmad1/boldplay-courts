import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { User, LogOut, MapPin, Calendar, Users, Search, Menu, X, Home, Building2, LifeBuoy, LayoutDashboard, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { AuthDialog } from "@/components/AuthDialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import DestinationAutocomplete from "@/components/search/DestinationAutocomplete";
import { BrandLogo } from "@/components/BrandLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SearchPageHeaderProps {
  searchQuery: {
    location: string;
    locationSearch: string;
    city_id: string | null;
    state_region_id: string | null;
    country_id: string | null;
    guests: string;
    latitude: number | null;
    longitude: number | null;
  };
  dateRange: DateRange | undefined;
  onSearchQueryChange: (query: { 
    location: string;
    locationSearch: string;
    city_id: string | null;
    state_region_id: string | null;
    country_id: string | null;
    guests: string;
    latitude: number | null;
    longitude: number | null;
  }) => void;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onSearch: (query: SearchPageHeaderProps["searchQuery"], range: DateRange | undefined) => void;
}

const SearchPageHeader = ({
  searchQuery,
  dateRange,
  onSearchQueryChange,
  onDateRangeChange,
  onSearch
}: SearchPageHeaderProps) => {
  const { user, signOut } = useAuth();
  const { isAdmin, isHost, isGuest } = useUserRole();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Local state for buffering user input
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const [localDateRange, setLocalDateRange] = useState(dateRange);

  // Sync local state when props change externally
  useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    setLocalDateRange(dateRange);
  }, [dateRange]);

  const handleSearchClick = () => {
    onSearchQueryChange(localSearchQuery);
    onDateRangeChange(localDateRange);
    onSearch(localSearchQuery, localDateRange);
  };

  return (
    <>
    <nav className="border-b bg-card/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="w-full px-6">
        <div className="flex items-center justify-between h-20 gap-4">
          <BrandLogo className="flex-shrink-0 [&_svg]:h-9 [&_svg]:w-9 [&_span]:hidden sm:[&_span]:inline" />

          {/* Search Component */}
          <div className="flex-1 max-w-xl">
            <div className="rounded-full border bg-white p-1.5">
              <div className="flex items-center gap-1">
                {/* Destination */}
                <div className="flex-1 flex items-center gap-2 px-2 h-[36px] min-w-0">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <DestinationAutocomplete
                    value={localSearchQuery.location}
                    onChange={(destination) => setLocalSearchQuery({
                      ...localSearchQuery,
                      location: destination.displayText,
                      locationSearch: destination.searchValue,
                      city_id: destination.city_id || null,
                      state_region_id: destination.state_region_id || null,
                      country_id: destination.country_id || null,
                      latitude: destination.latitude ?? null,
                      longitude: destination.longitude ?? null,
                    })}
                    placeholder="Destination"
                    className="h-[36px]"
                  />
                </div>
                
                <div className="hidden sm:block h-6 w-px bg-border" />
                
                {/* Dates */}
                <div className="hidden sm:flex flex-1 items-center gap-2 px-2 h-[36px] min-w-0">
                  <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className={cn(
                          "flex-1 justify-start text-left font-normal h-auto p-0 hover:bg-transparent text-sm",
                          !localDateRange?.from && "text-muted-foreground"
                        )}
                      >
                        {localDateRange?.from ? (
                          localDateRange.to ? (
                            `${format(localDateRange.from, "MMM dd")} - ${format(localDateRange.to, "MMM dd")}`
                          ) : (
                            format(localDateRange.from, "MMM dd")
                          )
                        ) : (
                          <span>Dates</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="center" sideOffset={12}>
                      <CalendarComponent
                        mode="range"
                        selected={localDateRange}
                        onSelect={setLocalDateRange}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        numberOfMonths={2}
                        initialFocus
                        className="p-4 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="hidden sm:block h-6 w-px bg-border" />
                
                {/* Guests */}
                <div className="hidden md:flex flex-1 items-center gap-2 px-2 h-[36px] min-w-0">
                  <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className={cn(
                          "flex-1 justify-start text-left font-normal h-auto p-0 hover:bg-transparent text-sm",
                          (!localSearchQuery.guests || localSearchQuery.guests === "0") && "text-muted-foreground"
                        )}
                      >
                        {localSearchQuery.guests && localSearchQuery.guests !== "0" ? `${localSearchQuery.guests} guest${Number(localSearchQuery.guests) !== 1 ? 's' : ''}` : "Guests"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-6" align="end" sideOffset={12}>
                      <div className="flex items-center justify-between">
                        <span className="text-base font-semibold">Guests</span>
                        <div className="flex items-center gap-4">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-full"
                            onClick={() => {
                              const current = Number(localSearchQuery.guests) || 0;
                              if (current > 0) {
                                setLocalSearchQuery({
                                  ...localSearchQuery,
                                  guests: String(current - 1)
                                });
                              }
                            }}
                            disabled={!localSearchQuery.guests || Number(localSearchQuery.guests) <= 0}
                          >
                            <span className="text-lg">−</span>
                          </Button>
                          <span className="text-2xl font-semibold w-12 text-center">
                            {localSearchQuery.guests || "0"}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-full"
                            onClick={() => {
                              const current = Number(localSearchQuery.guests) || 0;
                              if (current < 25) {
                                setLocalSearchQuery({
                                  ...localSearchQuery,
                                  guests: String(current + 1)
                                });
                              }
                            }}
                            disabled={localSearchQuery.guests && Number(localSearchQuery.guests) >= 25}
                          >
                            <span className="text-lg">+</span>
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                
                {/* Search Button */}
                <Button 
                  size="icon"
                  className="rounded-full h-[36px] w-[36px] flex-shrink-0" 
                  onClick={handleSearchClick}
                  aria-label="Find a court"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Right Side Navigation */}
          <div className="hidden">
            <Link to="/" className="hidden lg:block text-sm font-medium hover:text-primary transition-colors">
              Book
            </Link>
            <Link to="/become-host" className="hidden lg:block text-sm font-medium hover:text-primary transition-colors">
              Become a Host
            </Link>
            <Link to="#" className="hidden lg:block text-sm font-medium hover:text-primary transition-colors">
              Help
            </Link>
            
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <User className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Account</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[100]">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {isGuest && <DropdownMenuItem asChild>
                    <Link to="/guest/dashboard">Guest Dashboard</Link>
                  </DropdownMenuItem>}
                  {isHost && (
                    <DropdownMenuItem asChild>
                      <Link to="/host/dashboard">Host Dashboard</Link>
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin/dashboard">Admin Dashboard</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button size="sm" className="rounded-full" onClick={() => setAuthDialogOpen(true)}>
                Sign Up
              </Button>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
            className="h-10 w-10 shrink-0 rounded-full border-slate-200 bg-white shadow-sm transition-all hover:border-slate-400 hover:shadow-md"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </nav>

      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-[80] cursor-default bg-slate-950/45 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-2 end-2 z-[90] flex w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-white shadow-2xl"
              initial={{ x: "110%", opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "110%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5">
                <BrandLogo className="[&_svg]:h-9 [&_svg]:w-9" />
                <Button type="button" variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} className="rounded-full bg-slate-100" aria-label="Close menu">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {[
                  { to: "/", label: "Book a court", icon: Home },
                  { to: "/become-host", label: "Become a Host", icon: Building2 },
                  { to: "/help-center", label: "Help Center", icon: LifeBuoy },
                ].map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <motion.div key={item.to} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 + index * 0.06 }}>
                      <Link to={item.to} onClick={() => setMobileMenuOpen(false)} className="group flex items-center gap-3 rounded-2xl px-4 py-3.5 font-semibold text-slate-800 transition-colors hover:bg-slate-100">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-white"><Icon className="h-5 w-5" /></span>
                        <span className="flex-1">{item.label}</span>
                        <ChevronRight className="h-4 w-4 text-slate-400 rtl:rotate-180" />
                      </Link>
                    </motion.div>
                  );
                })}

                {user && (
                  <Link to={isAdmin ? "/admin/dashboard" : isHost ? "/host/dashboard" : "/guest/dashboard"} onClick={() => setMobileMenuOpen(false)} className="mt-3 flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3.5 font-semibold text-emerald-900">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"><LayoutDashboard className="h-5 w-5" /></span>
                    <span className="flex-1">Dashboard</span>
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                  </Link>
                )}
              </div>

              <div className="border-t border-slate-100 bg-slate-50 p-4">
                {user ? (
                  <Button variant="outline" className="h-12 w-full rounded-xl bg-white font-bold" onClick={() => { signOut(); setMobileMenuOpen(false); }}>
                    <LogOut className="me-2 h-4 w-4" /> Logout
                  </Button>
                ) : (
                  <Button className="h-12 w-full rounded-xl bg-slate-950 font-bold hover:bg-slate-800" onClick={() => { setMobileMenuOpen(false); setAuthDialogOpen(true); }}>
                    Sign Up
                  </Button>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      
      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </>
  );
};

export default SearchPageHeader;
