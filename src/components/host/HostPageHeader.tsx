import { Link } from "react-router-dom";
import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { MobileHostSidebar } from "./HostSidebar";
import { ChatSidebar } from "@/components/inbox/ChatSidebar";

interface HostPageHeaderProps {
  title: string;
  unreadMessageCount?: number;
}

export const HostPageHeader = ({ title, unreadMessageCount = 0 }: HostPageHeaderProps) => {
  const { signOut, user } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await signOut();
  };

  // Get user initials for avatar fallback
  const getInitials = () => {
    if (!user?.email) return "H";
    return user.email.charAt(0).toUpperCase();
  };

  return (
    <div className="flex items-center justify-between mb-8">
      {/* Left Side - Title */}
      <div className="flex items-center gap-3">
        <MobileHostSidebar unreadMessageCount={unreadMessageCount} />
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      </div>

      {/* Right Side - Icons and Avatar */}
      <div className="flex items-center gap-3">
        {/* Message Icon with Sidebar */}
        <ChatSidebar
          userRole="host"
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full w-10 h-10 bg-white hover:bg-white/90 relative"
            >
              <MessageSquare className="h-5 w-5" />
              {unreadMessageCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] leading-5 text-white">{unreadMessageCount > 99 ? "99+" : unreadMessageCount}</span>
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
                <AvatarImage src="" alt={user?.email || "Host"} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-card">
            <DropdownMenuItem asChild><Link to="/change-password">Change password</Link></DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
