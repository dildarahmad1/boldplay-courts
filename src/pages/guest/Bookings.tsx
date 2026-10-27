import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { parseISO, startOfDay, differenceInCalendarDays } from "date-fns";
import { Loader2, Home, Search, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import GuestBookingCard from "@/components/guest/GuestBookingCard";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ReviewDialog } from "@/components/guest/ReviewDialog";
import { CancelBookingDialog } from "@/components/guest/CancelBookingDialog";
import { CreateDisputeDialog } from "@/components/dispute/CreateDisputeDialog";
import AccountRestrictionBanner from "@/components/guest/AccountRestrictionBanner";
import { useDemoData } from "@/hooks/useDemoData";
import { formatIQD } from "@/lib/currency";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { bookingHasEnded } from "@/lib/bookingTime";

interface CancellationPolicySnapshot {
  policy_key: string;
  name: string;
  description: string;
  refund_percentage: number;
  days_before_checkin: number;
}

interface Booking {
  booking_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  hours?: number | null;
  id: string;
  checkin_date: string;
  checkout_date: string;
  nights: number;
  guests: number;
  total_price: number;
  status: string;
  created_at: string;
  cancellation_policy_snapshot?: CancellationPolicySnapshot;
  listings: {
    id: string;
    title: string;
    city: string;
    country: string;
    address?: string | null;
    cover_image: string;
    host_user_id: string;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
}

const Bookings = () => {
  const { language, direction } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDemoMode, getBookings, updateBooking, addTransaction, getOrCreateThread, storeProfile, getDisputeForBooking, createDisputeWithSupportThread, getReviews } = useDemoData();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [bookingReviews, setBookingReviews] = useState<Record<string, any>>({});
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [bookingForDispute, setBookingForDispute] = useState<Booking | null>(null);

  const fetchBookings = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    if (isDemoMode) {
      // Get bookings from localStorage for demo mode
      const demoBookings = getBookings();
      setBookings(demoBookings as any[]);
      
      // Fetch reviews for demo bookings
      const bookingIds = demoBookings.map((b: any) => b.id);
      const demoReviews = getReviews(bookingIds);
      const reviewsMap: Record<string, any> = {};
      demoReviews.forEach((review: any) => {
        reviewsMap[review.booking_id] = review;
      });
      setBookingReviews(reviewsMap);
      
      setLoading(false);
      return;
    }

