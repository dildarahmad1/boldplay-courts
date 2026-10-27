import { Link } from "react-router-dom";
import { useState } from "react";
import { Check, Languages, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { MobileHostSidebar, NavigationItem } from "@/components/host/HostSidebar";
import { ChatSidebar } from "@/components/inbox/ChatSidebar";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

interface AdminPageHeaderProps {
  title: string;
  navigationItems: NavigationItem[];
}

export const AdminPageHeader = ({ title, navigationItems }: AdminPageHeaderProps) => {
  const { signOut, user } = useAuth();
  const { language, setLanguage, options } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const unreadCount = useUnreadMessages(user?.id, true);

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await signOut();
  };

  // Get user initials for avatar fallback
  const getInitials = () => {
    if (!user?.email) return "A";
    return user.email.charAt(0).toUpperCase();
  };

  return (
    <header className="mb-6 flex min-w-0 items-center justify-between gap-3 sm:mb-8">
      {/* Left Side - Title */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <MobileHostSidebar 
          navigationItems={navigationItems}
          logoText="Yarika"
          unreadMessageCount={unreadCount}
        />
        <h1 className="truncate text-xl font-bold text-foreground sm:text-2xl">{translateUiText(title, language)}</h1>
      </div>

      {/* Right Side - Icons and Avatar */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-10 gap-2 rounded-full border-slate-200 bg-white px-3 font-semibold"
              aria-label={translateUiText("Change language", language)}
            >
              <Languages className="h-4 w-4" />
              <span className="hidden text-xs sm:inline">{options.find((option) => option.code === language)?.short}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-2xl bg-card p-2">
            {options.map((option) => (
              <DropdownMenuItem
                key={option.code}
                onSelect={() => setLanguage(option.code)}
                className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5"
              >
                <span>{option.label}</span>
                {language === option.code && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Message Icon with Sidebar */}
        <ChatSidebar
          userRole="admin"
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full w-10 h-10 bg-white hover:bg-white/90 relative"
            >
              <MessageSquare className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] leading-5 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>
              )}
            </Button>
          }
        />

        {/* User Avatar with Dropdown */}
        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full w-10 h-10 p-0"
            >
              <Avatar className="w-10 h-10">
                <AvatarImage src="" alt={user?.email || "Admin"} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-card">
            <DropdownMenuItem asChild><Link to="/change-password">Change password</Link></DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
              {translateUiText("Logout", language)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
