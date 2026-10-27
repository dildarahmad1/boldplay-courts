import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronDown, CircleHelp, Globe2, Home, LayoutDashboard, LogOut, Menu, Trophy, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { AuthDialog } from "@/components/AuthDialog";
import { BrandLogo, BrandMark } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const Navbar = () => {
  const { user, signOut } = useAuth();
  const { isAdmin, isHost, isGuest } = useUserRole();
  const { language, setLanguage, options, t } = useLanguage();
  const location = useLocation();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isHome = ["/", "/become-host", "/help-center", "/faq", "/support"].includes(location.pathname);

  const navigationItems = [
    { label: t("home"), to: "/", icon: Home },
    ...(user && isGuest ? [{ label: t("myBookings"), to: "/guest/bookings", icon: LayoutDashboard }] : []),
    ...(!user || isHost ? [{ label: t("listCourt"), to: isHost ? "/host/dashboard" : "/become-host", icon: Trophy }] : []),
    { label: t("help"), to: "/help-center", icon: CircleHelp },
  ];

  const isActive = (to: string) => to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  const openAuth = () => {
    setMobileMenuOpen(false);
    setAuthDialogOpen(true);
  };

  const handleSignOut = async () => {
    setMobileMenuOpen(false);
    await signOut();
  };

  return (
    <nav className={cn(
      "z-50 transition-colors",
      isHome
        ? "absolute inset-x-0 top-0 border-b border-white/15 bg-gradient-to-b from-slate-950/60 to-transparent text-white"
        : "sticky top-0 border-b border-border/70 bg-card/90 backdrop-blur-xl",
    )}>
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-3 sm:h-[4.5rem]">
          <BrandLogo inverted={isHome} />

          <div className="hidden items-center gap-7 md:flex">
            {navigationItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group relative py-2 text-sm font-medium transition-colors duration-300 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:transition-transform after:duration-300 hover:after:scale-x-100",
                  isHome ? "text-white/80 hover:text-white after:bg-white" : "text-muted-foreground hover:text-foreground after:bg-primary",
                  isActive(item.to) && (isHome ? "text-white after:scale-x-100" : "text-foreground after:scale-x-100"),
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className={cn("h-10 rounded-full px-3", isHome && "text-white hover:bg-white/10 hover:text-white")}>
                  <Globe2 className="mr-2 h-4 w-4" />
                  {options.find((option) => option.code === language)?.short}
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {options.map((option) => (
                  <DropdownMenuItem key={option.code} onClick={() => setLanguage(option.code)} className={cn(language === option.code && "bg-accent font-medium")}>
                    <span className="mr-3 w-10 text-xs font-semibold text-primary">{option.short}</span>{option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className={cn("h-10 rounded-full px-3", isHome && "border-white/30 bg-white/10 text-white hover:bg-white hover:text-primary")}>
                    <span className="mr-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {(user.email?.[0] || user.phone?.slice(-1) || "A").toUpperCase()}
                    </span>
                    {t("account")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>{t("myAccount")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {isGuest && <DropdownMenuItem asChild><Link to="/guest/bookings">{t("myBookings")}</Link></DropdownMenuItem>}
                  {isHost && <DropdownMenuItem asChild><Link to="/host/dashboard">{t("venueDashboard")}</Link></DropdownMenuItem>}
                  {isAdmin && <DropdownMenuItem asChild><Link to="/admin/dashboard">{t("adminDashboard")}</Link></DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" /> {t("logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button className={cn("h-11 rounded-full px-6 font-semibold shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl", isHome && "bg-white text-primary hover:bg-white")} onClick={() => setAuthDialogOpen(true)}>
                {t("join")}
              </Button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2 md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className={cn("h-10 rounded-full px-3 text-xs font-semibold", isHome ? "border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" : "border-slate-200 bg-white")} aria-label="Choose language">
                  <Globe2 className="mr-1.5 h-4 w-4" />
                  {options.find((option) => option.code === language)?.short}
                  <ChevronDown className="ml-1 h-3 w-3 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-2xl border-slate-200 p-2 shadow-xl">
                {options.map((option) => (
                  <DropdownMenuItem key={option.code} onClick={() => setLanguage(option.code)} className={cn("rounded-xl px-3 py-2.5", language === option.code && "bg-primary/10 font-semibold text-primary")}>
                    <span className="mr-3 w-10 text-xs font-semibold">{option.short}</span>
                    <span>{option.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className={cn("h-10 w-10 rounded-full", isHome ? "border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" : "border-slate-200 bg-white")} aria-label="Open navigation menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex w-[82%] max-w-[320px] flex-col border-l border-slate-200 bg-white p-0 shadow-2xl">
              <SheetHeader className="px-6 pb-6 pt-7 text-left">
                <SheetTitle className="flex items-center gap-3 text-slate-950">
                  <BrandMark className="h-9 w-9" />
                  <span className="font-display text-base font-semibold tracking-tight">Yarika</span>
                </SheetTitle>
                <SheetDescription className="sr-only">Main navigation</SheetDescription>
              </SheetHeader>

              <div className="flex flex-1 flex-col border-t border-slate-100 px-5 py-5">
                <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{t("menu")}</p>
                <div className="space-y-0.5">
                  {navigationItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SheetClose asChild key={item.to}>
                        <Link
                          to={item.to}
                          className={cn(
                            "group relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                            isActive(item.to) ? "bg-primary/[0.07] text-primary before:absolute before:bottom-3 before:left-0 before:top-3 before:w-0.5 before:rounded-full before:bg-primary" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                          )}
                        >
                          <Icon className={cn("h-[18px] w-[18px]", isActive(item.to) ? "text-primary" : "text-slate-400 group-hover:text-slate-700")} />
                          <span>{item.label}</span>
                        </Link>
                      </SheetClose>
                    );
                  })}
                </div>

                <div className="mt-auto border-t border-slate-100 pt-5">
                  {user ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 px-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><User className="h-4 w-4" /></span>
                        <span className="min-w-0 truncate text-sm text-muted-foreground">{user.email}</span>
                      </div>
                      <Button variant="outline" className="h-11 w-full rounded-xl" onClick={handleSignOut}><LogOut className="mr-2 h-4 w-4" />{t("logout")}</Button>
                    </div>
                  ) : (
                    <div>
                      <p className="mb-3 px-1 text-xs leading-relaxed text-slate-500">{t("ready")}</p>
                      <Button className="h-11 w-full rounded-full font-semibold shadow-none" onClick={openAuth}>{t("join")}</Button>
                    </div>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
          </div>
        </div>
      </div>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </nav>
  );
};

export default Navbar;
