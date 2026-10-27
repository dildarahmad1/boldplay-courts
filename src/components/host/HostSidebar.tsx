import { Home, LayoutGrid, Inbox, Calendar, CalendarClock, DollarSign, TrendingUp, LogOut, Menu } from "lucide-react";
import { NavLink, useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

export interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

const defaultNavigation: NavigationItem[] = [
  { name: "Dashboard", href: "/host/dashboard", icon: LayoutGrid },
  { name: "Listings & Availability", href: "/host/listings", icon: Home },
  { name: "Inbox", href: "/host/inbox", icon: Inbox },
  { name: "Bookings", href: "/host/bookings", icon: Calendar },
  { name: "Availability", href: "/host/availability", icon: CalendarClock },
  { name: "Payouts", href: "/host/payouts", icon: DollarSign },
  { name: "Earnings Report", href: "/host/earnings-report", icon: TrendingUp },
];

interface SidebarContentProps {
  onNavigate?: () => void;
  navigationItems?: NavigationItem[];
  logoText?: string;
  unreadMessageCount?: number;
}

const SidebarContent = ({ 
  onNavigate, 
  navigationItems = defaultNavigation,
  logoText = "Yarika",
  unreadMessageCount = 0,
}: SidebarContentProps) => {
  const { signOut } = useAuth();
  const { language } = useLanguage();
  const location = useLocation();
  const dense = navigationItems.length > 7;

  const handleLogout = async () => {
    await signOut();
    onNavigate?.();
  };

  /**
   * Determines which navigation item should be active based on URL and state
   * Handles special cases like edit-listing and create-listing pages
   */
  const getActiveNavItem = (currentPath: string, locationState: any): string => {
    // Host routes: edit-listing and create-listing pages
    if (currentPath.startsWith("/host/edit-listing/") || currentPath === "/host/create-listing") {
      if (locationState?.from) {
        return locationState.from;
      }
      return "/host/listings";
    }
    
    // Admin routes: review-listing pages
    if (currentPath.startsWith("/admin/review-listing/")) {
      if (locationState?.from) {
        return locationState.from;
      }
      return "/admin/listings";
    }
    
    // For all other routes, return the current path
    return currentPath;
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Logo */}
      <Link to="/" className={cn("flex shrink-0 flex-col items-center rounded-2xl transition-colors hover:bg-slate-50", dense ? "mb-2 gap-1 py-1" : "mb-3 gap-1.5 py-1.5")}>
        <BrandMark className={dense ? "h-9 w-9" : "h-10 w-10"} />
        <span className="max-w-full truncate font-display text-[10px] font-bold tracking-[0.08em] text-slate-700">{logoText}</span>
      </Link>

      {/* Navigation */}
      <nav
        className={cn("grid min-h-0 flex-1 overflow-hidden", dense ? "gap-1" : "gap-1.5")}
        style={{ gridTemplateRows: `repeat(${navigationItems.length}, minmax(0, 1fr))` }}
      >
        {navigationItems.map((item) => {
          const activeNavPath = getActiveNavItem(location.pathname, location.state);
          
          return (
            <NavLink
              key={item.name}
              to={item.href}
              end
              onClick={onNavigate}
              className={({ isActive }) => {
                // Check if this nav item should be highlighted
                // Either it's the active route, or it matches the contextual route
                const shouldHighlight = isActive || item.href === activeNavPath;
                
                return `group relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden rounded-2xl px-1 text-center font-bold leading-[1.15] transition-all duration-300 ${dense ? "gap-1 py-0.5 text-[9px]" : "gap-1.5 py-1 text-[10px]"} ${
                  shouldHighlight
                    ? "text-slate-950"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`;
              }}
            >
              {({ isActive }) => {
                const shouldHighlight = isActive || item.href === activeNavPath;
                return (
                  <>
                    {shouldHighlight && (
                      <motion.span layoutId="host-sidebar-active" className="absolute inset-0 rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                    )}
                    <span className={cn("relative z-10 flex shrink-0 items-center justify-center rounded-xl border transition-all duration-300", dense ? "h-7 w-7" : "h-8 w-8", shouldHighlight ? "border-emerald-300 bg-white text-emerald-700 shadow-sm" : "border-slate-200 bg-white text-slate-500 group-hover:border-slate-300 group-hover:text-slate-800")}>
                      <item.icon className={dense ? "h-4 w-4" : "h-[18px] w-[18px]"} strokeWidth={1.8} />
                      {(item.href === "/host/inbox" || item.href === "/admin/support") && unreadMessageCount > 0 && <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] leading-5 text-white">{unreadMessageCount > 99 ? "99+" : unreadMessageCount}</span>}
                    </span>
                    <span className="relative z-10 block w-full break-words px-0.5 text-center [text-wrap:balance]">{translateUiText(item.name, language)}</span>
                  </>
                );
              }}
            </NavLink>
          );
        })}
      </nav>

      {/* Log Out */}
      <Button
        variant="outline"
        onClick={handleLogout}
        className={cn("w-full shrink-0 flex-col justify-center gap-1 rounded-2xl border-slate-200 bg-white text-[10px] font-bold leading-tight text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700", dense ? "mt-2 h-12" : "mt-3 h-14")}
      >
        <LogOut className="h-5 w-5" strokeWidth={1.8} />
        <span>{translateUiText("Log Out", language)}</span>
      </Button>
    </div>
  );
};

interface SidebarProps {
  navigationItems?: NavigationItem[];
  logoText?: string;
  compact?: boolean;
  unreadMessageCount?: number;
}

export const HostSidebar = ({ navigationItems, logoText, compact = false, unreadMessageCount = 0 }: SidebarProps) => {
  return (
    <aside className={cn(
      "sticky top-0 hidden h-dvh flex-shrink-0 overflow-hidden border-e border-border bg-card lg:flex lg:flex-col",
      compact ? "w-[132px] border-e border-slate-200 bg-white p-3" : "w-[148px] border-e border-slate-200 bg-white p-4",
    )}>
      <SidebarContent 
        navigationItems={navigationItems}
        logoText={logoText}
        unreadMessageCount={unreadMessageCount}
      />
    </aside>
  );
};

export const MobileHostSidebar = ({ navigationItems, logoText, unreadMessageCount = 0 }: SidebarProps) => {
  const [open, setOpen] = useState(false);
  const { language } = useLanguage();
  const isRtl = language !== "en";

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="lg:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side={isRtl ? "right" : "left"} className="h-dvh w-[285px] overflow-hidden bg-card p-5 sm:p-6">
          <SidebarContent 
            onNavigate={() => setOpen(false)}
            navigationItems={navigationItems}
            logoText={logoText}
            unreadMessageCount={unreadMessageCount}
          />
        </SheetContent>
      </Sheet>
    </>
  );
};
