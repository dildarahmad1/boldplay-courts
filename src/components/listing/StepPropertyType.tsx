import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { ListingFormData } from "@/pages/host/CreateListing";
import FormInput from "./FormInput";
import VenueSuggestions from "./VenueSuggestions";
import FormSelect from "./FormSelect";
import FormTextarea from "./FormTextarea";

interface StepPropertyTypeProps {
  compact?: boolean;
  formData: ListingFormData;
  updateFormData: (data: Partial<ListingFormData>) => void;
}

export const COURT_TYPES = [
  { value: "football", label: "Football / Soccer" },
  { value: "padel", label: "Padel" },
  { value: "basketball", label: "Basketball" },
  { value: "tennis", label: "Tennis" },
  { value: "volleyball", label: "Volleyball" },
  { value: "multi_use", label: "Multi-use" },
  { value: "other", label: "Other" },
];

export const SURFACE_TYPES = [
  { value: "grass", label: "Natural grass" },
  { value: "artificial_turf", label: "Artificial turf" },
  { value: "hardwood", label: "Hardwood" },
  { value: "concrete", label: "Concrete" },
  { value: "clay", label: "Clay" },
  { value: "sand", label: "Sand" },
  { value: "rubber", label: "Rubber" },
  { value: "other", label: "Other" },
];

const INDOOR_OPTIONS = [
  { value: "false", label: "Outdoor" },
  { value: "true", label: "Indoor" },
];

const PLAYER_OPTIONS = Array.from({ length: 30 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

const StepPropertyType = ({ formData, updateFormData, compact = false }: StepPropertyTypeProps) => {
  const { language } = useLanguage();
  const t = (text: string) => translateUiText(text, language);
  return (
    <div className="space-y-6">
      <p className="text-base text-foreground">{t("Tell players what kind of court this is.")}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormSelect
          label="Sport / Court Type"
          value={formData.court_type}
          onChange={(value) => updateFormData({ court_type: value })}
          options={COURT_TYPES}
          required
        />
        {!compact && <VenueSuggestions formData={formData} updateFormData={updateFormData} />}
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormSelect
          label="Max Players"
          value={String(formData.guests_max)}
          onChange={(value) => updateFormData({ guests_max: parseInt(value) })}
          options={PLAYER_OPTIONS}
          required
        />
        <FormSelect
          label="Surface"
          value={formData.surface_type}
          onChange={(value) => updateFormData({ surface_type: value })}
          options={SURFACE_TYPES}
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormSelect
          label="Indoor or Outdoor"
          value={String(formData.is_indoor)}
          onChange={(value) => updateFormData({ is_indoor: value === "true" })}
          options={INDOOR_OPTIONS}
          required
        />
        {!compact && (
        <FormInput
          label="Court Size (sq ft)"
          placeholder="2000"
          value={formData.square_feet ? String(formData.square_feet) : ""}
          onChange={(value) => updateFormData({ square_feet: value ? parseInt(value) : 0 })}
          type="number"
        />
        )}
      </div>
      <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">{t("Add a description (optional)")}</summary><div className="pt-4">      <FormTextarea
        label="Description (optional)"
        placeholder="Floodlit artificial turf pitch with changing rooms and free parking."
        value={formData.description}
        onChange={(value) => updateFormData({ description: value })}
        rows={4}

      />
</div></details>
    </div>
  );
};

export default StepPropertyType;
