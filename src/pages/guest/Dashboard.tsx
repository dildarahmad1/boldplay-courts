import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Calendar, MessageSquare, Loader2 } from "lucide-react";
import { useNavigate, useOutletContext } from "react-router-dom";
import AccountRestrictionBanner from "@/components/guest/AccountRestrictionBanner";
import DashboardActiveBookings from "@/components/guest/DashboardActiveBookings";
import DashboardInbox from "@/components/guest/DashboardInbox";
import DashboardPaymentsSummary from "@/components/guest/DashboardPaymentsSummary";
import DashboardPastBookings from "@/components/guest/DashboardPastBookings";
import { CancelBookingDialog } from "@/components/guest/CancelBookingDialog";
import { CreateDisputeDialog } from "@/components/dispute/CreateDisputeDialog";
import { TextLinkButton } from "@/components/ui/text-link-button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useDemoData } from "@/hooks/useDemoData";
import { parseISO, startOfDay, differenceInCalendarDays } from "date-fns";
import { formatIQD } from "@/lib/currency";

import { bookingHasEnded } from "@/lib/bookingTime";

import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

const Dashboard = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { unreadMessageCount } = useOutletContext<{ unreadMessageCount: number }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isDemoMode, migrationComplete, updateBooking, addTransaction, getBookings, getOrCreateThread, storeProfile, getDisputeForBooking, createDisputeWithSupportThread } = useDemoData();
  const demoBookingsRef = useRef(getBookings);
  demoBookingsRef.current = getBookings;
  
  const [stats, setStats] = useState({
    upcomingBookings: 0,
    totalBookings: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  
  // Dialog states
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState<any>(null);
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [bookingForDispute, setBookingForDispute] = useState<any>(null);

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      if (!user) { setLoading(false); return; }
      
      // Guard: Don't run in demo mode until migration completes
      if (isDemoMode && !migrationComplete) {
        return;
      }

      try {
        if (isDemoMode) {
          // Demo mode: use localStorage
          const allBookings = demoBookingsRef.current();
          const now = new Date();
          const upcoming = allBookings.filter(
            b => !bookingHasEnded(b, now)
          ).length;

          if (!active) return;
          setStatsError(false);
          setStats({
            upcomingBookings: upcoming,
            totalBookings: allBookings.length,
          });
        } else {
          // Real mode: database query
          const { data: bookings, error: bookingsError } = await supabase
            .from("bookings")
            .select("id, status, checkin_date, checkout_date, booking_date, start_time, end_time")
            .eq("guest_user_id", user.id);

          if (bookingsError) throw bookingsError;
          if (bookings && active) {
            setStatsError(false);
            const now = new Date();
            const upcoming = bookings.filter(
              b => !bookingHasEnded(b, now)
            ).length;

            setStats({
              upcomingBookings: upcoming,
              totalBookings: bookings.length,
            });
          }
        }
      } catch (error) {
        if (active) setStatsError(true);
        console.error("Error fetching dashboard stats:", error);
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchStats();
    const refresh = () => { if (document.visibilityState === "visible") void fetchStats(); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [user, isDemoMode, migrationComplete]);

  // Action handlers
  const handleCancelBooking = (booking: any) => {
    setBookingToCancel(booking);
    setCancelDialogOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!bookingToCancel || !user) return;

    try {
      // Demo mode handling - process locally
      if (isDemoMode) {
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
        
        // Show success toast
        toast({
          title: "Booking Cancelled",
          description: refundAmount > 0 
            ? `Your booking has been cancelled. A ${refundPercentage}% refund of ${formatIQD(refundAmount)} will be processed (${daysUntilCheckin} days before check-in).`
            : "Your booking has been cancelled. No refund is available based on the cancellation policy.",
        });
        
        setCancelDialogOpen(false);
        setBookingToCancel(null);
        
        // Refresh active bookings
        queryClient.invalidateQueries({ queryKey: ["demo-dashboard-active-bookings"] });
        return; // Exit early for demo mode
      }

      // Real mode
      const { data, error } = await supabase.rpc("cancel_booking_with_refund", {
        p_booking_id: bookingToCancel.id,
      });

      if (error) throw error;

      const result = data as { success?: boolean };
      if (!result?.success) throw new Error("Failed to cancel booking");
      toast({ title: "Booking Cancelled", description: "Your booking has been cancelled. Contact support if you already paid at the venue." });

      setCancelDialogOpen(false);
      setBookingToCancel(null);

      // Refresh active bookings
      queryClient.invalidateQueries({ queryKey: ["dashboard-active-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-past-bookings"] });
    } catch (error) {
      console.error("Error cancelling booking:", error);
      toast({
        title: "Error",
        description: "Failed to cancel booking. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleMessageHost = async (booking: any) => {
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
        
        navigate('/guest/inbox', { 
          state: { threadId: threadId }
        });
        return;
      }
      
      // Real mode: RPC call
      const { data, error } = await supabase.rpc("get_or_create_thread", {
        p_participant_1_id: user.id,
        p_participant_2_id: booking.listings.host_user_id,
        p_booking_id: booking.id,
        p_listing_id: booking.listings.id,
      });

      if (error) throw error;

      navigate("/guest/inbox", {
        state: { threadId: data },
      });
    } catch (error) {
      console.error("Error creating thread:", error);
      toast({
        title: "Error",
        description: "Failed to open conversation. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleContactSupport = async (booking: any) => {
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!currentUser) return;

      // Demo mode: use localStorage
      if (isDemoMode) {
        const existingDispute = getDisputeForBooking(booking.id);
        
        if (existingDispute?.support_thread_id) {
          navigate("/guest/inbox", {
            state: { threadId: existingDispute.support_thread_id },
          });
        } else {
          setBookingForDispute(booking);
          setDisputeDialogOpen(true);
        }
        return;
      }

      // Real mode: check database
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

  // Show loading state if demo mode migration is not complete
  if (isDemoMode && !migrationComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Loading Demo Data...</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">
              Setting up your demo experience...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 lg:px-8">
      {/* Account Restriction Banner */}
      <AccountRestrictionBanner />
      {statsError && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{translateUiText("Could not load your dashboard. Please refresh the page.", language)}</p>}
      
      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/guest/bookings")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium">Upcoming Bookings</h3>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{stats.upcomingBookings}</div>
            <p className="text-xs text-muted-foreground">Active reservations</p>
          </div>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/guest/bookings")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium">Total Bookings</h3>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{stats.totalBookings}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </div>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/guest/inbox")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium">Messages</h3>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{unreadMessageCount}</div>
            <p className="text-xs text-muted-foreground">Unread</p>
          </div>
        </Card>
      </div>

      {/* New two-column dashboard layout */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Left column: Active Bookings (2/3 width) */}
        <div className="md:col-span-2">
          <DashboardActiveBookings
            userId={user.id}
            onCancelBooking={handleCancelBooking}
            onMessageHost={handleMessageHost}
            onContactSupport={handleContactSupport}
          />
        </div>

        {/* Right column: Inbox Preview (1/3 width) */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">Messages</CardTitle>
                <TextLinkButton href="/guest/inbox">View All</TextLinkButton>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <DashboardInbox userId={user.id} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Second Row: Payments & Past Bookings (50/50 split) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-1">
          <DashboardPaymentsSummary userId={user.id} />
        </div>
        <div className="lg:col-span-2">
          <DashboardPastBookings userId={user.id} />
        </div>
      </div>

      {/* Dialogs */}
      <CancelBookingDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        booking={bookingToCancel}
        onConfirm={handleConfirmCancel}
      />

      <CreateDisputeDialog
        open={disputeDialogOpen}
        onOpenChange={setDisputeDialogOpen}
        bookingId={bookingForDispute?.id || ""}
        listingTitle={bookingForDispute?.listings?.title || ""}
      />
    </div>
  );
};

export default Dashboard;
