import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { formatBookingWhen, formatDuration } from "@/lib/bookingTime";
import { formatIQD } from "@/lib/currency";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatTimeOfDay } from "@/lib/bookingTime";

export interface HostBookingDetails {
  id: string;
  listing_id: string;
  listing_title: string;
  guest_user_id: string;
  guest_name: string | null;
  guest_email: string;
  guest_avatar: string | null;
  checkin_date: string;
  checkout_date: string;
  nights: number;
  booking_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  hours?: number | null;
  guests: number;
  host_payout_gross: number;
  status: "confirmed" | "pending_payment" | "pending_host_confirmation" | "cancelled" | "completed" | "cancelled_guest" | "cancelled_host" | "expired";
  created_at: string;
  subtotal?: number | null;
  service_fee?: number | null;
  taxes?: number | null;
  total_price?: number | null;
  currency?: string | null;
  host_commission_amount?: number | null;
  host_payout_net?: number | null;
  notes?: string | null;
  pricing_breakdown?: { slots?: Array<{ start?: string; end?: string; price?: number }> } | null;
  cancellation_policy_snapshot?: { name?: string; description?: string; refund_percentage?: number; days_before_checkin?: number } | null;
}

interface Props {
  booking: HostBookingDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HostBookingDetailsDialog({ booking, open, onOpenChange }: Props) {
  const { language } = useLanguage();
  const t = (value: string) => translateUiText(value, language);
  if (!booking) return null;

  const hourly = Number(booking.hours ?? 0) > 0;
  const amount = (value: number | null | undefined) => formatIQD(Number(value ?? 0));
  const time = (value?: string | null) => formatTimeOfDay(value) || "—";
  const slots = booking.pricing_breakdown?.slots ?? [];
  const policy = booking.cancellation_policy_snapshot;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-3">
            <DialogTitle>{t("Booking details")}</DialogTitle>
            <StatusBadge status={booking.status} />
          </div>
          <DialogDescription>
            {t("Booking reference")}: BKG-{booking.id.slice(0, 8).toUpperCase()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <section className="space-y-2">
            <h3 className="font-semibold text-foreground">{t("Court and player")}</h3>
            <DetailRow label={t("Court")} value={booking.listing_title} />
            <DetailRow label={t("Player")} value={booking.guest_name || t("Player")} />
            {booking.guest_email && <DetailRow label={t("Email")} value={booking.guest_email} />}
            <DetailRow label={t("Booking date")} value={formatBookingWhen(booking)} />
            {hourly && <DetailRow label={t("Players")} value={String(booking.guests)} />}
            {!hourly && <DetailRow label={t("Guests") } value={String(booking.guests)} />}
          </section>

          {slots.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-semibold text-foreground">{t("Reserved time slots")}</h3>
              <div className="rounded-lg border divide-y">
                {slots.map((slot, index) => (
                  <div key={`${slot.start}-${index}`} className="flex justify-between gap-3 px-3 py-2">
                    <span dir="ltr">{time(slot.start)}–{time(slot.end)}</span>
                    <span>{amount(slot.price)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{formatDuration(booking)}</p>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="font-semibold text-foreground">{t("Payment details")}</h3>
            <DetailRow label={t("Subtotal")} value={amount(booking.subtotal ?? booking.host_payout_gross)} />
            <DetailRow label={t("Service fee")} value={amount(booking.service_fee)} />
            <DetailRow label={t("Taxes")} value={amount(booking.taxes)} />
            <Separator />
            <DetailRow label={t("Player total")} value={amount(booking.total_price ?? booking.host_payout_gross)} strong />
            <DetailRow label={t("Host commission")} value={amount(booking.host_commission_amount)} />
            <DetailRow label={t("Your net earnings")} value={amount(booking.host_payout_net ?? booking.host_payout_gross)} strong />
            <DetailRow label={t("Payment method")} value={t("Cash at the venue")} />
          </section>

          {booking.notes && (
            <section className="space-y-1">
              <h3 className="font-semibold text-foreground">{t("Player note")}</h3>
              <p className="rounded-lg bg-muted/50 p-3 whitespace-pre-wrap">{booking.notes}</p>
            </section>
          )}

          {policy && (
            <section className="space-y-1">
              <h3 className="font-semibold text-foreground">{t("Cancellation policy")}</h3>
              {policy.name && <p className="font-medium">{policy.name}</p>}
              {policy.description && <p className="text-muted-foreground">{policy.description}</p>}
              {policy.refund_percentage != null && <DetailRow label={t("Refund percentage")} value={`${policy.refund_percentage}%`} />}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className="max-w-[65%] text-end text-foreground">{value}</span>
    </div>
  );
}
