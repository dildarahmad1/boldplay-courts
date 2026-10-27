import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, KeyRound, MailCheck, CheckCircle2 } from "lucide-react";
import { AppLanguage, useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { authEmailError, authRedirectUrl } from "@/lib/authEmail";

export default function ForgotPassword() {
  const [params] = useSearchParams();
  const { language, setLanguage, direction } = useLanguage();
  const t = (value: string) => translateUiText(value, language);
  const recovery = params.get("mode") === "recovery";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(recovery);
  const [canReset, setCanReset] = useState(false);
  const [sent, setSent] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const requested = params.get("lang") as AppLanguage;
    if (["en", "ckb", "kmr", "ar"].includes(requested) && requested !== language) setLanguage(requested);
  }, [params, language, setLanguage]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!recovery) { setChecking(false); setCanReset(false); return; }
    let active = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const check = async () => {
      try {
        if (hash.has("error") || hash.has("error_code") || params.has("error")) throw new Error("Invalid recovery link");
        // Wait for Supabase to consume the email callback before checking the user.
        await supabase.auth.getSession();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw new Error("Invalid recovery link");
        if (active) setCanReset(true);
      } catch {
        if (active) setError("This password reset link is invalid or has expired. Request a new link below.");
      } finally { if (active) setChecking(false); }
    };
    void check();
    return () => { active = false; };
  }, [recovery, params]);

  const sendEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || cooldown) return;
    setLoading(true); setError("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl("forgot-password", language) });
      if (error) throw error;
      setSent(true); setCooldown(60);
    } catch (error) { setError(authEmailError(error)); }
    finally { setLoading(false); }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !canReset) return;
    if (password.length < 8 || password !== confirmPassword) {
      setError("Use at least 8 characters and make sure both passwords match."); return;
    }
    setLoading(true); setError("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.code === "same_password" ? "Choose a password different from your current password." : "Could not save password. Request a new reset link and try again.");
        return;
      }
      setPassword(""); setConfirmPassword(""); setSaved(true);
      await supabase.auth.signOut({ scope: "local" });
    } catch { setError("Could not save password. Request a new reset link and try again."); }
    finally { setLoading(false); }
  };

  const Icon = saved ? CheckCircle2 : sent ? MailCheck : KeyRound;
  return (
    <main className="flex min-h-[calc(100dvh-80px)] items-center justify-center bg-slate-50 px-4 py-10" dir={direction}>
      <Card className="w-full max-w-md rounded-3xl border-slate-200 bg-white p-2 shadow-sm sm:p-4">
        <CardHeader className="space-y-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon className="h-6 w-6" aria-hidden="true" /></span>
          <CardTitle className="text-2xl">{t(saved ? "Password updated" : canReset ? "Choose a new password" : sent ? "Check your email" : "Reset Password")}</CardTitle>
          <CardDescription className="leading-6">{t(saved ? "Sign in with your email and new password." : canReset ? "Use at least 8 characters for your new password." : sent ? "If an account exists for this email, you will receive a password reset link. Check your spam folder too." : "Enter your email address and we will send you a password reset link.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{t(error)}</p>}
          {checking ? <div role="status" className="flex items-center gap-2 py-4"><Loader2 className="h-5 w-5 animate-spin" />{t("Checking your link...")}</div> : saved ? (
            <Button asChild className="h-12 w-full rounded-xl"><Link to="/">{t("Return to sign in")}</Link></Button>
          ) : canReset ? (
            <form onSubmit={savePassword} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="reset-password">{t("New Password")}</Label><Input id="reset-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required className="h-12" /></div>
              <div className="space-y-2"><Label htmlFor="reset-confirm">{t("Confirm password")}</Label><Input id="reset-confirm" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="h-12" /></div>
              <Button disabled={loading} className="h-12 w-full rounded-xl">{loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t("Save new password")}</Button>
            </form>
          ) : (
            <form onSubmit={sendEmail} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="reset-email">{t("Email")}</Label><Input id="reset-email" type="email" autoComplete="email" placeholder="you@example.com" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} required className="h-12" /></div>
              <Button disabled={loading || cooldown > 0} className="h-12 w-full rounded-xl">{loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t(sent ? "Resend reset email" : "Send reset email")}{cooldown > 0 && <span className="ms-2 tabular-nums" dir="ltr">({cooldown}s)</span>}</Button>
            </form>
          )}
          {!saved && <Button asChild variant="ghost" className="w-full"><Link to="/">{t("Back to Home")}</Link></Button>}
        </CardContent>
      </Card>
    </main>
  );
}
