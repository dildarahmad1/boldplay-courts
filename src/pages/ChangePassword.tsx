import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthDialog } from "@/components/AuthDialog";

export default function ChangePassword() {
  const { user, loading } = useAuth();
  const { language, direction } = useLanguage();
  const t = (text: string) => translateUiText(text, language);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !user) return;
    if (password.length < 8 || password !== confirmPassword) {
      setError("Use at least 8 characters and make sure both passwords match."); return;
    }
    if (password === currentPassword) { setError("Choose a password different from your current password."); return; }
    setSaving(true); setError("");
    try {
      const credentials = user.email ? { email: user.email, password: currentPassword } : { phone: user.phone || "", password: currentPassword };
      const { data, error: signInError } = await supabase.auth.signInWithPassword(credentials);
      setCurrentPassword("");
      if (signInError || !data.session || data.user?.id !== user.id) {
        setError("Could not verify your current password. Check it and try again."); return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError("Could not update your password. Please try again."); return; }
      setPassword(""); setConfirmPassword(""); setSaved(true);
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    } catch { setError("Could not update your password. Please try again."); }
    finally { setSaving(false); setCurrentPassword(""); }
  };

  return (
    <main className="flex min-h-[calc(100dvh-80px)] items-center justify-center bg-slate-50 px-4 py-10" dir={direction}>
      <Card className="w-full max-w-md rounded-3xl border-slate-200 p-2 shadow-sm sm:p-4">
        <CardHeader className="space-y-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">{saved ? <CheckCircle2 className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}</span>
          <h1 className="text-2xl font-semibold">{t(saved ? "Password updated" : "Change password")}</h1>
          <p className="text-sm leading-6 text-slate-500">{t(saved ? "Sign in with your email and new password." : "Enter your current password, then choose a new password.")}</p>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : saved ? <Button asChild className="h-12 w-full rounded-xl"><Link to="/">{t("Return to sign in")}</Link></Button> : !user ? <Button onClick={() => setLoginOpen(true)} className="h-12 w-full rounded-xl">{t("Sign in")}</Button> : (
            <form onSubmit={submit} className="space-y-4">
              {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{t(error)}</p>}
              <fieldset disabled={saving} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="current-password">{t("Current password")}</Label><Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required className="h-12" /></div>
                <div className="space-y-2"><Label htmlFor="change-password">{t("New Password")}</Label><Input id="change-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required className="h-12" /></div>
                <div className="space-y-2"><Label htmlFor="change-password-confirm">{t("Confirm password")}</Label><Input id="change-password-confirm" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required className="h-12" /></div>
              </fieldset>
              <Button type="submit" disabled={saving} className="h-12 w-full rounded-xl">{saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t("Save new password")}</Button>
            </form>
          )}
          <Button asChild variant="ghost" className="mt-4 w-full"><Link to="/">{t("Back to Home")}</Link></Button>
        </CardContent>
      </Card>
      <AuthDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </main>
  );
}
