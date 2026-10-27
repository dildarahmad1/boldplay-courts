import { useState, useEffect, useRef, useId } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { locationAliases, normalizePlaceName } from "../../../supabase/functions/_shared/locationSearch";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface DestinationResult {
  id: string;
  type: 'city' | 'state' | 'country';
  name: string;
  stateName?: string;
  countryName: string;
  city_id?: string;
  state_region_id?: string;
  country_id?: string;
}

interface DestinationAutocompleteProps {
  value: string;
  onChange: (destination: {
    displayText: string;
    searchValue: string;
    city_id?: string;
    state_region_id?: string;
    country_id?: string;
    latitude?: number;
    longitude?: number;
  }) => void;
  placeholder?: string;
  className?: string;
  forceInline?: boolean;
}

const KURDISTAN_CITIES = [
  "Erbil", "Sulaymaniyah", "Duhok", "Halabja", "Kirkuk", "Zakho", "Soran", "Shaqlawa",
  "Akre", "Amedi", "Rawanduz", "Koya", "Choman", "Mergasor", "Salahaddin", "Harir",
  "Ranya", "Qaladiza", "Dukan", "Chamchamal", "Kalar", "Darbandikhan", "Penjwen", "Said Sadiq",
  "Sharbazher", "Kifri", "Khanaqin", "Bardarash", "Semel", "Shekhan", "Makhmur", "Altun Kupri",
].map((name) => ({
  id: `kurdistan-${name.toLowerCase().replace(/\s+/g, "-")}`,
  type: "city" as const,
  name,
  stateName: "Kurdistan Region",
  countryName: "Iraq",
}));

