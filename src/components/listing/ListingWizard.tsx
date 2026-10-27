import { useState } from "react";
import type { ListingFormData } from "@/pages/host/CreateListing";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check, Loader2, MapPin, Save } from "lucide-react";
import StepBasics from "./StepBasics";
import StepPropertyType from "./StepPropertyType";
import StepDetails from "./StepDetails";
import StepPhotos from "./StepPhotos";
import StepPricing from "./StepPricing";
import StepRules from "./StepRules";
import StepAvailability from "./StepAvailability";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

const steps = ["Location", "Court & photos", "Price", "Review"];
const titles = ["Where is your court?", "Show players your court", "Set your hourly price", "Ready to publish?"];
const descriptions = [
  "Find your court by name to fill in its location, or add it yourself.",
  "A few details and a clear photo are all you need.",
  "Keep it simple. Extra rules and special dates are optional.",
  "Check the details below. Your court will be published immediately.",
];
interface Props {
  formData: ListingFormData;
  updateFormData: (data: Partial<ListingFormData>) => void;
  currentStep: number;
  loading: boolean;
  error: string | null;
  draftStatus: string;
  onNext: () => void;
  onBack: () => void;
  onSubmit: () => void;
  onSaveExit: () => void;
  onExit: () => void;
  onEdit: (step: number) => void;
}
export default function ListingWizard(props: Props) {
  const { formData, currentStep, loading, updateFormData } = props;
  const { language } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const t = (text: string) => translateUiText(text, language);
  const editing = { formData, updateFormData };
  const editButton = (step: number) => <Button variant="ghost" size="sm" onClick={() => props.onEdit(step)} aria-label={`${t("Edit")} ${t(steps[step])}`}>{t("Edit")}</Button>;
  return <main className="min-h-screen bg-slate-50 pb-8">
    <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={props.onExit} disabled={loading || uploading}><ArrowLeft className="me-2 h-4 w-4" />{t("My courts")}</Button>
        <Button variant="outline" onClick={props.onSaveExit} disabled={loading || uploading} className="rounded-full bg-white"><Save className="me-2 h-4 w-4" />{t("Save & exit")}</Button>
      </div>
      <div className="mb-7 flex items-center justify-between gap-1" aria-label={t("Publishing progress")}>
        {steps.map((step, index) => <div key={step} className="flex min-w-0 flex-1 items-center gap-2" aria-current={currentStep === index ? "step" : undefined}>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${index <= currentStep ? "bg-emerald-900 text-white" : "bg-slate-200 text-slate-500"}`}>{index < currentStep ? <Check className="h-4 w-4" /> : index + 1}</span>
          <span className={`hidden text-sm sm:block ${index === currentStep ? "font-semibold text-slate-900" : "text-slate-500"}`}>{t(step)}</span>
        </div>)}
      </div>
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 px-5 py-6 sm:px-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-800">{t("List your court")} · {currentStep + 1} / {steps.length}</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{t(titles[currentStep])}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{t(descriptions[currentStep])}</p>
        </header>
        <fieldset disabled={loading || uploading} className="min-w-0 space-y-7 px-5 py-6 sm:px-8">
          {currentStep === 0 && <StepBasics {...editing} />}
          {currentStep === 1 && <>
            <StepPropertyType {...editing} compact />
            <div className="border-t pt-6"><StepPhotos {...editing} onUploadingChange={setUploading} /></div>
            <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">{t("Facilities (optional)")}</summary><div className="pt-5"><StepDetails {...editing} /></div></details>
          </>}
          {currentStep === 2 && <>
            <StepPricing {...editing} compact />
            <div className="rounded-xl border p-4"><StepRules {...editing} compact /></div>
            <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">{t("Special prices & closed dates (optional)")}</summary><div className="pt-5"><p className="mb-4 text-sm text-muted-foreground">{t("Other dates use your hourly price. You can also manage dates later in Availability.")}</p><StepAvailability {...editing} /></div></details>
          </>}
          {currentStep === 3 && <>
            <div className="overflow-hidden rounded-2xl border">
              {formData.cover_image && <img src={formData.cover_image} alt={formData.title} className="aspect-[16/9] w-full object-cover" />}
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold" dir="auto">{formData.title}</h2><p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><MapPin className="h-4 w-4 shrink-0" />{formData.city}, {formData.country}</p></div>{editButton(0)}</div>
                <p className="text-sm text-slate-600" dir="auto">{formData.address}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-emerald-50 p-5"><div><p className="text-sm text-emerald-800">{t("Hourly price")}</p><p className="text-2xl font-bold text-emerald-950">{formData.base_price.toLocaleString()} IQD <span className="text-sm font-normal">/ {t("hour")}</span></p></div>{editButton(2)}</div>
            <div className="rounded-xl border p-5">
              <div className="flex items-center justify-between"><h3 className="font-semibold">{t("Court opening hours")}</h3>{editButton(2)}</div>
              <p className="mt-2 text-sm text-slate-600">{t("Opening time")}: {formData.opening_time} · {t("Closing time")}: {formData.closing_time}</p>
            </div>
            <div className="rounded-xl border p-5">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{t("Court details")}</h3>{editButton(1)}</div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-slate-500">{t("Sport")}</dt><dd className="mt-1 capitalize">{t(formData.court_type.replace(/_/g, " "))}</dd></div>
                <div><dt className="text-slate-500">{t("Players")}</dt><dd className="mt-1">{formData.guests_max}</dd></div>
                <div><dt className="text-slate-500">{t("Surface")}</dt><dd className="mt-1 capitalize">{t(formData.surface_type.replace(/_/g, " "))}</dd></div>
                <div><dt className="text-slate-500">{t("Setting")}</dt><dd className="mt-1">{t(formData.is_indoor ? "Indoor" : "Outdoor")}</dd></div>
              </dl>
              {formData.description && <p className="mt-4 whitespace-pre-line text-sm" dir="auto">{formData.description}</p>}
              {formData.amenities.length > 0 && <p className="mt-4 text-sm text-slate-600">{formData.amenities.map(t).join(" · ")}</p>}
              <p className="mt-4 text-sm text-slate-500">{1 + formData.images.length} {t("photos added")}</p>
            </div>
            {formData.house_rules && <div className="rounded-xl border p-5"><div className="flex items-center justify-between"><h3 className="font-semibold">{t("Court rules")}</h3>{editButton(2)}</div><p className="whitespace-pre-line text-sm" dir="auto">{formData.house_rules}</p></div>}
            {(formData.cancellation_policy_id || formData.availability_rules.length > 0) && <div className="rounded-xl border p-5">
              <div className="flex items-center justify-between"><h3 className="font-semibold">{t("Booking setup")}</h3>{editButton(2)}</div>
              {formData.cancellation_policy_id && <p className="mt-2 text-sm">{t("Cancellation Policy")}: {formData.cancellation_policy_name || t("Selected")}</p>}
              {formData.availability_rules.map(rule => <p key={rule.id} className="mt-2 text-sm">{rule.startDate} – {rule.endDate}: {rule.price === null ? t("Blocked") : `${rule.price.toLocaleString()} IQD / ${t("hour")}`}</p>)}
            </div>}
            <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{t("Publishing makes your court visible in search immediately. Admins can remove listings when necessary.")}</p>
          </>}
        </fieldset>
        <footer className="sticky bottom-0 z-[600] rounded-b-3xl border-t bg-white/95 px-5 py-4 backdrop-blur sm:px-8">
          {props.error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{t(props.error)}</p>}
          <div className="flex items-center justify-between gap-3">
            <div>{currentStep > 0 && <Button variant="ghost" onClick={props.onBack} disabled={loading || uploading}><ArrowLeft className="me-2 h-4 w-4" />{t("Back")}</Button>}</div>
            <Button onClick={currentStep === 3 ? props.onSubmit : props.onNext} disabled={loading || uploading} className="h-12 rounded-full bg-emerald-900 px-6 text-white hover:bg-emerald-800">
              {loading ? <><Loader2 className="me-2 h-4 w-4 animate-spin" />{t("Publishing...")}</> : <>{t(currentStep === 3 ? "Publish court" : currentStep === 2 ? "Review my court" : "Continue")}<ArrowRight className="ms-2 h-4 w-4" /></>}
            </Button>
          </div>
          <p className="mt-2 text-center text-xs text-slate-400" role="status">{t(props.draftStatus)}</p>
        </footer>
      </section>
    </div>
  </main>;
}