    setRefreshing(true);
    setLoadError(false);
    try {
    // Regular DB fetch for non-demo users
    const { data, error } = await supabase
      .from("bookings")
      .select(`
        *,
        listings (
          id,
          title,
          city,
          country,
          address,
          cover_image,
          host_user_id,
          latitude,
          longitude
        )
      `)
      .eq("guest_user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (data) {
      // Filter out bookings with null listings
      const validBookings = (data as any[]).filter(b => b.listings !== null);
      setBookings(validBookings);

      // Fetch reviews for all bookings
      const bookingIds = data.map((b) => b.id);
      const { data: reviewsData } = await supabase
        .from("reviews")
        .select("*")
        .in("booking_id", bookingIds)
        .eq("author_user_id", user.id);

      if (reviewsData) {
        const reviewsMap: Record<string, any> = {};
        reviewsData.forEach((review) => {
          reviewsMap[review.booking_id] = review;
        });
        setBookingReviews(reviewsMap);
      }
    }
    } catch { setLoadError(true); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    fetchBookings();
  }, [user, isDemoMode]);

  useEffect(() => {
    if (!user || isDemoMode) return;
    const refresh = () => { if (document.visibilityState === "visible") void fetchBookings(); };
    const channel = supabase.channel(`guest-bookings:${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `guest_user_id=eq.${user.id}` }, refresh).subscribe();
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); void supabase.removeChannel(channel); };
  }, [user?.id, isDemoMode]);

  const handleReview = (booking: Booking) => {
    setSelectedBooking(booking);
    setReviewDialogOpen(true);
  };

  const handleReviewSubmitted = () => {
    // Refresh reviews based on mode
    if (isDemoMode) {
      // Demo mode: reload from localStorage
      const bookingIds = bookings.map((b) => b.id);
      const demoReviews = getReviews(bookingIds);
      const reviewsMap: Record<string, any> = {};
      demoReviews.forEach((review: any) => {
        reviewsMap[review.booking_id] = review;
      });
      setBookingReviews(reviewsMap);
    } else {
      // Real mode: reload from Supabase
      if (user) {
        supabase
          .from("reviews")
          .select("*")
          .in("booking_id", bookings.map((b) => b.id))
          .eq("author_user_id", user.id)
          .then(({ data }) => {
            if (data) {
              const reviewsMap: Record<string, any> = {};
              data.forEach((review) => {
                reviewsMap[review.booking_id] = review;
              });
              setBookingReviews(reviewsMap);
            }
          });
      }
    }
  };

  const handleMessageHost = async (booking: Booking) => {
    if (!user?.id || !booking.listings) return;
    
    try {
      // Demo mode: use localStorage
      if (isDemoMode) {
        // Fetch host profile first
        const { data: hostProfile } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, avatar_url')
          .eq('id', booking.listings.host_user_id)
          .single();
        
        // Store the profile in demo storage
        storeProfile(booking.listings.host_user_id, hostProfile || {
          id: booking.listings.host_user_id,
          first_name: 'Host',
          last_name: `#${booking.listings.host_user_id.substring(0, 8)}`,
          email: null,
          avatar_url: null
        });
        
        // Now create the thread
        const threadId = getOrCreateThread(
          booking.listings.host_user_id,
          booking.id,
          booking.listings.id
        );
        
        if (!threadId) {
          throw new Error('Failed to create thread');
        }
        
        // Navigate to inbox with thread pre-selected
        navigate('/guest/inbox', { 
          state: { threadId: threadId }
        });
        return;
      }
      
      // Real mode: Call RPC to get or create thread with booking context
      const { data, error } = await supabase.rpc('get_or_create_thread', {
        p_participant_1_id: user.id,
        p_participant_2_id: booking.listings.host_user_id,
        p_booking_id: booking.id,
        p_listing_id: booking.listings.id
      });
      
      if (error) throw error;
      
      const threadId = data;
      
      // Navigate to inbox with thread pre-selected
      navigate('/guest/inbox', { 
        state: { threadId: threadId }
      });
      
    } catch (error) {
      console.error('Error creating thread:', error);
      toast({
        title: "Error",
        description: "Failed to open conversation. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleContactSupport = async (booking: Booking) => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;

      // Demo mode: use localStorage
      if (isDemoMode) {
        const existingDispute = getDisputeForBooking(booking.id);
        
        if (existingDispute?.support_thread_id) {
          // Navigate to existing support chat
          navigate("/guest/inbox", {
            state: { threadId: existingDispute.support_thread_id },
          });
        } else {
          // Open dispute creation dialog
          setBookingForDispute(booking);
          setDisputeDialogOpen(true);
        }
        return;
      }

      // Real mode: check database for existing dispute
      const { data: existingDispute } = await supabase
        .from("disputes")
        .select("id, support_thread_id")
        .eq("booking_id", booking.id)
        .eq("initiated_by_user_id", currentUser.id)
        .in("status", ["open", "in_progress", "escalated"])
        .maybeSingle();

      if (existingDispute?.support_thread_id) {
        navigate("/guest/inbox", {
          state: { threadId: existingDispute.support_thread_id },
        });
      } else {
        setBookingForDispute(booking);
        setDisputeDialogOpen(true);
      }
    } catch (error) {
      console.error("Error checking for disputes:", error);
      toast({
        title: "Error",
        description: "Failed to contact support. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getFilteredBookings = (bookingsList: Booking[]) => {
    if (!searchQuery.trim()) return bookingsList;

    const query = searchQuery.toLowerCase();
    return bookingsList.filter(
      (booking) =>
        booking.listings &&
        (booking.listings.title.toLowerCase().includes(query) ||
        booking.listings.city.toLowerCase().includes(query) ||
        booking.listings.country.toLowerCase().includes(query) ||
        booking.id.toLowerCase().includes(query))
    );
  };

  const activeBookings = bookings.filter(booking => booking.listings && !bookingHasEnded(booking));
  const pastBookings = bookings.filter(booking => booking.listings && bookingHasEnded(booking));

  const filteredActiveBookings = getFilteredBookings(activeBookings);
  const filteredPastBookings = getFilteredBookings(pastBookings);


  const handleCancelBooking = (booking: Booking) => {
    setBookingToCancel(booking);
    setCancelDialogOpen(true);
  };

  const handleCancelConfirm = async () => {
    if (!bookingToCancel || !user) return;

    try {
      // Demo mode handling - process locally
      if (isDemoMode) {
        if (bookingToCancel.status === "pending_host_confirmation") {
          updateBooking(bookingToCancel.id, { status: "cancelled_guest", updated_at: new Date().toISOString() });
          setCancelDialogOpen(false);
          void fetchBookings();
          return;
        }

        // Calculate cancellation details locally
        const checkinDate = parseISO(bookingToCancel.checkin_date);
        const today = startOfDay(new Date());
        const daysUntilCheckin = differenceInCalendarDays(checkinDate, today);
        
        const policy = bookingToCancel.cancellation_policy_snapshot;
        if (!policy) throw new Error('No cancellation policy found');
        
        // Calculate refund
        const isRefundEligible = daysUntilCheckin >= policy.days_before_checkin;
        const refundPercentage = isRefundEligible ? policy.refund_percentage : 0;
        const refundAmount = (bookingToCancel.total_price * refundPercentage) / 100;
        
        // Update booking status in localStorage
        updateBooking(bookingToCancel.id, {
          status: 'cancelled_guest',
          updated_at: new Date().toISOString()
        });
        
        // Create refund transaction if applicable
        if (refundAmount > 0) {
          addTransaction({
            id: crypto.randomUUID(),
            booking_id: bookingToCancel.id,
            type: 'refund',
            amount: refundAmount,
            currency: 'IQD',
            status: 'succeeded',
            provider: 'stripe',
            created_at: new Date().toISOString(),
            dispute_id: null,
            bookings: {
              id: bookingToCancel.id,
              checkin_date: bookingToCancel.checkin_date,
              checkout_date: bookingToCancel.checkout_date,
              nights: bookingToCancel.nights,
              guests: bookingToCancel.guests,
              guest_user_id: user.id,
              listings: bookingToCancel.listings
            },
            disputes: null
          });
        }
        
        // Update UI optimistically
        setBookings(prev => prev.map(b => 
          b.id === bookingToCancel.id 
            ? { ...b, status: 'cancelled_guest', updated_at: new Date().toISOString() }
            : b
        ));
        
        // Show success toast
        toast({
          title: "Booking Cancelled",
          description: refundAmount > 0 
            ? `Your booking has been cancelled. A ${refundPercentage}% refund of ${formatIQD(refundAmount)} will be processed (${daysUntilCheckin} days before check-in).`
            : "Your booking has been cancelled. No refund is available based on the cancellation policy.",
        });
        
        setCancelDialogOpen(false);
        return; // Exit early for demo mode
      }

      // Real mode - Call RPC function to cancel booking with refund calculation
      const { data: result, error: rpcError } = await supabase
        .rpc('cancel_booking_with_refund', {
          p_booking_id: bookingToCancel.id,
          p_cancellation_reason: null
        });

      if (rpcError) throw rpcError;

      const cancellationResult = result as { success?: boolean; booking_id?: string };
      if (!cancellationResult?.success || cancellationResult.booking_id !== bookingToCancel.id) {
        throw new Error('Failed to cancel booking');
      }
      setBookings(prev => prev.map(b => b.id === bookingToCancel.id ? { ...b, status: 'cancelled_guest' } : b));
      toast({ title: translateUiText("Booking Cancelled", language), description: translateUiText("Your booking has been cancelled. Contact support if you already paid at the venue.", language) });

      setCancelDialogOpen(false);
      
      void fetchBookings();
    } catch (error: any) {
      console.error('Cancellation error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to cancel booking",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const EmptyState = ({ isActive }: { isActive: boolean }) => (
    <Card>
      <CardContent className="px-5 py-10 text-center sm:p-12">
        <Home className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">
          {isActive ? "No active bookings" : "No past bookings"}
        </h3>
        <p className="text-muted-foreground mb-4">
          {isActive
            ? "Find a court and send your first booking request."
            : "Your completed and cancelled bookings will appear here"}
        </p>
        {isActive && (
          <Button asChild>
            <Link to="/search">Browse Listings</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto min-w-0 px-4 pb-8 lg:px-8" dir={direction}>
      {/* Account Restriction Banner */}
      <AccountRestrictionBanner />
      
      <div className="mb-5 flex items-start justify-between gap-3">
        <p className="max-w-xl text-sm leading-6 text-slate-500">{translateUiText("Track your court requests, host approvals and booking times here.", language)}</p>
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl" disabled={refreshing} aria-label={translateUiText("Refresh bookings", language)} onClick={() => void fetchBookings()}><RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></Button>
      </div>
      {loadError && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{translateUiText("Could not load your bookings. Please refresh and try again.", language)}</div>}
      <Tabs value={searchParams.get("filter") === "past" ? "past" : "active"} onValueChange={value => setSearchParams(previous => { const next = new URLSearchParams(previous); next.set("filter", value); return next; }, { replace: true })} className="w-full">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search Bar */}
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute start-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={translateUiText("Search bookings...", language)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 rounded-xl bg-white ps-11"
            />
          </div>

          {/* Tabs Toggle */}
          <TabsList className="grid h-12 w-full grid-cols-2 rounded-xl bg-slate-200/70 p-1 sm:w-64">
            <TabsTrigger value="active" className="h-10 rounded-lg">
              {translateUiText(`Active (${activeBookings.length})`, language)}
            </TabsTrigger>
            <TabsTrigger value="past" className="h-10 rounded-lg">
              {translateUiText(`Past (${pastBookings.length})`, language)}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="active" className="space-y-4 mt-0">
            {filteredActiveBookings.length === 0 ? (
              searchQuery ? (
                <Card>
                  <CardContent className="px-5 py-10 text-center sm:p-12">
                    <p className="text-muted-foreground">
                      {translateUiText(`No bookings found matching "${searchQuery}"`, language)}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <EmptyState isActive={true} />
              )
            ) : (
              filteredActiveBookings.map((booking) => (
                <GuestBookingCard key={booking.id} booking={booking}
                  onMessage={() => handleMessageHost(booking)} onSupport={() => handleContactSupport(booking)}
                  onCancel={() => handleCancelBooking(booking)} onReview={() => handleReview(booking)} />
              ))
            )}
          </TabsContent>

        <TabsContent value="past" className="space-y-4 mt-0">
          {filteredPastBookings.length === 0 ? (
            searchQuery ? (
              <Card>
                <CardContent className="px-5 py-10 text-center sm:p-12">
                  <p className="text-muted-foreground">
                      {translateUiText(`No bookings found matching "${searchQuery}"`, language)}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <EmptyState isActive={false} />
            )
          ) : (
            filteredPastBookings.map((booking) => (
              <GuestBookingCard key={booking.id} booking={booking} past hasReview={Boolean(bookingReviews[booking.id])}
                onMessage={() => handleMessageHost(booking)} onSupport={() => handleContactSupport(booking)}
                onCancel={() => handleCancelBooking(booking)} onReview={() => handleReview(booking)} />
            ))
          )}
        </TabsContent>
      </Tabs>

      <ReviewDialog
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        bookingId={selectedBooking?.id || ""}
        listingTitle={selectedBooking?.listings?.title || ""}
        existingReview={selectedBooking ? bookingReviews[selectedBooking.id] || null : null}
        onReviewSubmitted={handleReviewSubmitted}
      />

      <CancelBookingDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        booking={bookingToCancel}
        onConfirm={handleCancelConfirm}
      />

      {bookingForDispute && (
        <CreateDisputeDialog
          open={disputeDialogOpen}
          onOpenChange={(open) => {
            setDisputeDialogOpen(open);
            if (!open) {
              fetchBookings();
            }
          }}
          bookingId={bookingForDispute.id}
          listingTitle={bookingForDispute.listings!.title}
        />
      )}
    </div>
  );
};

export default Bookings;
