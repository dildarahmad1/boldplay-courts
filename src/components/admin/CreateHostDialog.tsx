import { useState } from "react";
import { UserPlus, Loader2, Eye, EyeOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const CreateHostDialog = () => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", password: "" });
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = (text: string) => translateUiText(text, language);

  const changeOpen = (next: boolean) => {
    if (saving) return;
    setOpen(next);
    if (!next) { setForm({ first_name: "", last_name: "", email: "", phone: "", password: "" }); setShowPassword(false); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-host", { body: { ...form, first_name: form.first_name.trim(), email: form.email.trim().toLowerCase(), language } });
      if (error) {
        let message = "Host creation failed. Check the details and try again.";
        if (error.context instanceof Response) {
          const details = await error.context.json().catch(() => null);
          if (typeof details?.error === "string") message = details.error;
        }
        throw new Error(message);
      }
      if (!data?.success || !data?.user_id || !data?.credentials_created) throw new Error(data?.error || "Host creation failed. Check the details and try again.");
      toast({ title: t("Host account created"), description: t("The host can now sign in with the email and password you created.") });
      setForm({ first_name: "", last_name: "", email: "", phone: "", password: "" });
      setShowPassword(false); setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (error) {
      toast({ title: t("Could not create host"), description: t(error instanceof Error ? error.message : "Host creation failed. Check the details and try again."), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild><Button className="gap-2 rounded-full"><UserPlus className="h-4 w-4" />{t("Create host")}</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onInteractOutside={event => { if (saving) event.preventDefault(); }} onEscapeKeyDown={event => { if (saving) event.preventDefault(); }}>
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader><DialogTitle>{t("Create host account")}</DialogTitle><DialogDescription>{t("Only administrators can create host credentials.")}</DialogDescription></DialogHeader>
          <fieldset disabled={saving} className="min-w-0 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="host-first-name">{t("First name")}</Label><Input id="host-first-name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></div>
            <div className="space-y-2"><Label htmlFor="host-last-name">{t("Last name")}</Label><Input id="host-last-name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="host-email">{t("Email")}</Label><Input id="host-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
          <div className="space-y-2"><Label htmlFor="host-phone">{t("Phone number")}</Label><Input id="host-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="host-password">{t("Temporary password")}</Label><div className="relative" dir="ltr"><Input id="host-password" type={showPassword ? "text" : "password"} dir="ltr" minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className="pe-12" /><Button type="button" variant="ghost" size="icon" className="absolute end-0 top-0" aria-label={t(showPassword ? "Hide password" : "Show password")} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div><p className="text-xs text-muted-foreground">{t("At least 8 characters. The host can change it after signing in.")}</p></div>
          </fieldset>
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => changeOpen(false)}>{t("Cancel")}</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t(saving ? "Creating account..." : "Create host")}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
