import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextLinkButton } from "@/components/ui/text-link-button";
import DashboardEarningsSummary from "@/components/host/DashboardEarningsSummary";
import DashboardRecentListings from "@/components/host/DashboardRecentListings";
import DashboardInbox from "@/components/host/DashboardInbox";
import DashboardRecentBookings from "@/components/host/DashboardRecentBookings";
import DashboardRecentPayouts from "@/components/host/DashboardRecentPayouts";
import { ArrowUpRight, Plus } from "lucide-react";

const HostDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-10 sm:px-6 lg:px-8">
      {/* Earnings Overview Panel */}
      <Card className="overflow-hidden rounded-[24px] border-slate-200/80 bg-white shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)]">
        <CardHeader className="border-b border-slate-100 px-5 py-5 sm:px-7">
          <CardTitle className="text-xl font-black tracking-tight text-slate-950">Earnings Overview</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Income is counted from the booking’s scheduled start time; upcoming bookings are excluded.
          </p>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {user ? (
            <DashboardEarningsSummary userId={user.id} />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Please log in to view your dashboard
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Listings and Inbox Row */}
      {user && (
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Recent Listings - 2/3 width */}
          <div className="xl:col-span-2">
            <Card className="flex h-full flex-col overflow-hidden rounded-[24px] border-slate-200/80 bg-white shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)]">
              <CardHeader className="border-b border-slate-100 px-5 py-5 sm:px-7">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-xl font-semibold">Recent Listings</CardTitle>
                  <Button className="h-10 rounded-xl bg-slate-950 px-4 hover:bg-slate-800" onClick={() => navigate("/host/create-listing", { state: { from: "/host/dashboard" } })}>
                    <Plus className="me-1.5 h-4 w-4" /> Add New
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-4 sm:p-6">
                <DashboardRecentListings userId={user.id} />
              </CardContent>
            </Card>
          </div>

          {/* Inbox - 1/3 width */}
          <div>
            <Card className="flex h-full flex-col overflow-hidden rounded-[24px] border-slate-200/80 bg-white shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)]">
              <CardHeader className="border-b border-slate-100 px-5 py-5 sm:px-7">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-xl font-semibold">Inbox</CardTitle>
                  <TextLinkButton href="/host/inbox">
                    View All
                  </TextLinkButton>
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1">
                <DashboardInbox userId={user.id} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Recent Bookings and Recent Payouts Row */}
      {user && (
        <div className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-2">
          {/* Recent Bookings - Left Column */}
          <Card className="flex h-full flex-col overflow-hidden rounded-[24px] border-slate-200/80 bg-white shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)]">
            <CardHeader className="border-b border-slate-100 px-5 py-5 sm:px-7">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl font-semibold">Bookings</CardTitle>
                <TextLinkButton href="/host/bookings">
                  Manage Bookings <ArrowUpRight className="ms-1 inline h-4 w-4" />
                </TextLinkButton>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-4 sm:p-6">
              <DashboardRecentBookings userId={user.id} />
            </CardContent>
          </Card>

          {/* Recent Payouts - Right Column */}
          <Card className="flex h-full flex-col overflow-hidden rounded-[24px] border-slate-200/80 bg-white shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)]">
            <CardHeader className="border-b border-slate-100 px-5 py-5 sm:px-7">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl font-semibold">Payouts</CardTitle>
                <TextLinkButton href="/host/payouts">
                  Review
                </TextLinkButton>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-4 sm:p-6">
              <DashboardRecentPayouts userId={user.id} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default HostDashboard;
