import { useEffect } from "react";
import { Navigate, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { HostSidebar } from "@/components/host/HostSidebar";
import { HostPageHeader } from "@/components/host/HostPageHeader";
import { Loader2, Home } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";

// Map routes to page titles
const getPageTitle = (pathname: string): string => {
  if (pathname === "/host/dashboard") return "Dashboard";
  if (pathname === "/host/listings") return "Listings & Availability";
  if (pathname === "/host/bookings") return "Bookings";
  if (pathname === "/host/availability") return "Availability Calendar";
  if (pathname === "/host/payouts") return "Payouts";
  if (pathname === "/host/earnings-report") return "Earnings Report";
  if (pathname === "/host/inbox") return "Messages";
  if (pathname.startsWith("/host/edit-listing/")) return "Edit Listing";
  if (pathname === "/host/create-listing") return "Create Listing";
  return "Dashboard";
};

// Check if current route should hide the header (create/edit pages)
const shouldHideHeader = (pathname: string): boolean => {
  return pathname === "/host/create-listing" || pathname.startsWith("/host/edit-listing/");
};

const HostLayout = () => {
  const { user } = useAuth();
  const unreadMessages = useUnreadMessages(user?.id);
  const navigate = useNavigate();
  const location = useLocation();
  const { isHost, isAdmin, loading: roleLoading } = useUserRole();
  
  const pathname = location.pathname.replace(/\/+$/, "");
  const pageTitle = getPageTitle(pathname);
  const hideHeader = shouldHideHeader(pathname);

  useEffect(() => {
    if (!roleLoading) {
      if (!user) {
        navigate("/");
      } else if (isAdmin) {
        navigate("/admin/dashboard", { replace: true });
      }
    }
  }, [user, isHost, isAdmin, roleLoading, navigate]);

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }
  if (isAdmin) return <Navigate to="/admin/dashboard" replace />;

  if (!isHost) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="p-6 space-y-4">
            <div className="text-center">
              <Home className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Host account required</h2>
              <p className="text-muted-foreground mb-6">
                Sign in with the host credentials created for you by an administrator.
              </p>
            </div>
            <Button onClick={() => navigate("/")} className="w-full" size="lg">
              <Home className="h-4 w-4 mr-2" />
              Return to home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="app-shell flex h-dvh w-full max-w-full overflow-hidden bg-[#f6f8f7]">
      <HostSidebar logoText="Yarika" compact unreadMessageCount={unreadMessages} />
      <main className="app-content h-dvh min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        {!hideHeader && (
          <div className="container mx-auto max-w-full px-4 pt-6 lg:px-8">
            <HostPageHeader 
              title={pageTitle}
              unreadMessageCount={unreadMessages}
            />
          </div>
        )}
        <div className="min-w-0 max-w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default HostLayout;
