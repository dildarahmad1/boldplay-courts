import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { AuthProvider } from "./hooks/useAuth";
import { DemoProvider } from "./contexts/DemoContext";
import { SuspendedUserListener } from "./components/SuspendedUserListener";
import ScrollToTop from "./components/ScrollToTop";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Search from "./pages/Search";
import ForgotPassword from "./pages/ForgotPassword";
import ChangePassword from "./pages/ChangePassword";
import BecomeHost from "./pages/BecomeHost";
import FAQ from "./pages/FAQ";
import HelpCenter from "./pages/HelpCenter";
import Support from "./pages/Support";
import HostDashboard from "./pages/host/Dashboard";
import CreateListing from "./pages/host/CreateListing";
import EditListing from "./pages/host/EditListing";
import ListingsManagement from "./pages/host/ListingsManagement";
import HostBookings from "./pages/host/Bookings";
import HostAvailability from "./pages/host/Availability";
import HostPayouts from "./pages/host/Payouts";
import EarningsReport from "./pages/host/EarningsReport";
import ListingDetail from "./pages/ListingDetail";
import BookingConfirmation from "./pages/BookingConfirmation";
import Checkout from "./pages/Checkout";
import AdminLayout from "./layouts/AdminLayout";
import HostLayout from "./layouts/HostLayout";
import GuestLayout from "./layouts/GuestLayout";
import Overview from "./pages/admin/Overview";
import GuestDashboard from "./pages/guest/Dashboard";
import GuestBookings from "./pages/guest/Bookings";
import GuestPayments from "./pages/guest/Payments";
import GuestInbox from "./pages/guest/Inbox";
import HostInbox from "./pages/host/Inbox";
import GuestProfile from "./pages/guest/Profile";
import GuestSettings from "./pages/guest/Settings";
import AdminListingsManagement from "./pages/admin/ListingsManagement";
import ReviewListing from "./pages/admin/ReviewListing";
import UsersManagement from "./pages/admin/UsersManagement";
import Transactions from "./pages/admin/Transactions";
import Commissions from "./pages/admin/Commissions";
import Reports from "./pages/admin/Reports";
import AdminBookingsManagement from "./pages/admin/BookingsManagement";
import AdminDisputesManagement from "./pages/admin/DisputesManagement";
import AdminSupport from "./pages/admin/Support";
import ContentManagementPage from "./pages/admin/ContentManagement";
import NotFound from "./pages/NotFound";
import EmailVerified from "./pages/EmailVerified";
import { LanguageProvider } from "./contexts/LanguageContext";
import AutoTranslator from "./components/AutoTranslator";
import PageTransition from "./components/PageTransition";

const queryClient = new QueryClient();

// Versioned public-only key deliberately ignores older values that may point to
// protected dashboards and trap returning visitors on a blank redirect screen.
const LAST_PAGE_KEY = "yarika:last-public-page:v2";
const NO_RESTORE = [/^\/checkout/, /^\/booking-confirmation/, /^\/forgot-password/];
const RESTORABLE_PUBLIC_PAGE = /^\/(?:search|listing\/[^/]+|faq|help-center|support|become-host)(?:[/?#]|$)/;

function LastPageMemory() {
  const location = useLocation();
  const navigate = useNavigate();
  const handledInitialLocation = useRef(false);

  useEffect(() => {
    const current = `${location.pathname}${location.search}${location.hash}`;
    const saved = localStorage.getItem(LAST_PAGE_KEY);

    // Restore only once when the app first opens. Previously this ran on every
    // navigation, so clicking Home from /search immediately sent the visitor
    // back to /search and made the site feel stuck on one page.
    if (!handledInitialLocation.current) {
      handledInitialLocation.current = true;
      if (current === "/" && saved && RESTORABLE_PUBLIC_PAGE.test(saved) && !NO_RESTORE.some(pattern => pattern.test(saved))) {
        navigate(saved, { replace: true });
      }
      return;
    }

    if (current === "/") {
      localStorage.removeItem(LAST_PAGE_KEY);
      return;
    }

    if (RESTORABLE_PUBLIC_PAGE.test(current) && !NO_RESTORE.some(pattern => pattern.test(location.pathname))) {
      localStorage.setItem(LAST_PAGE_KEY, current);
    }
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <LanguageProvider>
        <AutoTranslator />
        <LastPageMemory />
        <AuthProvider>
          <DemoProvider>
            <SuspendedUserListener />
            <ScrollToTop />
            <PageTransition>
            <Routes>
            <Route path="/" element={<><Navbar /><Home /></>} />
            <Route path="/search" element={<Search />} />
            <Route path="/faq" element={<><Navbar /><FAQ /></>} />
            <Route path="/help-center" element={<><Navbar /><HelpCenter /></>} />
            <Route path="/support" element={<><Navbar /><Support /></>} />
            <Route path="/forgot-password" element={<><Navbar /><ForgotPassword /></>} />
            <Route path="/change-password" element={<><Navbar /><ChangePassword /></>} />
            <Route path="/email-verified" element={<><Navbar /><EmailVerified /></>} />
            <Route path="/become-host" element={<><Navbar /><BecomeHost /></>} />
            <Route path="/host" element={<HostLayout />}>
              <Route path="dashboard" element={<HostDashboard />} />
              <Route path="listings" element={<ListingsManagement />} />
              <Route path="bookings" element={<HostBookings />} />
              <Route path="availability" element={<HostAvailability />} />
              <Route path="payouts" element={<HostPayouts />} />
              <Route path="earnings-report" element={<EarningsReport />} />
              <Route path="inbox" element={<HostInbox />} />
              <Route path="create-listing" element={<CreateListing />} />
              <Route path="edit-listing/:id" element={<EditListing />} />
            </Route>
            <Route path="/listing/:id" element={<><Navbar /><ListingDetail /></>} />
            <Route path="/checkout" element={<><Navbar /><Checkout /></>} />
            <Route path="/booking-confirmation/:id" element={<><Navbar /><BookingConfirmation /></>} />
            <Route path="/guest" element={<GuestLayout />}>
              <Route path="dashboard" element={<GuestDashboard />} />
              <Route path="bookings" element={<GuestBookings />} />
              <Route path="payments" element={<GuestPayments />} />
              <Route path="inbox" element={<GuestInbox />} />
              <Route path="profile" element={<GuestProfile />} />
              <Route path="settings" element={<GuestSettings />} />
            </Route>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<Overview />} />
              <Route path="listings" element={<AdminListingsManagement />} />
              <Route path="bookings" element={<AdminBookingsManagement />} />
              <Route path="disputes" element={<AdminDisputesManagement />} />
              <Route path="review-listing/:id" element={<ReviewListing />} />
              <Route path="users" element={<UsersManagement />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="commissions" element={<Commissions />} />
              <Route path="reports" element={<Reports />} />
              <Route path="support" element={<AdminSupport />} />
              <Route path="content" element={<ContentManagementPage />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<><Navbar /><NotFound /></>} />
            </Routes>
            </PageTransition>
          </DemoProvider>
        </AuthProvider>
        </LanguageProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