export default function DestinationAutocomplete({
  value,
  onChange,
  placeholder = "Destination",
  className,
  forceInline = false,
}: DestinationAutocompleteProps) {
  const isMobile = useIsMobile();
  const { language } = useLanguage();
  const t = (text: string) => translateUiText(text, language);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const [results, setResults] = useState<DestinationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestRequestRef = useRef(0);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  useEffect(() => {
    const searchDestinations = async () => {
      const trimmedSearchTerm = debouncedSearchTerm.trim();
      if (trimmedSearchTerm === "Current location") {
        latestRequestRef.current += 1;
        setIsLoading(false);
        setResults([]);
        return;
      }
      if (!trimmedSearchTerm) {
        latestRequestRef.current += 1;
        setResults(KURDISTAN_CITIES.slice(0, 8));
        setIsLoading(false);
        setSearchError(false);
        setSelectedIndex(-1);
        return;
      }

      const requestId = ++latestRequestRef.current;
      setIsLoading(true);
      setSearchError(false);
      setIsOpen(true);
      setSelectedIndex(-1);
      try {
        const searchPattern = `%${trimmedSearchTerm}%`;

        const [citiesResult, statesResult, countriesResult] = await Promise.all([
          supabase
            .from('cities')
            .select(`
              id,
              name,
              state_region_id,
              states_regions (id, name),
              country_id,
              countries (id, name, code)
            `)
            .ilike('name', searchPattern)
            .eq('is_active', true)
            .order('name')
            .limit(8),
          supabase
            .from('states_regions')
            .select(`
              id,
              name,
              country_id,
              countries (id, name, code)
            `)
            .ilike('name', searchPattern)
            .eq('is_active', true)
            .order('name')
            .limit(5),
          supabase
            .from('countries')
            .select('id, name, code')
            .ilike('name', searchPattern)
            .eq('is_active', true)
            .order('name')
            .limit(3),
        ]);

        const queryError = citiesResult.error || statesResult.error || countriesResult.error;
        if (queryError) throw queryError;
        if (requestId !== latestRequestRef.current) return;

        const cities = citiesResult.data;
        const states = statesResult.data;
        const countries = countriesResult.data;

        // Format results
        const formattedResults: DestinationResult[] = [];

        // Add city results
        cities?.forEach((city: any) => {
          formattedResults.push({
            id: city.id,
            type: 'city',
            name: city.name,
            stateName: city.states_regions?.name,
            countryName: city.countries?.name || '',
            city_id: city.id,
            state_region_id: city.state_region_id,
            country_id: city.country_id,
          });
        });

        // Add state results
        states?.forEach((state: any) => {
          formattedResults.push({
            id: state.id,
            type: 'state',
            name: state.name,
            countryName: state.countries?.name || '',
            state_region_id: state.id,
            country_id: state.country_id,
          });
        });

        // Add country results
        countries?.forEach((country: any) => {
          formattedResults.push({
            id: country.id,
            type: 'country',
            name: country.name,
            countryName: country.name,
            country_id: country.id,
          });
        });

        const localMatches = KURDISTAN_CITIES.filter((city) => locationAliases(city.name).some(name => name.includes(normalizePlaceName(trimmedSearchTerm))));
        const databaseNames = new Set(formattedResults.map((result) => result.name.toLowerCase()));
        setResults([...formattedResults, ...localMatches.filter((city) => !databaseNames.has(city.name.toLowerCase()))].slice(0, 12));
        setIsOpen(true);
      } catch (error) {
        if (requestId !== latestRequestRef.current) return;
        console.error('Error searching destinations:', error);
        setResults([]);
        setSearchError(true);
      } finally {
        if (requestId === latestRequestRef.current) setIsLoading(false);
      }
    };

    searchDestinations();
  }, [debouncedSearchTerm]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (result: DestinationResult) => {
    let displayText = result.name;
    let searchValue = result.name;

    if (result.type === 'city') {
      if (result.stateName) {
        displayText = `${result.name}, ${result.stateName}, ${result.countryName}`;
        searchValue = `${result.name}, ${result.stateName}, ${result.countryName}`;
      } else {
        displayText = `${result.name}, ${result.countryName}`;
        searchValue = `${result.name}, ${result.countryName}`;
      }
    } else if (result.type === 'state') {
      displayText = `${result.name}, ${result.countryName}`;
      searchValue = `${result.name}, ${result.countryName}`;
    } else {
      displayText = result.name;
      searchValue = result.name;
    }

    setSearchTerm(displayText);
    onChange({
      displayText,
      searchValue: result.city_id || result.state_region_id || result.country_id ? searchValue : result.name,
      city_id: result.city_id,
      state_region_id: result.state_region_id,
      country_id: result.country_id,
    });
    setIsOpen(false);
    setDrawerOpen(false);
    setSelectedIndex(-1);
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Could not determine your location. Try again or search by city.");
      return;
    }

    setLocationError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setSearchTerm("Current location");
        onChange({
          displayText: "Current location",
          searchValue: "",
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setLocating(false);
        setIsOpen(false);
        setDrawerOpen(false);
      },
      (error) => {
        setLocationError(error.code === 1
          ? "Location access denied. Allow location access or search by city."
          : "Could not determine your location. Try again or search by city.");
        setLocating(false);
        setIsOpen(true);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSelectedIndex(-1);
      return;
    }

    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        handleSelect(results[selectedIndex]);
      }
    }
  };

  const listboxId = useId();

  if (isMobile && !forceInline) {
    return (
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetTrigger asChild>
          <button type="button" className={cn("h-12 min-w-0 flex-1 truncate bg-transparent p-0 text-left text-sm font-medium", !value && "text-muted-foreground", className)}>
            {t(value || placeholder)}
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[78dvh] rounded-t-[28px] border-0 p-0">
          <SheetHeader className="border-b px-5 pb-4 pt-6 text-left">
            <SheetTitle className="text-xl">Choose your location</SheetTitle>
            <SheetDescription>Search across Kurdistan or use your current position.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 py-4">
            <button type="button" onClick={handleCurrentLocation} disabled={locating} className="flex w-full items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground"><Crosshair className="h-5 w-5" /></span>
              <span><span className="block font-semibold">{t(locating ? "Searching..." : "Use my current location")}</span><span className="text-sm text-muted-foreground">Show available courts near me</span></span>
            </button>
            {locationError && <p role="alert" className="px-1 text-sm text-destructive">{t(locationError)}</p>}
            <div className="flex items-center gap-3 rounded-2xl border bg-white px-4 shadow-sm">
              <Search className="h-5 w-5 text-muted-foreground" />
              <DestinationAutocomplete value={value} onChange={destination => {
                onChange(destination);
                if (destination.city_id || destination.state_region_id || destination.country_id
                    || destination.latitude !== undefined || destination.displayText !== destination.searchValue) {
                  setDrawerOpen(false);
                  setIsOpen(false);
                }
              }} placeholder="Search city or area" className="h-14" forceInline />
            </div>
            <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cities across Kurdistan Region</p>
            <div className="grid grid-cols-2 gap-2 overflow-y-auto pb-8">
              {KURDISTAN_CITIES.slice(0, 16).map((city) => (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => handleSelect(city)}
                  className="flex items-center gap-2 rounded-xl border bg-white px-3 py-3 text-left text-sm font-medium transition-all hover:border-primary/30 hover:bg-primary/5"
                >
                  <MapPin className="h-4 w-4 flex-shrink-0 text-primary" />
                  <span className="truncate">{city.name}</span>
                </button>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <Input
        placeholder={placeholder}
        value={searchTerm === "Current location" ? t(searchTerm) : searchTerm}
        onChange={(e) => {
          const nextValue = e.target.value;
          setSearchTerm(nextValue);
          onChange({ displayText: nextValue, searchValue: nextValue });
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsOpen(true)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={selectedIndex >= 0 ? `${listboxId}-option-${selectedIndex}` : undefined}
        className={cn("border-0 bg-transparent focus-visible:ring-0 p-0 text-sm", className)}
      />

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-2 max-h-[400px] w-[min(380px,calc(100vw-2rem))] overflow-y-auto rounded-lg border bg-popover shadow-lg"
        >
          <button type="button" onClick={handleCurrentLocation} disabled={locating} className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent">
            <Crosshair className="h-4 w-4 text-primary" />
            <div><div className="font-medium text-foreground">{t(locating ? "Searching..." : "Use my current location")}</div><div className="text-xs text-muted-foreground">Find available courts nearby</div></div>
          </button>
          {locationError && <p role="alert" className="px-4 py-3 text-sm text-destructive">{t(locationError)}</p>}
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
            </div>
          ) : searchError ? (
            <div className="px-4 py-4 text-center text-sm text-destructive">
              Could not load destinations. Please try again.
            </div>
          ) : results.length === 0 ? (
            <div className="py-4 px-4 text-sm text-muted-foreground text-center">
              {debouncedSearchTerm.trim() ? 'No destinations found' : 'Choose a popular city or start typing'}
            </div>
          ) : (
            <div className="py-1">
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}`}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={selectedIndex === index}
                  type="button"
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-accent transition-colors cursor-pointer flex items-start gap-3",
                    selectedIndex === index && "bg-accent"
                  )}
                >
                  <MapPin className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{result.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {result.type === 'city' && result.stateName
                        ? `${result.stateName}, ${result.countryName}`
                        : result.type === 'city'
                        ? result.countryName
                        : result.type === 'state'
                        ? result.countryName
                        : 'All locations'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
