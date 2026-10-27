import { formatTimeOfDay as formatTime, normalizeTimeInput } from "@/lib/bookingTime";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { Calendar as CalendarIcon, Users, Loader2, Hourglass, ChevronLeft, ChevronRight, Banknote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { AuthDialog } from "@/components/AuthDialog";
import GuestDebtPaymentDialog from "@/components/guest/GuestDebtPaymentDialog";
import { courtChannelName, notifyCourtAvailabilityChanged } from "@/lib/courtAvailability";
import { formatIQD } from "@/lib/currency";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";


interface BookingWidgetProps {
  listing: {
    id: string;
    base_price: number;
    guests_max: number;
    cancellation_policy_id: string;
    min_hours?: number | null;
    max_hours?: number | null;
    slot_duration_minutes?: number | null;
    opening_time?: string | null;
    closing_time?: string | null;
  };
}

interface GridSlot {
  slot_start: string;
  slot_end: string;
  is_available: boolean;
  price: number;
}

const GRID_MINUTES = 30;

const getBaghdadDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};

const fromMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
};



const BookingWidget = ({ listing }: BookingWidgetProps) => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = (text: string) => translateUiText(text, language);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const formatHours = (hours: number) => {
    const value = Number.isInteger(hours) ? hours : hours.toFixed(1);
    if (language === "ar") return `${value} ساعة`;
    if (language === "ckb") return `${value} کاتژمێر`;
    if (language === "kmr") return `${value} دەمژمێر`;
    return `${value} h`;
  };

  const availabilityText = () => {
    const opening = formatTime(listing.opening_time!);
    const closing = formatTime(listing.closing_time!);
    if (language === "ar") return `مفتوح من ${opening} إلى ${closing} · مدة الحجز ${minHours}–${maxHours} ساعات كاملة`;
    if (language === "ckb") return `کراوەیە لە ${opening} تا ${closing} · ماوەی حجز ${minHours}–${maxHours} کاتژمێری تەواو`;
    if (language === "kmr") return `ڤەکرییە ژ ${opening} هەتا ${closing} · ماوەیا حجزێ ${minHours}–${maxHours} دەمژمێرێن تەمام`;
    return `Open ${opening}–${closing} · book for ${minHours}–${maxHours} whole hours`;
  };

  // Bookings are sold in whole hours only, capped at five hours per booking.
  const minHours = Math.min(5, Math.max(1, Math.ceil(listing.min_hours ?? 1)));
  const maxHours = Math.max(minHours, Math.min(5, Math.floor(listing.max_hours ?? 5)));

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => {
    const dateParam = searchParams.get("date") || searchParams.get("checkIn");
    if (dateParam) {
      try {
        const parsed = parseISO(dateParam);
        if (!isNaN(parsed.getTime()) && format(parsed, "yyyy-MM-dd") >= getBaghdadDateKey()) return parsed;
      } catch (e) {
        /* ignore invalid date param */
      }
    }
    return undefined;
  });

  const [players, setPlayers] = useState(() => {
    const param = searchParams.get("players") || searchParams.get("guests");
    const parsed = param ? parseInt(param) : NaN;
    return !isNaN(parsed) && parsed > 0 ? parsed : 1;
  });

  const [grid, setGrid] = useState<GridSlot[]>([]);
  const gridRequestIdRef = useRef(0);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [timeDraft, setTimeDraft] = useState("");
  const [durationHours, setDurationHours] = useState(minHours);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotLoadError, setSlotLoadError] = useState(false);
  const [availabilityMonth, setAvailabilityMonth] = useState(() => startOfMonth(selectedDate ?? new Date()));
  const [availabilityState, setAvailabilityState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [bookableDateKeys, setBookableDateKeys] = useState<Set<string>>(new Set());
  const [availabilityLoadedFor, setAvailabilityLoadedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [debtPaymentDialogOpen, setDebtPaymentDialogOpen] = useState(false);
  const [guestServiceFeeRate, setGuestServiceFeeRate] = useState(0.08);
  const [taxRate, setTaxRate] = useState(0.1);

  // Platform rates
  useEffect(() => {
    const fetchRates = async () => {
      const { data: settings } = await supabase
        .from("platform_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["default_guest_service_fee_rate", "default_tax_rate"])
        .eq("is_active", true);

      if (settings) {
        const fee = settings.find(s => s.setting_key === "default_guest_service_fee_rate");
        const tax = settings.find(s => s.setting_key === "default_tax_rate");
        if (fee) setGuestServiceFeeRate(parseFloat(fee.setting_value));
        if (tax) setTaxRate(parseFloat(tax.setting_value));
      }
    };
    fetchRates();
  }, []);

  // Load the half-hour grid for the selected day
  const loadGrid = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!selectedDate) return;
      const requestId = ++gridRequestIdRef.current;
      if (!opts?.silent) setSlotsLoading(true);
      try {
        const { data, error } = await supabase.rpc("get_listing_slot_grid", {
          p_listing_id: listing.id,
          p_date: format(selectedDate, "yyyy-MM-dd"),
          p_step_minutes: GRID_MINUTES,
        });
        if (requestId !== gridRequestIdRef.current) return;
        if (error) {
          console.error("Failed to load time slots:", error);
          setGrid([]);
          setSlotLoadError(true);
        } else {
          setGrid((data as GridSlot[]) || []);
          setSlotLoadError(false);
        }
      } catch (error) {
        if (requestId !== gridRequestIdRef.current) return;
        console.error("Failed to load time slots:", error);
        setGrid([]);
        setSlotLoadError(true);
      } finally {
        if (requestId === gridRequestIdRef.current) setSlotsLoading(false);
      }
    },
    [listing.id, selectedDate]
  );

  useEffect(() => {
    if (!selectedDate) {
      gridRequestIdRef.current += 1;
      setGrid([]);
      setStartTime(null);
      setSlotsLoading(false);
      return;
    }
    setGrid([]);
    setStartTime(null);
    loadGrid();
  }, [loadGrid, selectedDate]);

  useEffect(() => {
    setTimeDraft(startTime ? startTime.slice(0, 5) : "");
  }, [startTime]);

  // Live availability: refresh the grid when anyone books or blocks time on this court
  useEffect(() => {
    if (!selectedDate) return;
    const channel = supabase
      .channel(courtChannelName(listing.id))
      .on("broadcast", { event: "availability_changed" }, () => loadGrid({ silent: true }))
      .subscribe();

    const interval = window.setInterval(() => loadGrid({ silent: true }), 30000);
    const onFocus = () => loadGrid({ silent: true });
    window.addEventListener("focus", onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [listing.id, selectedDate, loadGrid]);

  useEffect(() => {
    if (!isCalendarOpen) return;
    let active = true;
    const firstDay = startOfMonth(availabilityMonth);
    const lastDay = endOfMonth(availabilityMonth);
    const monthKey = format(firstDay, "yyyy-MM");
    setAvailabilityLoadedFor(null);
    setAvailabilityState("loading");
    supabase.rpc("get_listing_bookable_dates", {
      p_listing_id: listing.id,
      p_start_date: format(firstDay, "yyyy-MM-dd"),
      p_end_date: format(lastDay, "yyyy-MM-dd"),
      p_duration_hours: durationHours,
      p_step_minutes: GRID_MINUTES,
    }).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("Failed to load bookable dates:", error);
        setAvailabilityState("error");
        return;
      }
      const dates = new Set((data || []).map(item => item.bookable_date));
      setBookableDateKeys(dates);
      setAvailabilityLoadedFor(monthKey);
      setAvailabilityState("loaded");
      if (selectedDate && format(selectedDate, "yyyy-MM") === monthKey && !dates.has(format(selectedDate, "yyyy-MM-dd"))) {
        setSelectedDate(undefined);
        setStartTime(null);
      }
    });
    return () => { active = false; };
  }, [isCalendarOpen, availabilityMonth, durationHours, listing.id, selectedDate]);

  const availabilityMonthKey = format(startOfMonth(availabilityMonth), "yyyy-MM");
  const availabilityReady = availabilityState === "loaded" && availabilityLoadedFor === availabilityMonthKey;

  // Duration options are whole hours (1–5), never fractional hours.
  const durationOptions = useMemo(() => {
    const options: number[] = [];
    for (let h = minHours; h <= maxHours; h += 1) options.push(h);
    return options;
  }, [minHours, maxHours]);

  const unitsFor = (start: string, hours: number) => {
    const needed = Math.round((hours * 60) / GRID_MINUTES);
    const startMin = toMinutes(start);
    const units: GridSlot[] = [];
    for (let i = 0; i < needed; i++) {
      const unit = grid.find(s => toMinutes(s.slot_start) === startMin + i * GRID_MINUTES);
      if (!unit || !unit.is_available) return null;
      units.push(unit);
    }
    return units;
  };

  const startOptions = useMemo(
    () =>
      grid
        .filter(s => s.is_available)
        .map(s => ({ ...s, fits: !!unitsFor(s.slot_start, durationHours) })),
    [grid, durationHours]
  );

  const selectedUnits = useMemo(
    () => (startTime ? unitsFor(startTime, durationHours) : null),
    [startTime, durationHours, grid]
  );

  useEffect(() => {
    if (startTime && grid.length > 0 && !unitsFor(startTime, durationHours)) {
      setStartTime(null);
    }
  }, [startTime, durationHours, grid]);

  const hours = selectedUnits ? durationHours : 0;
  const subtotal = (selectedUnits || []).reduce(
    (sum, unit) => sum + Number(unit.price) * (GRID_MINUTES / 60),
    0
  );
  const serviceFee = subtotal * guestServiceFeeRate;
  const taxes = (subtotal + serviceFee) * taxRate;
  const totalPrice = subtotal + serviceFee + taxes;

  const endTime = startTime ? fromMinutes(toMinutes(startTime) + durationHours * 60) : undefined;

  const handleStartClick = (slot: GridSlot & { fits: boolean }) => {
    if (!slot.fits) {
      toast({
        title: "Not enough time",
        description: `There isn't a free ${formatHours(durationHours)} block starting at ${formatTime(slot.slot_start)}.`,
        variant: "destructive",
      });
      return;
    }
    setStartTime(startTime === slot.slot_start ? null : slot.slot_start);
  };

  const validStartOptions = startOptions.filter(slot => slot.fits);
  const moveStartTime = (direction: -1 | 1) => {
    if (validStartOptions.length === 0) return;
    const currentIndex = validStartOptions.findIndex(slot => slot.slot_start === startTime);
    const nextIndex = currentIndex < 0
      ? 0
      : Math.min(validStartOptions.length - 1, Math.max(0, currentIndex + direction));
    setStartTime(validStartOptions[nextIndex].slot_start);
  };

  const commitManualTime = () => {
    const compact = timeDraft.trim().replace(/\s/g, "");
    const timeParts = compact.match(/^(\d{1,2})(?::?)(\d{2})$/);
    if (!timeParts) {
      setStartTime(null);
      setTimeDraft("");
      toast({ title: "Invalid time", description: "Enter the time as HH:MM, for example 18:30.", variant: "destructive" });
      return;
    }
    const value = `${timeParts[1].padStart(2, "0")}:${timeParts[2]}`;
    const normalized = `${value}:00`;
    const availableSlot = validStartOptions.find(slot => slot.slot_start === normalized);
    if (availableSlot) {
      setStartTime(availableSlot.slot_start);
      setTimeDraft(value);
      return;
    }
    setStartTime(null);
    setTimeDraft("");
    toast({ title: "Time unavailable", description: "Choose an available time in 30-minute steps.", variant: "destructive" });
  };


  const handleBooking = async () => {
    if (!user) {
      localStorage.setItem(
        "pendingBooking",
        JSON.stringify({
          listingId: listing.id,
          date: selectedDate,
          startTime,
          endTime,
          players,
        })
      );
      setAuthDialogOpen(true);
      return;
    }

    if (!selectedDate || !startTime || !endTime) {
      toast({
        title: "Pick a time",
        description: "Select a date and at least one time slot.",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isInteger(hours) || hours < 1 || hours > 5 || hours < minHours) {
      toast({
        title: "Minimum booking length",
        description: `Choose a whole-hour booking between ${minHours} and ${maxHours} hours.`,
        variant: "destructive",
      });
      return;
    }

    if (players > 25) {
      toast({
        title: "Too many players",
        description: "Bookings support up to 25 players.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const bookingDate = format(selectedDate, "yyyy-MM-dd");

      const { data: result, error } = await supabase.rpc("create_hourly_booking", {
        p_listing_id: listing.id,
        p_booking_date: bookingDate,
        p_start_time: startTime,
        p_end_time: endTime,
        p_players: players,
        p_subtotal: subtotal,
        p_pricing_breakdown: {
          hours,
          slot_minutes: GRID_MINUTES,
          price_per_hour: hours > 0 ? Number((subtotal / hours).toFixed(2)) : 0,
          slots: (selectedUnits || []).map(s => ({
            start: s.slot_start,
            end: s.slot_end,
            price: Number(s.price),
          })),
        },
      });


      if (error) {
        if (error.message?.includes("OUTSTANDING_DEBT::")) {
          setDebtPaymentDialogOpen(true);
          setLoading(false);
          return;
        }
        throw error;
      }

      const typedResult = result as { booking_id?: string };
      if (!typedResult?.booking_id) throw new Error("Failed to create booking");

      toast({ title: "Slot held", description: "Proceeding to checkout..." });
      notifyCourtAvailabilityChanged(listing.id).catch(() => {});
      navigate(`/checkout?bookingId=${typedResult.booking_id}`);
    } catch (error: any) {
      console.error("Booking error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create booking",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const availableCount = grid.filter(s => s.is_available).length;

  return (
    <>
      <GuestDebtPaymentDialog
        open={debtPaymentDialogOpen}
        onOpenChange={setDebtPaymentDialogOpen}
        onPaymentSuccess={() => {
          setDebtPaymentDialogOpen(false);
          toast({
            title: "Payment Successful",
            description: "Your balance is cleared. You can now book this court.",
          });
        }}
      />
      <Card className="overflow-hidden rounded-[2rem] border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.12)]">
        <CardHeader className="border-b border-slate-100 bg-gradient-to-br from-white to-slate-50 pb-5">
          <CardTitle className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-slate-950">{formatIQD(listing.base_price)}</span>
            <span className="text-base font-normal text-muted-foreground">{t("/ hour")}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          {/* Date picker */}
          <div>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-left transition-colors hover:border-primary/40"
                  aria-label={selectedDate ? `Play date: ${format(selectedDate, "EEE, MMM dd, yyyy")}` : "Select play date"}
                >
                  <div className="flex flex-col gap-2 flex-1">
                    <Label className="text-sm font-medium">Play date</Label>
                    <div className={cn("text-sm", !selectedDate && "text-muted-foreground")}>
                      {selectedDate ? format(selectedDate, "EEE, MMM dd, yyyy") : "Select date"}
                    </div>
                  </div>
                  <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                {availabilityState === "loading" && <p className="px-4 pt-3 text-xs text-muted-foreground">Checking available dates…</p>}
                {availabilityState === "error" && <p className="px-4 pt-3 text-xs text-destructive">Could not check dates. Close and reopen to try again.</p>}
                <Calendar
                  mode="single"
                  month={availabilityMonth}
                  onMonthChange={setAvailabilityMonth}
                  selected={selectedDate}
                  onSelect={date => {
                    setSelectedDate(date);
                    setIsCalendarOpen(false);
                  }}
                  disabled={date => format(date, "yyyy-MM-dd") < getBaghdadDateKey() || !availabilityReady || !bookableDateKeys.has(format(date, "yyyy-MM-dd"))}
                  initialFocus
                  className="pointer-events-auto p-3"
                />
              </PopoverContent>
            </Popover>
            {listing.opening_time && listing.closing_time && (
              <p className="text-xs text-muted-foreground mt-2">
                {availabilityText()}
              </p>
            )}
          </div>

          {/* Duration */}
          <div>
            <Label className="text-sm font-medium flex items-center gap-2 mb-2">
              <Hourglass className="h-4 w-4" /> How long?
            </Label>
            <div className="flex flex-wrap gap-2">
              {durationOptions.map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDurationHours(option)}
                  className={cn(
                    "rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
                    option === durationHours
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-white border-[#D5DAE7] hover:border-primary"
                  )}
                >
                  {formatHours(option)}
                </button>
              ))}
            </div>
          </div>

          {/* Start time */}
          <div>
            <Label className="mb-2 flex items-center text-sm font-medium">Start time</Label>
            {!selectedDate ? (
              <p className="text-sm text-muted-foreground">Pick a date to see available times.</p>
            ) : slotsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : slotLoadError ? (
              <p className="text-sm text-destructive">Could not load this court’s availability. Please try again.</p>
            ) : grid.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No opening hours set for this court yet.
              </p>
            ) : availableCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                Fully booked on this date. Try another day.
              </p>
            ) : startOptions.every(s => !s.fits) ? (
              <p className="text-sm text-muted-foreground">
                No free {formatHours(durationHours)} block left on this date. Try a shorter time or
                another day.
              </p>
            ) : (
              <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-xl bg-white" onClick={() => moveStartTime(-1)} disabled={validStartOptions.length === 0 || startTime === validStartOptions[0]?.slot_start} aria-label="Previous available time"><ChevronLeft className="h-4 w-4" /></Button>
                <div className="text-center">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="HH:MM"
                    value={timeDraft}
                    onChange={event => setTimeDraft(normalizeTimeInput(event.target.value))}
                    onBlur={commitManualTime}
                    onKeyDown={event => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitManualTime();
                      }
                    }}
                    className="h-10 w-full bg-transparent text-center text-lg font-semibold text-slate-950 outline-none placeholder:text-slate-400"
                    aria-label="Start time"
                  />
                  <p className="text-[11px] text-muted-foreground">Type a time or use the arrows</p>
                </div>
                <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-xl bg-white" onClick={() => moveStartTime(1)} disabled={validStartOptions.length === 0 || startTime === validStartOptions[validStartOptions.length - 1]?.slot_start} aria-label="Next available time"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
            {startTime && endTime && (
              <p className="text-xs text-muted-foreground mt-2">
                Playing {formatTime(startTime)}–{formatTime(endTime)} ·{" "}
                {formatHours(durationHours)}
              </p>
            )}
          </div>


          {/* Players */}
          <div>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-16 w-full cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-left transition-colors hover:border-primary/40"
                  aria-label={`Players: ${players}`}
                >
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Players</Label>
                    <div className="text-sm">
                      {players} {players === 1 ? "player" : "players"}
                    </div>
                  </div>
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4" align="end">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Players</div>
                    <div className="text-sm text-muted-foreground">
                      Maximum 25
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => setPlayers(Math.max(1, players - 1))}
                      disabled={players <= 1}
                    >
                      -
                    </Button>
                    <span className="w-8 text-center font-medium">{players}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => setPlayers(Math.min(25, players + 1))}
                      disabled={players >= 25}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Price breakdown */}
          {hours > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-sm">
                <span>
                  {formatTime(startTime!)}–{formatTime(endTime!)} ({formatHours(hours)})
                </span>

                <span>{formatIQD(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>{t("Service fee")}</span>
                <span>{formatIQD(serviceFee)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>{t("Taxes")}</span>
                <span>{formatIQD(taxes)}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between font-semibold">
                <span>{t("Total")}</span>
                <span>{formatIQD(totalPrice)}</span>
              </div>
            </div>
          )}

          <Button
            onClick={handleBooking}
            disabled={loading || !selectedDate || hours < minHours}
            className="h-12 w-full rounded-full text-base font-semibold shadow-lg shadow-primary/15"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Holding slot...
              </>
            ) : (
              "Book this court"
            )}
          </Button>

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"><Banknote className="h-3.5 w-3.5" />Pay in cash at the venue</p>
        </CardContent>

        <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
      </Card>
    </>
  );
};

export default BookingWidget;
