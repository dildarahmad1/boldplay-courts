import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, Eye, MoreVertical, X } from "lucide-react";
import { format } from "date-fns";
import { formatBookingWhen } from "@/lib/bookingTime";
import { formatIQD } from "@/lib/currency";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import type { HostBookingDetails } from "./HostBookingDetailsDialog";

type Booking = HostBookingDetails;

interface BookingsTableProps {
  bookings: Booking[];
  loading: boolean;
  onAcceptBooking: (booking: Booking) => void;
  onRejectBooking: (booking: Booking) => void;
  onResendConfirmation: (booking: Booking) => void;
  onViewDetails: (booking: Booking) => void;
  onCancelBooking: (booking: Booking) => void;
  onContactSupport: (booking: Booking) => void;
  onContactGuest: (booking: Booking) => void;
}


const formatBookingDates = (checkin: string, checkout: string) => {
  const checkinDate = new Date(checkin);
  const checkoutDate = new Date(checkout);
  return `${format(checkinDate, "MMM d")} - ${format(checkoutDate, "MMM d, yyyy")}`;
};

const formatPrice = (price: number) => formatIQD(price);

const getInitials = (name: string | null) => {
  if (!name) return "?";
  const parts = name.split(" ");
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

export const BookingsTable = ({ bookings, loading, onAcceptBooking, onRejectBooking, onResendConfirmation, onViewDetails, onCancelBooking, onContactSupport, onContactGuest }: BookingsTableProps) => {
  const { language } = useLanguage();
  const t = (text: string) => translateUiText(text, language);
  if (loading) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
          <TableHeader>
            <TableRow className="bg-background hover:bg-background">
              <TableHead className="font-semibold">Booking ID</TableHead>
              <TableHead className="font-semibold">Listing Name</TableHead>
              <TableHead className="font-semibold">Guest Name</TableHead>
              <TableHead className="font-semibold">When</TableHead>
              <TableHead className="font-semibold">Amount</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i} className={i % 2 === 0 ? "bg-[#F8FAFF]" : ""}>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-muted-foreground text-lg">No bookings found</p>
        <p className="text-muted-foreground text-sm mt-2">
          Try adjusting your filters or search criteria
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-background hover:bg-background">
            <TableHead className="font-semibold">Booking ID</TableHead>
            <TableHead className="font-semibold">Listing Name</TableHead>
            <TableHead className="font-semibold">Guest Name</TableHead>
            <TableHead className="font-semibold">When</TableHead>
            <TableHead className="font-semibold">Amount</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="font-semibold text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((booking, index) => (
            <TableRow
              key={booking.id}
              className={index % 2 === 0 ? "bg-[#F8FAFF] hover:bg-muted/50" : "hover:bg-muted/50"}
            >
              <TableCell className="font-mono text-sm">
                BKG-{booking.id.slice(0, 8).toUpperCase()}
              </TableCell>
              <TableCell className="font-medium">
                {booking.listing_title}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={booking.guest_avatar || ""} alt={booking.guest_name || "Guest"} />
                    <AvatarFallback>{getInitials(booking.guest_name)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{booking.guest_name || "Unknown Guest"}</span>
                </div>
              </TableCell>
              <TableCell>
                {formatBookingWhen(booking)}
              </TableCell>
              <TableCell className="font-semibold">
                {formatPrice(booking.host_payout_gross)}
              </TableCell>
              <TableCell>
                <StatusBadge status={booking.status} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {booking.status === "pending_host_confirmation" && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5 bg-emerald-700 text-white hover:bg-emerald-800"
                        aria-label={`Approve booking ${booking.id.slice(0, 8)}`}
                        onClick={() => onAcceptBooking(booking)}
                      >
                        <Check className="h-4 w-4" />
                        <span>{t("Approve")}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                        aria-label={`Reject booking ${booking.id.slice(0, 8)}`}
                        onClick={() => onRejectBooking(booking)}
                      >
                        <X className="h-4 w-4" />
                        <span>{t("Reject")}</span>
                      </Button>
                    </>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    aria-label={`View booking ${booking.id.slice(0, 8)} details`}
                    onClick={() => onViewDetails(booking)}
                  >
                    <Eye className="h-4 w-4" />
                    <span>View details</span>
                  </Button>
                  <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {booking.status === 'pending_host_confirmation' && (
                      <DropdownMenuItem onClick={() => onAcceptBooking(booking)}>
                        {t("Approve Booking")}
                      </DropdownMenuItem>
                    )}
                    {booking.status === 'pending_host_confirmation' && (
                      <DropdownMenuItem onClick={() => onRejectBooking(booking)} className="text-destructive focus:text-destructive">
                        {t("Reject Booking")}
                      </DropdownMenuItem>
                    )}
                    {booking.status === 'confirmed' && (
                      <DropdownMenuItem onClick={() => onResendConfirmation(booking)}>
                        Resend Confirmation Email
                      </DropdownMenuItem>
                    )}
                    {booking.status === 'confirmed' && (
                      <DropdownMenuItem 
                        onClick={() => onCancelBooking(booking)}
                        className="text-destructive focus:text-destructive"
                      >
                        Cancel Booking
                      </DropdownMenuItem>
                    )}
                      <DropdownMenuItem onClick={() => onViewDetails(booking)}>View Details</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onContactGuest(booking)}>
                        Contact Guest
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onContactSupport(booking)}>
                        Contact Support
                      </DropdownMenuItem>
                  </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
