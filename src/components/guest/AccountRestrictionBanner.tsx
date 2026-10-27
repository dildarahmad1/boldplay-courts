import { useState } from "react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useGuestDebt } from "@/hooks/useGuestDebt";
import GuestDebtPaymentDialog from "./GuestDebtPaymentDialog";
import { formatIQD } from "@/lib/currency";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

const AccountRestrictionBanner = () => {
  const { language } = useLanguage();
  const { debts, hasOutstandingDebt, loading, error, refetch } = useGuestDebt();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (error) return <Alert className="mb-6"><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{translateUiText("Could not load your balance. Please try again.", language)}</span><Button variant="outline" size="sm" onClick={() => void refetch()}>{translateUiText("Try again", language)}</Button></AlertDescription></Alert>;
  if (loading || !hasOutstandingDebt) return null;

  const totalDebt = debts.reduce((sum, debt) => sum + Number(debt.amount), 0);
  const debtCount = debts.length;
  const restrictionMessage = translateUiText(
    `You have ${debtCount} outstanding ${debtCount === 1 ? "debt" : "debts"} totaling ${formatIQD(totalDebt)}. You must pay ${debtCount === 1 ? "this" : "these"} before making new bookings.`,
    language,
  );

  return (
    <>
      <Alert variant="destructive" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Account Restricted</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {restrictionMessage}
          </span>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              View Details
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              {translateUiText("Review balance", language)}
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      {dialogOpen && <GuestDebtPaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onPaymentSuccess={refetch}
      />}
    </>
  );
};

export default AccountRestrictionBanner;
