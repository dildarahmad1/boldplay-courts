import { useEffect } from "react";
import { Navigate, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { GuestSidebar } from "@/components/guest/GuestSidebar";
import { GuestPageHeader } from "@/components/guest/GuestPageHeader";
import { Loader2 } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";

// Map routes to page titles
const getPageTitle = (pathname: string): string => {
  if (pathname === "/guest/dashboard") return "Dashboard";
  if (pathname === "/guest/bookings") return "My Bookings";
  if (pathname === "/guest/payments") return "Payments & Receipts";
  if (pathname === "/guest/inbox") return "Messages";
  if (pathname === "/guest/profile") return "My Profile";
  if (pathname === "/guest/settings") return "Settings";
  return "Dashboard";
};

const GuestLayout = () => {
  const { user, loading } = useAuth();
  const unreadMessages = useUnreadMessages(user?.id);
  const { primaryRole, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const location = useLocation();
  
  // GitHub Pages normalizes directory routes with a trailing slash.
  const pageTitle = getPageTitle(location.pathname.replace(/\/+$/, ""));

  useEffect(() => {
    if (!loading && !roleLoading && !user) {
      navigate("/");
    } else if (!loading && !roleLoading && primaryRole === "host") {
      navigate("/host/dashboard", { replace: true });
    } else if (!loading && !roleLoading && primaryRole === "admin") {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [user, loading, roleLoading, primaryRole, navigate]);

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }
  if (primaryRole === "host") return <Navigate to="/host/dashboard" replace />;
  if (primaryRole === "admin") return <Navigate to="/admin/dashboard" replace />;
  if (primaryRole !== "guest") return <Navigate to="/" replace />;

  return (
    <div className="app-shell flex min-h-screen w-full bg-slate-50">
      <GuestSidebar logoText="Yarika" unreadMessageCount={unreadMessages} />
      <div className="app-content min-w-0 flex-1">
        <div className="container mx-auto px-4 pt-8 lg:px-8">
          <GuestPageHeader 
            title={pageTitle}
            unreadMessageCount={unreadMessages}
          />
        </div>
        <Outlet context={{ unreadMessageCount: unreadMessages }} />
      </div>
    </div>
  );
};

export default GuestLayout;
