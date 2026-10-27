import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { CheckCircle2, MailCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppLanguage, useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { authEmailError, authRedirectUrl } from "@/lib/authEmail";

const supportedLanguages: AppLanguage[] = ["en", "ckb", "kmr", "ar"];

const EmailVerified = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { language, setLanguage } = useLanguage();
  const requestedLanguage = searchParams.get("lang") as AppLanguage | null;
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const [hasError] = useState(() => Boolean(hashParams.get("error") || hashParams.get("error_code") || searchParams.has("error")));
  const [isInvite] = useState(() => hashParams.get("type") === "invite" || searchParams.get("type") === "invite");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [checking, setChecking] = useState(true);
  const [verified, setVerified] = useState(false);
  const [email, setEmail] = useState<string>(location.state?.email || "");
  const [emailError, setEmailError] = useState("");
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const { toast } = useToast();
  const t = (text: string) => translateUiText(text, language);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        if (hasError || searchParams.get("pending") === "1") return;
        await supabase.auth.getSession();
        const { data, error } = await supabase.auth.getUser();
        if (active && !error && data.user?.email_confirmed_at) setVerified(true);
      } finally { if (active) setChecking(false); }
    };
    void check().catch(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [hasError, searchParams]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const resend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || cooldown) return;
    setSaving(true); setEmailError("");
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: authRedirectUrl("email-verified", language) } });
      if (error) throw error;
      setResent(true); setCooldown(60);
    } catch (error) { setEmailError(authEmailError(error)); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    if (requestedLanguage && supportedLanguages.includes(requestedLanguage)) {
      setLanguage(requestedLanguage);
    }
  }, [requestedLanguage, setLanguage]);

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!verified || password.length < 8 || password !== confirmPassword) {
      toast({ title: t("Password problem"), description: t("Use at least 8 characters and make sure both passwords match."), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword(""); setConfirmPassword("");
      setPasswordSaved(true);
      await supabase.auth.signOut({ scope: "local" });
      toast({ title: t("Password created"), description: t("Sign in with your email and new password.") });
    } catch {
      toast({ title: t("Could not save password"), description: t("Could not save password. Request a new reset link and try again."), variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <main className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-slate-50 px-4 py-14">
      <Card className="w-full max-w-lg rounded-[2rem] border-slate-200 bg-white p-8 text-center shadow-xl sm:p-12">
        <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full ${hasError ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
          {checking ? <Loader2 className="h-8 w-8 animate-spin" /> : verified ? <CheckCircle2 className="h-8 w-8" /> : <MailCheck className="h-8 w-8" />}
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">
          {t(checking ? "Checking your link..." : hasError ? "Verification link problem" : !verified ? "Verify your email" : isInvite && !passwordSaved ? "Create your password" : "Email verified")}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
          {t(checking ? "Please wait." : hasError
            ? "This verification link is invalid or has expired. Request a new verification email and try again."
            : !verified ? "Open the verification link in your email before signing in. Check your spam folder too."
            : isInvite && !passwordSaved
              ? "Choose a secure password to finish activating your account."
              : "Your email address is verified. You can now sign in and use your Yarika account.")}
        </p>
        {!checking && !verified ? (
          <form onSubmit={resend} className="mt-7 space-y-4 text-start">
            {emailError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-800">{t(emailError)}</p>}
            {resent && <p role="status" className="text-sm leading-6 text-emerald-800">{t("If your account needs verification, a new link will arrive in your inbox.")}</p>}
            <div className="space-y-2"><Label htmlFor="verification-email">{t("Email")}</Label><Input id="verification-email" type="email" autoComplete="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} required className="h-12" /></div>
            <Button disabled={saving || cooldown > 0} className="h-12 w-full rounded-xl">{saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t("Resend verification email")}{cooldown > 0 && <span className="ms-2" dir="ltr">({cooldown}s)</span>}</Button>
            <Button asChild variant="ghost" className="w-full"><Link to="/">{t("Back to Home")}</Link></Button>
          </form>
        ) : !checking && isInvite && !hasError && !passwordSaved ? (
          <form onSubmit={savePassword} className="mt-7 space-y-4 text-start">
            <div className="space-y-2"><Label htmlFor="invite-password">{t("Password")}</Label><Input id="invite-password" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="invite-password-confirm">{t("Confirm password")}</Label><Input id="invite-password-confirm" type="password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></div>
            <Button type="submit" disabled={saving} className="h-12 w-full rounded-full">{t(saving ? "Saving..." : "Activate account")}</Button>
          </form>
        ) : !checking ? (
          <Button asChild className="mt-7 h-12 rounded-full px-8">
            <Link to="/">{t(hasError ? "Return to sign in" : "Continue to Yarika")}</Link>
          </Button>
        ) : null}
      </Card>
    </main>
  );
};

export default EmailVerified;
