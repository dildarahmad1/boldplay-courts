import { bookingStatusPresentation } from "@/lib/bookingStatus";
import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Clock3, XCircle, Home, Calendar, Users, MapPin, Loader2, Mail, HelpCircle, Bed, Bath } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDemoData } from "@/hooks/useDemoData";
import { isHourlyBooking, formatPlayDate, formatSlotRange, formatDuration } from "@/lib/bookingTime";
import { formatIQD } from "@/lib/currency";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

interface Booking {
  id: string;
  checkin_date: string;
  checkout_date: string;
  nights: number;
  booking_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  hours?: number | null;
  price_per_hour?: number | null;
  guests: number;
  subtotal: number;
  cleaning_fee: number;
  service_fee: number;
  taxes: number;
  total_price: number;
  status: string;
  created_at: string;
  guest_user_id: string;
  listings: {
    title: string;
    address: string;
    city: string;
    state: string;
    country: string;
    cover_image: string;
    base_price: number;
    checkin_from: string;
    checkout_until: string;
    type: string;
    size_sqft: number;
    guests_max: number;
    court_type?: string | null;
    surface_type?: string | null;
    is_indoor?: boolean | null;
  };
}

const BookingConfirmation = () => {
  const { language } = useLanguage();
  const t = (text: string) => translateUiText(text, language);
  const { id } = useParams();
  const { user } = useAuth();
  const { getBooking } = useDemoData();
  const getBookingRef = useRef(getBooking);
  getBookingRef.current = getBooking;
  const isDemoBooking = !!id?.startsWith("demo-");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [guestEmail, setGuestEmail] = useState<string>("");
  const [guestName, setGuestName] = useState<string>("Guest");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBooking = async () => {
      if (isDemoBooking && id) {
        // Get booking from localStorage for demo mode
        const demoBooking = getBookingRef.current(id);
        if (demoBooking) {
          setBooking(demoBooking as any);
          setGuestEmail("guest@demo.com");
          setGuestName("Demo Guest");
        }
        setLoading(false);
        return;
      }

      // Regular DB fetch for non-demo users
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          *,
          listings (
            title,
            address,
            city,
            state,
            country,
            cover_image,
            base_price,
            checkin_from,
            checkout_until,
            type,
            size_sqft,
            guests_max,
            court_type,
            surface_type,
            is_indoor
          )
        `)
        .eq("id", id)
        .single();

      if (!error && data) {
        setBooking(data as any);
        
        // Fetch guest profile
        const { data: profileData } = await supabase
          .from("profiles")
          .select("email, first_name, last_name")
          .eq("id", data.guest_user_id)
          .single();
          
        if (profileData) {
          setGuestEmail(profileData.email);
          const name = `${profileData.first_name || ""} ${profileData.last_name || ""}`.trim();
          if (name) setGuestName(name);
        }
      }
      setLoading(false);
    };

    if (id) {
      fetchBooking();
    }
  }, [id, isDemoBooking, user?.id]);

  useEffect(() => {
    if (!id || !["pending_host_confirmation", "pending_payment"].includes(booking?.status || "")) return;
    let active = true;
    const refreshStatus = async () => {
      if (document.visibilityState !== "visible") return;
      const status = isDemoBooking ? getBookingRef.current(id)?.status
        : (await supabase.from("bookings").select("status").eq("id", id).maybeSingle()).data?.status;
      if (active && status) setBooking(current => current && current.status !== status ? { ...current, status } : current);
    };
    const channel = isDemoBooking ? null : supabase.channel(`booking-status:${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${id}` }, () => { void refreshStatus(); }).subscribe();
    const interval = window.setInterval(refreshStatus, 8000);
    window.addEventListener("focus", refreshStatus);
    document.addEventListener("visibilitychange", refreshStatus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshStatus);
      document.removeEventListener("visibilitychange", refreshStatus);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [id, isDemoBooking, booking?.status]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <Home className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Booking not found</h3>
            <Button asChild>
              <Link to="/search">Browse Listings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hourly = isHourlyBooking(booking);
  const pricePerUnit = booking
    ? hourly
      ? booking.subtotal / Number(booking.hours || 1)
      : booking.subtotal / booking.nights
    : 0;
  const isAwaitingHost = booking.status === "pending_host_confirmation";
  const isDeclined = booking.status === "cancelled_host";
  const presentation = bookingStatusPresentation(booking.status);
  const isConfirmed = presentation.tone === "confirmed";
  const isClosed = presentation.tone === "closed";
  const StatusIcon = isConfirmed ? CheckCircle2 : isClosed ? XCircle : Clock3;
  const statusTitle = t(presentation.title);
  const statusMessage = t(presentation.message);

  return (
    <div className="public-page min-h-screen bg-slate-50 py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className={`mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full ${isConfirmed ? "bg-success/10" : isClosed ? "bg-destructive/10" : "bg-warning/10"} shadow-sm`}>
            <StatusIcon className={`h-8 w-8 ${isConfirmed ? "text-success" : isClosed ? "text-destructive" : "text-warning"}`} />
          </div>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{statusTitle}</h1>
          <p className="text-muted-foreground mb-6">
            {translateUiText(`Thank you, ${guestName}!`, language)} {statusMessage}
          </p>
          {isConfirmed && <p className="text-muted-foreground">{t("Your approved booking details are shown below.")}</p>}
          {booking.status === "pending_payment" && <Button asChild><Link to={`/checkout?bookingId=${booking.id}`}>{t("Complete your booking request")}</Link></Button>}
        </div>

        {/* What's Next Section */}
        {(isAwaitingHost || isConfirmed) && <div className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-6">What's next?</h2>
          
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <Mail className="h-5 w-5 text-primary" />
                {t("Check your inbox")}
              </h3>
              <p className="text-muted-foreground ml-7">
                {isAwaitingHost ? t("We will send the booking details to your inbox after the host approves your request.") : isDeclined ? t("This request was declined. You can choose another time from available courts.") : t("Your approved booking details are shown below.")}
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <Calendar className="h-5 w-5 text-primary" />
                Plan Your Stay
              </h3>
              <p className="text-muted-foreground ml-7">
                {isAwaitingHost ? t("You can plan your visit after the host confirms the time.") : isDeclined ? t("Select another available time to send a new request.") : t("Review the booking time and venue details before you arrive.")}
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <HelpCircle className="h-5 w-5 text-primary" />
                Need Help?
              </h3>
              <p className="text-muted-foreground ml-7">
                Contact your host directly from your dashboard.
              </p>
            </div>
          </div>
        </div>

        }

        {/* Booking Overview Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Booking Overview</h2>
          
          {/* Property Info Card */}
          <Card className="mb-6 rounded-3xl border-slate-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex gap-4">
                <div className="h-24 w-32 rounded-lg overflow-hidden flex-shrink-0">
                  <img
                    src={booking.listings.cover_image}
                    alt={booking.listings.title}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">{booking.listings.title}</h3>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                    <MapPin className="h-3 w-3" />
                    <span>
                      {booking.listings.address}, {booking.listings.city}
                      {booking.listings.state && `, ${booking.listings.state}`}, {booking.listings.country}
                    </span>
                  </div>
                  
                  {/* Court Details */}
                  <div className="flex items-center gap-3 text-foreground flex-wrap capitalize">
                    {booking.listings.court_type && (
                      <span>{booking.listings.court_type.replace(/_/g, " ")}</span>
                    )}
                    {booking.listings.surface_type && (
                      <>
                        <span>•</span>
                        <span>{booking.listings.surface_type.replace(/_/g, " ")}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{booking.listings.is_indoor ? "Indoor" : "Outdoor"}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Three Column Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Status and Booking ID */}
            <Card className="bg-[#F8FAFF]">
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Status and Booking ID</h3>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Status</p>
                    <p className="font-semibold">Confirmed</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Booking ID</p>
                    <p className="font-mono text-sm">{booking.id.substring(0, 13).toUpperCase()}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Receipt Sent To</p>
                    <p className="text-sm break-all">{guestEmail}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Booking Overview */}
            <Card className="bg-[#F8FAFF]">
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Booking Overview</h3>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Where you'll be playing</p>
                    <p className="text-sm font-medium">
                      {booking.listings.address}, {booking.listings.city}, {booking.listings.country}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {hourly ? "Play date" : "Check-in"}
                      </p>
                      <p className="font-medium text-sm">
                        {hourly
                          ? formatPlayDate(booking)
                          : format(new Date(booking.checkin_date), "MMMM d, h:mm a")}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {hourly ? "Time" : "Check-out"}
                      </p>
                      <p className="font-medium text-sm">
                        {hourly
                          ? `${formatSlotRange(booking)} ${translateUiText(`(${formatDuration(booking)})`, language)}`
                          : format(new Date(booking.checkout_date), "MMMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      {hourly ? "Number of players" : "Number of guests"}
                    </p>
                    <p className="font-medium">{booking.guests}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Overview */}
            <Card className="bg-[#F8FAFF]">
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">{t("Payment Overview")}</h3>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>
                      {formatIQD(pricePerUnit)} x {t(hourly ? formatDuration(booking) : `${booking.nights} nights`)}
                    </span>
                    <span className="font-medium">{formatIQD(booking.subtotal)}</span>
                  </div>
                  
                  {booking.cleaning_fee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>{t("Cleaning fee")}</span>
                      <span className="font-medium">{formatIQD(booking.cleaning_fee)}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between text-sm">
                    <span>{t("Service fee")}</span>
                    <span className="font-medium">{formatIQD(booking.service_fee)}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span>{t("Subtotal")}</span>
                    <span className="font-medium">
                      {formatIQD(booking.subtotal + booking.cleaning_fee + booking.service_fee)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span>{t("Taxes")}</span>
                    <span className="font-medium">{formatIQD(booking.taxes || 0)}</span>
                  </div>
                  
                  <Separator className="my-2" />
                  
                  <div className="flex justify-between font-semibold">
                    <span>{t("Total")}</span>
                    <span>{formatIQD(booking.total_price)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payment Notice */}
          <div className="bg-accent/50 p-4 rounded-lg mt-6">
            <p className="text-sm text-center">
              💳 {t("Payment will be collected at the property during check-in")}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button asChild className="flex-1">
            <Link to="/guest/bookings">View My Bookings</Link>
          </Button>
          <Button variant="outline" asChild className="flex-1">
            <Link to="/search">Browse More Listings</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BookingConfirmation;
