import { format } from "date-fns";
import { MapPin, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { isHourlyBooking, formatSlotRange, formatDuration } from "@/lib/bookingTime";
import { formatIQD } from "@/lib/currency";
import { StatusBadge, type StatusValue } from "@/components/ui/status-badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

interface DashboardBookingCardProps {
  booking: {
    id: string;
    checkin_date: string;
    checkout_date: string;
    nights: number;
    booking_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    hours?: number | null;
    guests: number;
    total_price: number;
    status: string;
    listings: {
      id: string;
      title: string;
      address: string;
      city: string;
      state: string | null;
      country: string;
      cover_image: string | null;
      type: string;
      size_sqft: number | null;
      host_user_id: string;
      latitude?: number | null;
      longitude?: number | null;
    };
  };
  onCancelBooking?: (booking: any) => void;
  onMessageHost?: (booking: any) => void;
  onContactSupport?: (booking: any) => void;
  showReviewButton?: boolean;
  hasReview?: boolean;
  onReviewAction?: () => void;
}

export const DashboardBookingCard = ({
  booking,
  onCancelBooking,
  onMessageHost,
  onContactSupport,
  showReviewButton = false,
  hasReview = false,
  onReviewAction,
}: DashboardBookingCardProps) => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const t = (text: string) => translateUiText(text, language);

  // Safety check: ensure listings data exists
  if (!booking.listings) {
    console.error("Booking missing listings data:", booking);
    return null;
  }

  const hourly = isHourlyBooking(booking);

  const formatDate = (date: string) => new Intl.DateTimeFormat(language === "en" ? "en-GB" : language === "ckb" ? "ckb-IQ" : "ar-IQ", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));

  const formatAddress = () => {
    const parts = [
      booking.listings.address,
      booking.listings.city,
      booking.listings.state,
      booking.listings.country,
    ].filter(Boolean);
    return parts.join(", ");
  };

  const mapUrl = (() => {
    const { latitude, longitude } = booking.listings;
    const query = latitude != null && longitude != null
      ? `${latitude},${longitude}`
      : formatAddress();
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  })();

  const formatPropertyDetails = () => {
    const parts = [booking.listings.type];
    if (booking.listings.size_sqft) {
      parts.push(`${booking.listings.size_sqft} sq ft`);
    }
    return parts.join(" • ");
  };

  return (
    <div className="flex flex-wrap items-start gap-3 p-4 border border-[#D5DAE7] rounded-2xl hover:bg-[#F8FAFF] transition-colors sm:flex-nowrap">
      {/* Listing Image */}
      <img
        src={booking.listings.cover_image || `${import.meta.env.BASE_URL}placeholder.svg`}
        alt={booking.listings.title}
        className="w-20 h-20 rounded-lg object-cover shrink-0"
      />

      {/* Booking Details */}
      <div className="flex-1 min-w-0">
        <StatusBadge status={booking.status as StatusValue} className="mb-2 max-w-full whitespace-normal leading-5" />
        {/* Line 1: Dates, Price, Guests */}
        <p className="text-sm text-muted-foreground mb-1">
          <span>{hourly ? formatDate(booking.booking_date!) : `${formatDate(booking.checkin_date)} – ${formatDate(booking.checkout_date)}`}</span>
          {hourly && <span className="block" dir="ltr">{formatSlotRange(booking)}</span>}
          <span dir="ltr" className="inline-block">{formatIQD(booking.total_price)}</span>{" · "}
          {hourly
            ? t(formatDuration(booking))
            : t(`${booking.nights} ${booking.nights === 1 ? "night" : "nights"}`)}{" "}
          • {booking.guests}{" "}
          {hourly
            ? booking.guests === 1
              ? t("player")
              : t("players")
            : booking.guests === 1
            ? t("guest")
            : t("guests")}
        </p>

        {/* Line 2: Listing Title */}
        <h4 className="text-base font-semibold text-foreground truncate mb-1">
          {booking.listings.title}
        </h4>

        {/* Line 3: Full Address */}
        <p className="text-sm text-muted-foreground truncate mb-1">
          {formatAddress()}
        </p>

        {/* Line 4: Property Type & Size */}
        <p className="text-xs text-muted-foreground">{formatPropertyDetails()}</p>
      </div>

      {/* Actions */}
      <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
      <Button asChild variant="outline" size="icon" aria-label="Open booking location in Google Maps" title="Open in Google Maps">
        <a href={mapUrl} target="_blank" rel="noopener noreferrer">
          <MapPin className="h-4 w-4" />
        </a>
      </Button>
      {showReviewButton ? (
        <Button
          variant={hasReview ? "outline" : "default"}
          onClick={onReviewAction}
          className="shrink-0"
        >
          {hasReview ? "View Review" : "Leave Review"}
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/listing/${booking.listings.id}`)}>
              View Property
            </DropdownMenuItem>
            {["confirmed", "pending_host_confirmation"].includes(booking.status) && onMessageHost && (
              <DropdownMenuItem onClick={() => onMessageHost(booking)}>
                Message Host
              </DropdownMenuItem>
            )}
            {onContactSupport && (
              <DropdownMenuItem onClick={() => onContactSupport(booking)}>
                Contact Support
              </DropdownMenuItem>
            )}
            {["confirmed", "pending_host_confirmation"].includes(booking.status) && onCancelBooking && (
              <DropdownMenuItem onClick={() => onCancelBooking(booking)}>
                Cancel Booking
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      </div>
    </div>
  );
};
