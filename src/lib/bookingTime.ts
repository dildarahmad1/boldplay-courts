import { format, parseISO } from "date-fns";

export interface SlotBookingLike {
  booking_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  hours?: number | null;
  checkin_date?: string | null;
  checkout_date?: string | null;
  nights?: number | null;
}

/** Court slots use Iraq local time, regardless of the player's device timezone. */
export const iraqDateKey = (now = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const bookingHasEnded = (booking: SlotBookingLike & { status: string }, now = new Date()): boolean => {
  if (["completed", "cancelled", "cancelled_guest", "cancelled_host", "expired"].includes(booking.status)) return true;
  const date = booking.booking_date || booking.checkout_date || booking.checkin_date;
  if (!date) return false;
  const end = new Date(`${date}T${booking.end_time || "23:59:59"}+03:00`).getTime();
  return Number.isFinite(end) && end <= now.getTime();
};

/** True when the booking uses the hourly time-slot model. */
export const isHourlyBooking = (booking: SlotBookingLike | null | undefined): boolean =>
  !!(booking?.booking_date && booking?.start_time && booking?.end_time);

/** "18:00" from "18:00:00" */
export const formatTimeOfDay = (time?: string | null): string => {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const normalizeTimeInput = (value: string) => value
  .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
  .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
  .replace(/[^0-9:]/g, "").slice(0, 5);

/** "18:00 – 20:00", LTR-isolated so RTL pages don't render it as "20:00 – 18:00" */
export const formatSlotRange = (booking: SlotBookingLike): string =>
  `⁦${formatTimeOfDay(booking.start_time)} – ${formatTimeOfDay(booking.end_time)}⁩`;

/** "2 hours" */
export const formatDuration = (booking: SlotBookingLike): string => {
  const hours = Number(booking.hours || 0);
  if (!hours) return "";
  const rounded = Number.isInteger(hours) ? hours : Number(hours.toFixed(1));
  return `${rounded} ${rounded === 1 ? "hour" : "hours"}`;
};

/** "Sat, Sep 20, 2026" */
export const formatPlayDate = (booking: SlotBookingLike): string => {
  const date = booking.booking_date || booking.checkin_date;
  if (!date) return "";
  return format(parseISO(date), "EEE, MMM dd, yyyy");
};

/** "Sat, Sep 20, 2026 · 18:00 – 20:00", falling back to the legacy date range. */
export const formatBookingWhen = (booking: SlotBookingLike): string => {
  if (isHourlyBooking(booking)) {
    return `${formatPlayDate(booking)} · ${formatSlotRange(booking)}`;
  }
  if (booking.checkin_date && booking.checkout_date) {
    return `${format(parseISO(booking.checkin_date), "MMM dd")} - ${format(
      parseISO(booking.checkout_date),
      "MMM dd, yyyy"
    )}`;
  }
  return "";
};
