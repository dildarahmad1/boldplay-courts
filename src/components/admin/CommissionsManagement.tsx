import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Users } from "lucide-react";
import { useDemoData } from "@/hooks/useDemoData";
import { formatIQD } from "@/lib/currency";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

interface CommissionFormValues {
  hostCommissionRate: string;
  guestServiceFeeRate: string;
  taxRate: string;
}

interface HostCommissionRow {
  host_user_id: string;
  host_name: string;
  host_email: string;
  listings_count: number;
  bookings_count: number;
  gross_booking_value: number;
  commission_rate: number;
  uses_custom_rate: boolean;
}

const CommissionsManagement = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hosts, setHosts] = useState<HostCommissionRow[]>([]);
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [savingHostId, setSavingHostId] = useState<string | null>(null);
  const { toast } = useToast();
  const { language } = useLanguage();
  const { 
    isDemoMode, 
    getPlatformSettings, 
    updatePlatformSettings 
  } = useDemoData();

  const form = useForm<CommissionFormValues>({
    defaultValues: {
      hostCommissionRate: "",
      guestServiceFeeRate: "",
      taxRate: "",
    },
  });

  useEffect(() => {
    fetchSettings();
    fetchHostCommissions();
  }, []);

  const fetchHostCommissions = async () => {
    if (isDemoMode) return;
    try {
      const { data, error } = await (supabase.rpc as any)("admin_get_host_commissions");
      if (error) throw error;
      const rows = (data || []) as HostCommissionRow[];
      setHosts(rows);
      setRateDrafts(Object.fromEntries(rows.map((host) => [host.host_user_id, (Number(host.commission_rate) * 100).toFixed(2)])));
    } catch (error) {
      console.error("Error fetching host commissions:", error);
      toast({ title: "Error", description: "Failed to load host commission rates", variant: "destructive" });
    }
  };

  const saveHostCommission = async (host: HostCommissionRow) => {
    const percentage = Number(rateDrafts[host.host_user_id]);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      toast({ title: "Invalid commission", description: "Commission must be between 0% and 100%", variant: "destructive" });
      return;
    }
    setSavingHostId(host.host_user_id);
    try {
      const { error } = await (supabase.rpc as any)("admin_set_host_commission", {
        p_host_user_id: host.host_user_id,
        p_commission_rate: percentage / 100,
      });
      if (error) throw error;
      setHosts((current) => current.map((item) => item.host_user_id === host.host_user_id
        ? { ...item, commission_rate: percentage / 100, uses_custom_rate: true }
        : item));
      toast({ title: "Success", description: "Host commission updated successfully" });
    } catch (error) {
      console.error("Error updating host commission:", error);
      toast({ title: "Error", description: "Failed to update host commission", variant: "destructive" });
    } finally {
      setSavingHostId(null);
    }
  };

  const fetchSettings = async () => {
    try {
      let settings: Record<string, string>;

      if (isDemoMode) {
        // Demo mode: Get from localStorage
        const demoSettings = getPlatformSettings();
        if (demoSettings) {
          settings = {
            default_host_commission_rate: demoSettings.default_host_commission_rate,
            default_guest_service_fee_rate: demoSettings.default_guest_service_fee_rate,
            default_tax_rate: demoSettings.default_tax_rate,
          };
        } else {
          throw new Error('Demo settings not found');
        }
      } else {
        // Real mode: Fetch from Supabase
        const { data, error } = await supabase
          .from("platform_settings")
          .select("setting_key, setting_value")
          .in("setting_key", [
            "default_host_commission_rate",
            "default_guest_service_fee_rate",
            "default_tax_rate",
          ])
          .eq("is_active", true);

        if (error) throw error;

        settings = (data || []).reduce((acc, item) => {
          acc[item.setting_key] = item.setting_value;
          return acc;
        }, {} as Record<string, string>);
      }

      // Convert to percentages and set form values
      form.reset({
        hostCommissionRate: (parseFloat(settings.default_host_commission_rate || "0") * 100).toFixed(2),
        guestServiceFeeRate: (parseFloat(settings.default_guest_service_fee_rate || "0") * 100).toFixed(2),
        taxRate: (parseFloat(settings.default_tax_rate || "0") * 100).toFixed(2),
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
      toast({
        title: "Error",
        description: "Failed to load commission settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (values: CommissionFormValues) => {
    setSaving(true);
    try {
      // Convert percentages to decimals
      const updates = {
        default_host_commission_rate: (parseFloat(values.hostCommissionRate) / 100).toString(),
        default_guest_service_fee_rate: (parseFloat(values.guestServiceFeeRate) / 100).toString(),
        default_tax_rate: (parseFloat(values.taxRate) / 100).toString(),
      };

      if (isDemoMode) {
        // Demo mode: Save to localStorage
        const result = updatePlatformSettings(updates);
        if (!result.success) {
          throw new Error(result.error || 'Failed to update settings');
        }
      } else {
        // Real mode: Update Supabase
        for (const [key, value] of Object.entries(updates)) {
          const { error } = await supabase
            .from("platform_settings")
            .update({ 
              setting_value: value,
              updated_at: new Date().toISOString()
            })
            .eq("setting_key", key)
            .eq("is_active", true);

          if (error) throw error;
        }
      }

      toast({
        title: "Success",
        description: "Commission rates updated successfully",
      });
    } catch (error) {
      console.error("Error updating settings:", error);
      toast({
        title: "Error",
        description: "Failed to update commission settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
    <Card className="overflow-hidden rounded-3xl border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle>Platform Commission Settings</CardTitle>
        <CardDescription>
          Manage the fallback commission and guest fees. Each host can have a different commission below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="hostCommissionRate"
              rules={{
                required: "Host commission rate is required",
                min: { value: 0, message: "Rate must be at least 0%" },
                max: { value: 100, message: "Rate cannot exceed 100%" },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Host Commission Rate (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="15.00"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Used only for hosts who do not have a custom commission rate
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="guestServiceFeeRate"
              rules={{
                required: "Guest service fee rate is required",
                min: { value: 0, message: "Rate must be at least 0%" },
                max: { value: 100, message: "Rate cannot exceed 100%" },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Guest Service Fee Rate (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="10.00"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Percentage charged to guests on top of the booking subtotal
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="taxRate"
              rules={{
                required: "Tax rate is required",
                min: { value: 0, message: "Rate must be at least 0%" },
                max: { value: 100, message: "Rate cannot exceed 100%" },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax Rate (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="8.00"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Tax percentage applied to the total booking amount
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
    <Card className="overflow-hidden rounded-3xl border-slate-200 shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>{translateUiText("Commission by Host", language)}</CardTitle>
            <CardDescription>{translateUiText("Set a separate platform commission for every host", language)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {hosts.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{translateUiText("No hosts found", language)}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {hosts.map((host) => (
              <div key={host.host_user_id} className="grid gap-4 p-4 transition-colors hover:bg-slate-50/70 sm:p-5 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(90px,.7fr))_minmax(210px,1fr)] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">{host.host_name || host.host_email}</p>
                  <p className="truncate text-sm text-muted-foreground">{host.host_email}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${host.uses_custom_rate ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {translateUiText(host.uses_custom_rate ? "Custom rate" : "Default rate", language)}
                  </span>
                </div>
                <div><p className="text-xs text-muted-foreground">{translateUiText("Courts", language)}</p><p className="font-semibold">{host.listings_count}</p></div>
                <div><p className="text-xs text-muted-foreground">{translateUiText("Bookings", language)}</p><p className="font-semibold">{host.bookings_count}</p></div>
                <div><p className="text-xs text-muted-foreground">{translateUiText("Gross bookings", language)}</p><p className="font-semibold">{formatIQD(Number(host.gross_booking_value || 0))}</p></div>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">{translateUiText("Commission rate", language)}</label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={rateDrafts[host.host_user_id] ?? ""}
                        onChange={(event) => setRateDrafts((current) => ({ ...current, [host.host_user_id]: event.target.value }))}
                        className="h-11 rounded-xl pe-9"
                      />
                      <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
                    </div>
                  </div>
                  <Button className="h-11 rounded-xl px-4" onClick={() => saveHostCommission(host)} disabled={savingHostId === host.host_user_id}>
                    {savingHostId === host.host_user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span className="ms-2 hidden xl:inline">{translateUiText("Save", language)}</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
};

export default CommissionsManagement;
