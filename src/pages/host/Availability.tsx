import { useCallback, useEffect, useMemo, useState } from "react";
import { format, addDays, startOfToday, isBefore } from "date-fns";
import { CalendarIcon, Loader2, Lock, LockOpen, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { courtChannelName, notifyCourtAvailabilityChanged } from "@/lib/courtAvailability";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";


interface CourtOption {
  id: string;
  title: string;
}

interface GridSlot {
  slot_start: string;
  slot_end: string;
  is_available: boolean;
  price: number;
}

interface BookedSlot {
  start_time: string;
  end_time: string;
  status: string;
}

interface BlockedRow {
  id: string;
  start_time: string | null;
  end_time: string | null;
}

const GRID_MINUTES = 30;

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};

const formatTime = (time: string) => time.slice(0, 5);

const HostAvailability = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [courtId, setCourtId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [grid, setGrid] = useState<GridSlot[]>([]);
  const [booked, setBooked] = useState<BookedSlot[]>([]);
  const [blocked, setBlocked] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingSlot, setSavingSlot] = useState<string | null>(null);

  const dateKey = format(selectedDate, "yyyy-MM-dd");

  useEffect(() => {
    const fetchCourts = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("listings")
        .select("id, title")
        .eq("host_user_id", user.id)
        .order("created_at", { ascending: false });
      const list = (data as CourtOption[]) || [];
      setCourts(list);
      if (list.length > 0) setCourtId(prev => prev || list[0].id);
    };
    fetchCourts();
  }, [user]);

  const loadDay = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!courtId) return;
      if (!opts?.silent) setLoading(true);

      const [gridRes, bookingsRes, blockedRes] = await Promise.all([
        supabase.rpc("get_listing_slot_grid", {
          p_listing_id: courtId,
          p_date: dateKey,
          p_step_minutes: GRID_MINUTES,
        }),
        supabase
          .from("bookings")
          .select("start_time, end_time, status")
          .eq("listing_id", courtId)
          .eq("booking_date", dateKey)
          .in("status", ["pending_payment", "pending_host_confirmation", "confirmed", "completed"]),
        supabase
          .from("listing_availability")
          .select("id, start_time, end_time")
          .eq("listing_id", courtId)
          .is("price", null)
          .lte("start_date", dateKey)
          .gte("end_date", dateKey),
      ]);

      setGrid((gridRes.data as GridSlot[]) || []);
      setBooked((bookingsRes.data as BookedSlot[]) || []);
      setBlocked((blockedRes.data as BlockedRow[]) || []);
      if (!opts?.silent) setLoading(false);
    },
    [courtId, dateKey]
  );

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  // Live updates when a player books or a block changes
  useEffect(() => {
    if (!courtId) return;
    const channel = supabase
      .channel(courtChannelName(courtId))
      .on("broadcast", { event: "availability_changed" }, () => loadDay({ silent: true }))
      .subscribe();

    const interval = window.setInterval(() => loadDay({ silent: true }), 30000);
    const onFocus = () => loadDay({ silent: true });
    window.addEventListener("focus", onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [courtId, loadDay]);

  const slotState = useMemo(() => {
    return grid.map(slot => {
      const s = toMinutes(slot.slot_start);
      const e = toMinutes(slot.slot_end);

      const isBooked = booked.some(
        b => toMinutes(b.start_time) < e && toMinutes(b.end_time) > s
      );
      const blockRow = blocked.find(
        b =>
          !b.start_time ||
          !b.end_time ||
          (toMinutes(b.start_time) < e && toMinutes(b.end_time) > s)
      );

      return {
        ...slot,
        isBooked,
        blockRow: isBooked ? undefined : blockRow,
      };
    });
  }, [grid, booked, blocked]);

  const bookedCount = slotState.filter(s => s.isBooked).length;
  const blockedCount = slotState.filter(s => !s.isBooked && s.blockRow).length;
  const freeCount = slotState.filter(s => !s.isBooked && !s.blockRow).length;

  const toggleBlock = async (slot: (typeof slotState)[number]) => {
    if (slot.isBooked) {
      toast({
        title: "Already booked",
        description: "This time is taken by a player and can't be blocked.",
      });
      return;
    }

    setSavingSlot(slot.slot_start);
    try {
      if (slot.blockRow) {
        const { error } = await supabase
          .from("listing_availability")
          .delete()
          .eq("id", slot.blockRow.id);
        if (error) throw error;
        toast({ title: "Time opened", description: `${formatTime(slot.slot_start)} is bookable again.` });
      } else {
        const { error } = await supabase.from("listing_availability").insert({
          listing_id: courtId,
          start_date: dateKey,
          end_date: dateKey,
          start_time: slot.slot_start,
          end_time: slot.slot_end,
          price: null,
        });
        if (error) throw error;
        toast({ title: "Time blocked", description: `${formatTime(slot.slot_start)} is no longer bookable.` });
      }
      await loadDay({ silent: true });
      notifyCourtAvailabilityChanged(courtId).catch(() => {});
    } catch (error: any) {
      toast({
        title: "Could not update",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingSlot(null);
    }
  };

  return (
    <div className="container mx-auto px-4 pb-8 lg:px-8">
      <p className="mb-6 text-sm text-muted-foreground">
        See booked time, block the hours you keep for yourself, and stop double bookings.
      </p>


      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="text-lg">Court day view</CardTitle>
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <Label className="mb-2 block text-sm">Court</Label>
              <Select value={courtId} onValueChange={setCourtId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a court" />
                </SelectTrigger>
                <SelectContent>
                  {courts.map(court => (
                    <SelectItem key={court.id} value={court.id}>
                      {court.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block text-sm">Date</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2 md:w-56">
                    <CalendarIcon className="h-4 w-4" />
                    {format(selectedDate, "EEE, MMM d, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={date => {
                      if (date) setSelectedDate(date);
                      setCalendarOpen(false);
                    }}
                    disabled={date => isBefore(date, startOfToday())}
                    initialFocus
                    className="pointer-events-auto p-3"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button variant="outline" onClick={() => loadDay()} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{translateUiText(`${freeCount} open`, language)}</Badge>
            <Badge variant="destructive">{translateUiText(`${bookedCount} booked`, language)}</Badge>
            <Badge variant="outline">{translateUiText(`${blockedCount} blocked by you`, language)}</Badge>
          </div>
        </CardHeader>

        <CardContent>
          {courts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You don't have any courts yet. Add one to manage its availability.
            </p>
          ) : loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : slotState.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No opening hours set for this court yet. Add opening and closing times when editing it.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {slotState.map(slot => {
                  const isBusy = savingSlot === slot.slot_start;
                  return (
                    <button
                      key={slot.slot_start}
                      type="button"
                      onClick={() => toggleBlock(slot)}
                      disabled={slot.isBooked || isBusy}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                        slot.isBooked
                          ? "border-destructive/40 bg-destructive/10 text-destructive cursor-not-allowed"
                          : slot.blockRow
                            ? "border-muted bg-muted text-muted-foreground hover:border-primary"
                            : "border-border bg-card hover:border-primary"
                      )}
                    >
                      <span className="font-medium">
                        {formatTime(slot.slot_start)}–{formatTime(slot.slot_end)}
                      </span>
                      <span className="flex items-center gap-1">
                        {isBusy ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : slot.isBooked ? (
                          <>Booked</>
                        ) : slot.blockRow ? (
                          <>
                            <Lock className="h-3 w-3" /> Blocked
                          </>
                        ) : (
                          <>
                            <LockOpen className="h-3 w-3" /> Open
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Tap an open time to block it, tap a blocked time to open it again. Booked times update
                live as players pay.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default HostAvailability;
