import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: { id: string; status?: string } | null;
  onConfirm: () => void;
}

export const CancelBookingDialog = ({ open, onOpenChange, booking, onConfirm }: Props) => {
  const { language } = useLanguage();
  const t = (text: string) => translateUiText(text, language);
  if (!booking) return null;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t(booking.status === "pending_host_confirmation" ? "Cancel booking request?" : "Confirm Cancellation")}</AlertDialogTitle>
          <AlertDialogDescription className="text-base leading-7">{t("Cancelling releases your reserved court time. If you already paid at the venue, contact the host or support about any refund.")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">{t("Keep Booking")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("Yes, Cancel Booking")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
