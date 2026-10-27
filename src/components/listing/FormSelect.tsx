import { useId } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface FormSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}

const FormSelect = ({ label, value, onChange, options, required = false }: FormSelectProps) => {
  const id = useId();
  const { language, direction } = useLanguage();
  const t = (text: string) => translateUiText(text, language);
  const hasValue = value && value.length > 0;

  return (
    <div className="relative">
      <Select dir={direction} value={value} onValueChange={onChange} required={required}>
        <SelectTrigger id={id} aria-label={t(label)} className="h-14 rounded-full px-6 border-[#D5DAE7] bg-white text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:border-primary peer">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-background">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {t(option.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label
        htmlFor={id}
        className={cn(
          "absolute start-6 top-1/2 -translate-y-1/2 text-base text-muted-foreground",
          "transition-all duration-200 pointer-events-none",
          hasValue && "top-0 start-4 text-xs bg-white px-2"
        )}
      >
        {t(label)}
      </label>
    </div>
  );
};

export default FormSelect;
