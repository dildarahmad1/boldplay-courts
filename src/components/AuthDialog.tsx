import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { authEmailError, authRedirectUrl } from "@/lib/authEmail";
import { translateUiText } from "@/lib/uiTranslations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTarget?: "guest" | "host" | "admin";
}

type OtpIntent = "login" | "signup";

const normalizeIraqiPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("964")) return `+${digits}`;
  return `+964${digits.replace(/^0/, "")}`;
};

export const AuthDialog = ({ open, onOpenChange, initialTarget = "guest" }: AuthDialogProps) => {
  const { language } = useLanguage();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [target, setTarget] = useState<"guest" | "host" | "admin">(initialTarget);
  const [tab, setTab] = useState("login");
  const [providers, setProviders] = useState({ phone: false, google: false });
  const [otp, setOtp] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpIntent, setOtpIntent] = useState<OtpIntent>("login");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      signal: controller.signal,
    }).then(response => {
      if (!response.ok) throw new Error("Auth settings unavailable");
      return response.json();
    }).then(settings => setProviders({
      phone: settings.external?.phone === true,
      google: settings.external?.google === true,
    })).catch(() => {});
    return () => controller.abort();
  }, [open]);

  const hasRequiredRole = async (userId: string, accountRole: unknown, requiredRoles: readonly ("admin" | "host" | "guest")[]) => {
    if (typeof accountRole === "string" && requiredRoles.some((role) => role === accountRole)) return true;
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", requiredRoles);
    return !error && Boolean(data?.length);
  };

  const closeAndContinue = async (signedInUser?: { id: string; app_metadata?: Record<string, unknown> }) => {
    if (target === "host") {
      const currentUser = signedInUser ?? (await supabase.auth.getUser()).data.user ?? undefined;
      const allowed = currentUser && await hasRequiredRole(currentUser.id, currentUser.app_metadata?.role, ["host", "admin"]);
      if (!allowed) {
        toast({ title: "Host sign in required", description: "Use the host credentials provided by an administrator.", variant: "destructive" });
        await supabase.auth.signOut();
        return;
      }
    }
    setPassword("");
    setOtp("");
    setOtpSent(false);
    onOpenChange(false);
    // Never turn an unfinished booking into an invalid checkout URL.
    if (target === "host") navigate("/host/dashboard");
    if (target === "admin") navigate("/admin/dashboard");
    // A normal sign-in should not interrupt what the player was doing.
    // Bookings remain available from the explicit "My Bookings" navigation item.
  };

  const sendOtp = async (intent: OtpIntent) => {
    const formattedPhone = normalizeIraqiPhone(phone);
    if (!/^\+9647\d{9}$/.test(formattedPhone)) {
      toast({ title: "Invalid phone number", description: "Enter a valid Iraqi mobile number.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
    const { error } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
      options: { shouldCreateUser: false },
    });
    setLoading(false);

    if (error) {
      toast({ title: "Could not send code", description: error.message, variant: "destructive" });
      return;
    }
    setOtpIntent(intent);
    setOtpSent(true);
    toast({ title: "Verification code sent", description: `We sent a 6-digit code to ${formattedPhone}.` });
    } catch {
      toast({ title: "Could not send code", description: "Please try again.", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handlePhoneLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const credentials = method === "email"
        ? { email: email.trim(), password }
        : { phone: normalizeIraqiPhone(phone), password };
      const { data, error } = await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
      if (!data.session) throw new Error("Please sign in again.");
      if (target === "admin") {
        const allowed = await hasRequiredRole(data.user.id, data.user.app_metadata?.role, ["admin"]);
        if (!allowed) {
          toast({ title: "Access denied", description: "This account does not have administrator access.", variant: "destructive" });
          await supabase.auth.signOut();
          return;
        }
      }
      await closeAndContinue(data.user);
    } catch (error) {
      if (method === "email" && (error as { code?: string })?.code === "email_not_confirmed") {
        setPassword(""); onOpenChange(false);
        navigate(`/email-verified?pending=1&lang=${language}`, { state: { email: email.trim() } });
        return;
      }
      toast({ title: "Sign in failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    const formattedPhone = normalizeIraqiPhone(phone);
    if (target === "admin" || target === "host") {
      toast({ title: "Registration unavailable", description: "Only an administrator can create host accounts.", variant: "destructive" });
      return;
    }
    if (!fullName.trim() || password.length < 8 || (method === "email" && !/^\S+@\S+\.\S+$/.test(email.trim())) || (method === "phone" && !/^\+9647\d{9}$/.test(formattedPhone))) {
      toast({ title: "Sign up failed", description: method === "email"
        ? "Enter your name, a valid email address and a password of at least 8 characters."
        : "Enter your name, a valid Iraqi mobile number and a password of at least 8 characters.", variant: "destructive" });
      return;
    }
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts.shift() || "";
    const lastName = nameParts.join(" ");
    setLoading(true);
    try {
    const { data, error } = await supabase.auth.signUp({
      ...(method === "email" ? { email: email.trim() } : { phone: formattedPhone }),
      password,
      options: {
        emailRedirectTo: method === "email"
          ? authRedirectUrl("email-verified", language)
          : undefined,
        data: {
          full_name: fullName.trim(),
          first_name: firstName,
          last_name: lastName,
          language,
          ...(method === "phone" ? { phone: formattedPhone } : {}),
        },
      },
    });
    setLoading(false);

    if (error) {
      toast({ title: "Sign up failed", description: translateUiText(error.status === 429 || error.status === 500 || error.code === "email_address_not_authorized" ? authEmailError(error) : error.message, language), variant: "destructive" });
      return;
    }
    if (!data.user || data.user.identities?.length === 0) {
      toast({ title: "Account already exists", description: "Sign in with this email or use password recovery to access your account.", variant: "destructive" });
      return;
    }
    if (method === "email" && data.session) {
      // Supabase auto-confirms email signups (no email provider yet); useAuth still rejects unconfirmed sessions.
      toast({ title: "Account created", description: "Welcome to Yarika." });
      await closeAndContinue(data.user ?? undefined);
      return;
    }
    if (method === "email") {
      setPassword("");
      onOpenChange(false);
      navigate(`/email-verified?pending=1&lang=${language}`, { state: { email: email.trim() } });
      return;
    }
    setOtpIntent("signup");
    setOtpSent(true);
    toast({ title: "Verify your phone", description: "Enter the verification code sent to your phone." });
    } catch {
      toast({ title: "Sign up failed", description: "Please try again.", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (otp.length !== 6) return;
    setLoading(true);
    try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalizeIraqiPhone(phone),
      token: otp,
      type: "sms",
    });
    setLoading(false);
    if (error || !data.session) {
      toast({ title: "Invalid verification code", description: error?.message || "Please try again.", variant: "destructive" });
      return;
    }
    toast({ title: "Phone verified", description: "Welcome to Yarika." });
    await closeAndContinue();
    } catch {
      toast({ title: "Invalid verification code", description: "Please try again.", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleGoogleLogin = async () => {
    if (!providers.google) {
      toast({
        title: "Google sign in is not available yet",
        description: "Google must first be enabled in the Supabase authentication settings.",
      });
      return;
    }
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (error) {
      setGoogleLoading(false);
      toast({ title: "Google sign in failed", description: error.message, variant: "destructive" });
    }
  };

  const resetOtp = () => {
    setOtp("");
    setOtpSent(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border border-slate-200 bg-white p-0 shadow-xl sm:max-w-[480px]">
        <div>
          <DialogHeader className="border-b border-slate-100 px-6 pb-5 pt-7 text-start sm:px-8">
            <div className="mb-5 flex items-center justify-center gap-2" dir="ltr">
              <BrandMark className="h-9 w-9" />
              <span className="font-display text-xl font-semibold tracking-tight text-slate-950">Yarika</span>
            </div>
            <DialogTitle className="text-2xl font-bold tracking-tight text-slate-950">Sign in to book your next game</DialogTitle>
            <DialogDescription className="mt-1.5 text-sm leading-6 text-slate-500">
              {target === "host" ? "Host accounts are created by an administrator. Ask your administrator for credentials." : target === "admin" ? "Sign in with an administrator account." : "Sign in with your own account."}
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 sm:px-8 sm:py-7">
            {!otpSent && <div className="mb-6 flex w-full items-center justify-center gap-7" role="group" aria-label="Account type">
              {(["guest", "host", "admin"] as const).map(role => (
                <button key={role} type="button" aria-pressed={target === role}
                  className={`relative bg-transparent px-0 py-2 text-sm font-medium transition-colors duration-200 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-center after:rounded-full after:bg-emerald-700 after:transition-transform after:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-4 disabled:opacity-50 ${target === role ? "text-emerald-700 after:scale-x-100" : "text-slate-500 after:scale-x-0 hover:text-slate-950"}`}
                  disabled={loading} onClick={() => { setTarget(role); setTab("login"); }}>
                  {role === "guest" ? "Player" : role === "host" ? "Host" : "Admin"}
                </button>
              ))}
            </div>}
            {!otpSent && providers.phone && <div className="mb-4 flex gap-2">
              <Button type="button" variant={method === "email" ? "default" : "outline"} onClick={() => setMethod("email")}>Email</Button>
              <Button type="button" variant={method === "phone" ? "default" : "outline"} onClick={() => setMethod("phone")}>Phone number</Button>
            </div>}
            {otpSent ? (
              <form onSubmit={verifyCode} className="space-y-5">
                <button type="button" onClick={resetOtp} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-950">
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> Back
                </button>
                <div>
                  <Smartphone className="mb-3 h-6 w-6 text-emerald-700" />
                  <h3 className="font-bold text-slate-950">Verify your phone</h3>
                  <p className="mt-1 text-sm text-slate-500">Enter the code sent to {normalizeIraqiPhone(phone)}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auth-otp">6-digit verification code</Label>
                  <Input id="auth-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} className="h-12 rounded-lg text-center text-xl font-bold tracking-[0.35em]" placeholder="000000" required />
                </div>
                <Button type="submit" disabled={loading || otp.length !== 6} className="h-12 w-full rounded-lg bg-slate-950 font-bold hover:bg-slate-800">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="me-2 h-4 w-4" /> Verify and continue</>}
                </Button>
                <button type="button" disabled={loading} onClick={() => sendOtp(otpIntent)} className="w-full text-center text-sm font-semibold text-emerald-700 hover:text-emerald-800">Send a new code</button>
              </form>
            ) : (
              <Tabs value={tab} className="w-full" onValueChange={value => { setTab(value); setPhone(""); setPassword(""); }}>
                <TabsList className={`grid h-11 w-full ${target === "host" || target === "admin" ? "grid-cols-1" : "grid-cols-2"} border-b border-slate-200 bg-transparent p-0`}>
                  <TabsTrigger className="h-11 rounded-none border-b-2 border-transparent bg-transparent px-2 font-semibold text-slate-500 shadow-none data-[state=active]:border-slate-950 data-[state=active]:bg-transparent data-[state=active]:text-slate-950 data-[state=active]:shadow-none" value="login">Sign in</TabsTrigger>
                  {target === "guest" && <TabsTrigger className="h-11 rounded-none border-b-2 border-transparent bg-transparent px-2 font-semibold text-slate-500 shadow-none data-[state=active]:border-slate-950 data-[state=active]:bg-transparent data-[state=active]:text-slate-950 data-[state=active]:shadow-none" value="signup">Create account</TabsTrigger>}
                </TabsList>

                <TabsContent value="login" className="mt-5 space-y-5">
                  <form onSubmit={handlePhoneLogin} className="space-y-4">
                    {method === "phone" ? <PhoneField phone={phone} setPhone={setPhone} /> : <div className="space-y-2"><Label htmlFor="login-email">Email</Label><Input id="login-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></div>}
                    <div className="space-y-2"><Label htmlFor="login-password">Password</Label><Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></div>
                    <Button type="submit" disabled={loading} className="h-12 w-full rounded-lg bg-slate-950 font-bold hover:bg-slate-800">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                    </Button>
                    <button type="button" className="text-sm text-emerald-700" onClick={() => { onOpenChange(false); navigate("/forgot-password"); }}>Forgot password?</button>
                  </form>
                  {method === "phone" && <Button type="button" variant="outline" disabled={loading} onClick={() => sendOtp("login")}>Send verification code</Button>}
                  {providers.google && target !== "admin" && <><SocialDivider /><GoogleButton loading={googleLoading} onClick={handleGoogleLogin} /></>}
                </TabsContent>

                <TabsContent value="signup" className="mt-5 space-y-5">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full name</Label>
                      <Input id="signup-name" value={fullName} onChange={(event) => setFullName(event.target.value)} className="h-12 rounded-lg" placeholder="Your full name" required />
                    </div>
                    {method === "phone" ? <PhoneField phone={phone} setPhone={setPhone} id="signup-phone" /> : <div className="space-y-2"><Label htmlFor="signup-email">Email</Label><Input id="signup-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></div>}
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input id="signup-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 rounded-lg" placeholder="At least 8 characters" minLength={8} required />
                    </div>
                    <Button type="submit" disabled={loading} className="h-12 w-full rounded-lg bg-slate-950 font-bold hover:bg-slate-800">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                    </Button>
                  </form>
                  {providers.google && target !== "admin" && <><SocialDivider /><GoogleButton loading={googleLoading} onClick={handleGoogleLogin} /></>}
                </TabsContent>
              </Tabs>
            )}

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const PhoneField = ({ phone, setPhone, id = "login-phone" }: { phone: string; setPhone: (value: string) => void; id?: string }) => (
  <div className="space-y-2">
    <Label htmlFor={id}>Phone number</Label>
    <div className="flex h-12 overflow-hidden rounded-lg border border-input bg-white focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-950/10">
      <span className="flex items-center border-e border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700" dir="ltr">🇮🇶 +964</span>
      <input id={id} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 text-start text-sm outline-none" placeholder="750 123 4567" dir="ltr" required />
    </div>
  </div>
);

const SocialDivider = () => (
  <div className="flex items-center gap-3"><div className="h-px flex-1 bg-slate-200" /><span className="text-xs font-semibold text-slate-400">or continue with</span><div className="h-px flex-1 bg-slate-200" /></div>
);

const GoogleButton = ({ loading, onClick }: { loading: boolean; onClick: () => void }) => (
  <Button type="button" variant="outline" disabled={loading} onClick={onClick} className="h-12 w-full rounded-lg border-slate-300 bg-white font-semibold text-slate-800 shadow-none hover:bg-slate-50">
    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span className="me-2 text-lg font-black text-blue-600">G</span> Continue with Google</>}
  </Button>
);
