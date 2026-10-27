import { CalendarDays, Clock3, MapPin, Users, MessageSquare, LifeBuoy } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusValue } from "@/components/ui/status-badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { formatIQD } from "@/lib/currency";
import { isHourlyBooking, formatSlotRange } from "@/lib/bookingTime";
import { googleMapsSearchUrl, mapCoordinates } from "@/lib/googleMaps";

export interface GuestBookingSummary {
  id: string;
  checkin_date: string;
  checkout_date: string;
  booking_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  hours?: number | null;
  guests: number;
  total_price: number;
  status: string;
  listings: { id: string; title: string; city: string; country: string; address?: string | null; cover_image: string | null; latitude?: number | null; longitude?: number | null } | null;
}

interface Props {
  booking: GuestBookingSummary;
  past?: boolean;
  hasReview?: boolean;
  onReview: () => void;
  onMessage: () => void;
  onSupport: () => void;
  onCancel: () => void;
}

export default function GuestBookingCard({ booking, past, hasReview, onReview, onMessage, onSupport, onCancel }: Props) {
  const { language } = useLanguage();
  const t = (value: string) => translateUiText(value, language);
  const listing = booking.listings;
  if (!listing) return null;
  const hourly = isHourlyBooking(booking);
  const waiting = booking.status === "pending_host_confirmation";
  const locale = language === "en" ? "en-GB" : language === "ckb" ? "ckb-IQ" : "ar-IQ";
  const date = (value: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  const coords = mapCoordinates(listing.latitude, listing.longitude);
  const mapUrl = coords ? googleMapsSearchUrl(coords.latitude, coords.longitude) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([listing.address, listing.city, listing.country].filter(Boolean).join(", "))}`;
  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col lg:flex-row">
        <img src={listing.cover_image || `${import.meta.env.BASE_URL}placeholder.svg`} alt={listing.title} loading="lazy" className="h-40 w-full object-cover sm:h-48 lg:h-auto lg:w-44" />
        <div className="min-w-0 flex-1 p-4 sm:p-6">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium text-slate-500">{t("Booking reference")} <span dir="ltr">#{booking.id.slice(0, 8).toUpperCase()}</span></p>
              <h2 className="break-words text-xl font-semibold leading-snug text-slate-950">{listing.title}</h2>
              <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-500"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{listing.city}, {t(listing.country)}</span></p>
            </div>
            <StatusBadge status={booking.status as StatusValue} className="max-w-full shrink-0 whitespace-normal px-3 py-1.5 leading-5" />
          </div>
          {waiting && <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"><Clock3 className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />{t("Your booking request is waiting for the host to approve it. We will send the details to your inbox after approval.")}</p>}
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 rounded-xl bg-slate-50 p-4 xl:grid-cols-4">
            <div className="min-w-0"><dt className="mb-1 flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{t(hourly ? "Date" : "Check-in")}</dt><dd className="text-sm font-medium leading-6">{date(booking.booking_date || booking.checkin_date)}</dd></div>
            <div className="min-w-0"><dt className="mb-1 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{t(hourly ? "Time" : "Check-out")}</dt><dd className="text-sm font-medium leading-6">{hourly ? <><span dir="ltr" className="inline-block">{formatSlotRange(booking)}</span><span className="block text-xs font-normal text-slate-500">{t("Iraq time (UTC+3)")}</span></> : date(booking.checkout_date)}</dd></div>
            <div><dt className="mb-1 flex items-center gap-1.5 text-xs text-slate-500"><Users className="h-3.5 w-3.5" aria-hidden="true" />{t(hourly ? "Players" : "Guests")}</dt><dd className="text-sm font-medium leading-6">{booking.guests}</dd></div>
            <div className="min-w-0"><dt className="mb-1 text-xs text-slate-500">{t("Total")}</dt><dd dir="ltr" className="inline-block break-words text-base font-semibold leading-6 text-emerald-900">{formatIQD(booking.total_price)}</dd></div>
          </dl>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button asChild className="h-11 rounded-xl px-3 text-sm"><Link to={`/booking-confirmation/${booking.id}`}>{t("Booking details")}</Link></Button>
            <Button variant="outline" asChild className="h-11 rounded-xl px-3 text-sm"><Link to={`/listing/${listing.id}`}>{t("View court")}</Link></Button>
            <Button variant="outline" asChild className="h-11 rounded-xl px-3 text-sm"><a href={mapUrl} target="_blank" rel="noopener noreferrer"><MapPin className="me-1.5 h-4 w-4 shrink-0" />{t("Map")}</a></Button>
            {!past && ["confirmed", "pending_host_confirmation"].includes(booking.status) && <Button variant="outline" onClick={onMessage} className="h-11 rounded-xl px-3 text-sm"><MessageSquare className="me-1.5 h-4 w-4 shrink-0" />{t("Message Host")}</Button>}
            <Button variant="outline" onClick={onSupport} className="h-11 rounded-xl px-3 text-sm"><LifeBuoy className="me-1.5 h-4 w-4 shrink-0" />{t("Contact Support")}</Button>
            {past && booking.status === "completed" && <Button variant="outline" onClick={onReview} className="h-11 rounded-xl px-3 text-sm">{t(hasReview ? "Edit Review" : "Leave Review")}</Button>}
            {!past && ["confirmed", "pending_host_confirmation"].includes(booking.status) && <Button variant="outline" onClick={onCancel} className="h-11 rounded-xl border-red-200 px-3 text-sm text-red-700 hover:bg-red-50 hover:text-red-800">{t("Cancel Booking")}</Button>}
            {!past && booking.status === "pending_payment" && <Button asChild className="h-11 rounded-xl px-3 text-sm"><Link to={`/checkout?bookingId=${booking.id}`}>{t("Complete your booking request")}</Link></Button>}
          </div>
        </div>
      </div>
    </article>
  );
}
