import { LayoutGrid, Calendar, CreditCard, MessageSquare, User, Settings, LogOut, Building2, Menu } from "lucide-react";
import { NavLink, useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { LucideIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

export interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

const defaultNavigation: NavigationItem[] = [
  { name: "Dashboard", href: "/guest/dashboard", icon: LayoutGrid },
  { name: "My Bookings", href: "/guest/bookings", icon: Calendar },
  { name: "Payments & receipts", href: "/guest/payments", icon: CreditCard },
  { name: "Messages", href: "/guest/inbox", icon: MessageSquare },
  { name: "My Profile", href: "/guest/profile", icon: User },
  { name: "Settings", href: "/guest/settings", icon: Settings },
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

  const handleLogout = async () => {
    await signOut();
    onNavigate?.();
  };

  /**
   * Determines which navigation item should be active based on URL and state
   * For guest pages, no special routing logic needed - just return current path
   */
  const getActiveNavItem = (currentPath: string, locationState: any): string => {
    // Guest routes don't have special pages like edit-listing
    // Just return the current path for direct URL-based matching
    return currentPath;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-3 mb-8 cursor-pointer hover:opacity-80 transition-opacity">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <Building2 className="h-5 w-5 text-foreground" />
        </div>
        <span className="text-lg font-semibold">{logoText}</span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
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
                const shouldHighlight = isActive || item.href === activeNavPath;
                
                return `flex items-center gap-3 px-4 py-3 rounded-full text-sm font-medium transition-colors ${
                  shouldHighlight
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent/50"
                }`;
              }}
            >
              <span className="relative"><item.icon className="h-5 w-5" />{item.href === "/guest/inbox" && unreadMessageCount > 0 && <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] leading-5 text-white">{unreadMessageCount > 99 ? "99+" : unreadMessageCount}</span>}</span>
              <span>{translateUiText(item.name, language)}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Log Out */}
      <Button
        variant="outline"
        onClick={handleLogout}
        className="w-full justify-center gap-3 mt-auto rounded-full border-border bg-transparent text-foreground hover:bg-accent/30"
      >
        <LogOut className="h-5 w-5" />
        <span>Log Out</span>
      </Button>
    </div>
  );
};

interface SidebarProps {
  navigationItems?: NavigationItem[];
  logoText?: string;
  unreadMessageCount?: number;
}

export const GuestSidebar = ({ navigationItems, logoText, unreadMessageCount = 0 }: SidebarProps) => {
  return (
    <aside className="hidden lg:flex lg:flex-col w-[275px] flex-shrink-0 h-screen border-r border-border bg-card p-7 sticky top-0">
      <SidebarContent 
        navigationItems={navigationItems}
        logoText={logoText}
        unreadMessageCount={unreadMessageCount}
      />
    </aside>
  );
};

export const MobileGuestSidebar = ({ navigationItems, logoText, unreadMessageCount = 0 }: SidebarProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="lg:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[275px] p-7 bg-card">
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
