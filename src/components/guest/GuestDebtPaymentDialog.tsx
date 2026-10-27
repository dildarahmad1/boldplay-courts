import { useNavigate } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGuestDebt } from "@/hooks/useGuestDebt";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { formatIQD } from "@/lib/currency";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; onPaymentSuccess?: () => void }

export default function GuestDebtPaymentDialog({ open, onOpenChange, onPaymentSuccess }: Props) {
  const { debts, loading, error, refetch } = useGuestDebt();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const t = (text: string) => translateUiText(text, language);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader><DialogTitle>{t("Outstanding balance")}</DialogTitle><DialogDescription className="leading-6">{t("Contact support to review this balance and arrange payment. Any payment must be verified before the balance is cleared.")}</DialogDescription></DialogHeader>
        {loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : error ? <p role="alert" className="text-sm text-red-700">{t("Could not load your balance. Please try again.")}</p> : debts.length ? <ul className="space-y-3">{debts.map(debt => <li key={debt.id} className="rounded-xl border bg-slate-50 p-4"><p className="font-medium">{debt.bookings?.listings?.title || t("Booking")}</p><p className="mt-1 text-sm leading-6 text-slate-500">{debt.reason || debt.disputes?.subject}</p><p className="mt-3 inline-block font-semibold" dir="ltr">{formatIQD(debt.amount)}</p></li>)}</ul> : <p className="text-sm text-slate-500">{t("No outstanding balance")}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={loading} className="min-h-11" onClick={async () => { await refetch(); onPaymentSuccess?.(); }}><RefreshCw className="me-2 h-4 w-4" />{t("Refresh balance")}</Button>
          <Button className="min-h-11" onClick={() => { onOpenChange(false); navigate("/guest/inbox"); }}>{t("Contact Support")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
