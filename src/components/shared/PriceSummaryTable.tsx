import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { formatIQD } from "@/lib/currency";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

interface PriceSummaryTableProps {
  base_price: number;
  cleaning_fee: number;
}

const PriceSummaryTable = ({ base_price, cleaning_fee }: PriceSummaryTableProps) => {
  const { language } = useLanguage();
  const [taxRate, setTaxRate] = useState(0.10);
  const [guestServiceFeeRate, setGuestServiceFeeRate] = useState(0.08);
  const [hostCommissionRate, setHostCommissionRate] = useState(0.05);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRates = async () => {
      const { data: settings } = await supabase
        .from("platform_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["default_tax_rate", "default_guest_service_fee_rate", "default_host_commission_rate"])
        .eq("is_active", true);

      if (settings) {
        const taxRateData = settings.find(s => s.setting_key === "default_tax_rate");
        const serviceFeeRateData = settings.find(s => s.setting_key === "default_guest_service_fee_rate");
        const hostCommissionRateData = settings.find(s => s.setting_key === "default_host_commission_rate");
        
        if (taxRateData) setTaxRate(parseFloat(taxRateData.setting_value));
        if (serviceFeeRateData) setGuestServiceFeeRate(parseFloat(serviceFeeRateData.setting_value));
        if (hostCommissionRateData) setHostCommissionRate(parseFloat(hostCommissionRateData.setting_value));
      }
      setLoading(false);
    };
    fetchRates();
  }, []);

  const hours = 1;
  const subtotal = base_price * hours;
  const taxes = subtotal * taxRate;
  const platformFee = subtotal * guestServiceFeeRate;
  const totalGuest = subtotal + cleaning_fee + taxes + platformFee;
  const hostPayoutGross = subtotal + cleaning_fee;
  const hostCommissionAmount = hostPayoutGross * hostCommissionRate;
  const hostPayout = hostPayoutGross - hostCommissionAmount;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="rounded-lg overflow-hidden min-w-[600px] sm:min-w-0" style={{ borderWidth: '1px', borderColor: '#D5DAE7' }}>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-transparent border-b" style={{ borderBottomColor: '#D5DAE7' }}>
              <th className="text-left p-2 md:p-3 font-medium text-xs md:text-sm">Item</th>
              <th className="text-left p-2 md:p-3 font-medium text-xs md:text-sm">Calculation</th>
              <th className="text-right p-2 md:p-3 font-medium text-xs md:text-sm">Amount (IQD)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-table-stripe">
              <td className="p-2 md:p-3">Base price</td>
              <td className="p-2 md:p-3">{formatIQD(base_price)} × {hours} hour</td>
              <td className="p-2 md:p-3 text-right">{formatIQD(subtotal)}</td>
            </tr>
            {cleaning_fee > 0 && (
              <tr className="border-t border-table-stripe bg-table-stripe">
                <td className="p-2 md:p-3">Additional fee</td>
                <td className="p-2 md:p-3">Fixed</td>
                <td className="p-2 md:p-3 text-right">{formatIQD(cleaning_fee)}</td>
              </tr>
            )}
            <tr className="border-t border-table-stripe">
              <td className="p-2 md:p-3">{translateUiText(`Taxes (${(taxRate * 100).toFixed(0)}%)`, language)}</td>
              <td className="p-2 md:p-3">Auto-applied</td>
              <td className="p-2 md:p-3 text-right">{formatIQD(taxes)}</td>
            </tr>
            <tr className="border-t border-table-stripe bg-table-stripe">
              <td className="p-2 md:p-3">Platform fee (guest side)</td>
              <td className="p-2 md:p-3">{translateUiText(`${(guestServiceFeeRate * 100).toFixed(0)}% service charge`, language)}</td>
              <td className="p-2 md:p-3 text-right">{formatIQD(platformFee)}</td>
            </tr>
            <tr className="border-t border-table-stripe">
              <td className="p-2 md:p-3 font-medium">Total (guest pays)</td>
              <td className="p-2 md:p-3"></td>
              <td className="p-2 md:p-3 text-right font-medium">
                {formatIQD(totalGuest)}
              </td>
            </tr>
            <tr className="border-t border-table-stripe bg-table-stripe">
              <td className="p-2 md:p-3 text-xs md:text-sm font-bold">{translateUiText(`Host payout (after host fee ${(hostCommissionRate * 100).toFixed(0)}%)`, language)}</td>
              <td className="p-2 md:p-3 text-xs md:text-sm">({formatIQD(subtotal)} + {formatIQD(cleaning_fee)}) − {(hostCommissionRate * 100).toFixed(0)}%</td>
              <td className="p-2 md:p-3 text-right text-xs md:text-sm font-bold">
                {formatIQD(hostPayout)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PriceSummaryTable;
