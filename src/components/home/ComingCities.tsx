import { Building2, MapPin, Mountain, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

const cities = [
  { name: "Duhok", icon: Mountain },
  { name: "Sulaymaniyah", icon: Building2 },
  { name: "Zakho", icon: Building2 },
  { name: "Halabja", icon: Mountain },
];

const ComingCities = () => {
  const { language, direction } = useLanguage();
  const text = (value: string) => translateUiText(value, language);

  return (
    <section className="bg-white py-10 sm:py-16" aria-labelledby="coming-cities-title" dir={direction}>
      <div className="container mx-auto px-4">
        <div className="relative isolate overflow-hidden rounded-3xl bg-emerald-950 px-5 py-8 text-white sm:p-10 lg:p-12">
          <div aria-hidden="true" className="pointer-events-none absolute -end-20 -top-24 -z-10 h-80 w-80 rounded-full border-[48px] border-emerald-900/70" />
          <div className="relative max-w-2xl">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-700 bg-emerald-900/70 px-3 py-1.5 text-sm font-medium text-emerald-100">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              {text("More cities. More games.")}
            </span>
            <h2 id="coming-cities-title" className="text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
              {text("Coming soon to your city")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-emerald-100/90 sm:text-lg">
              {text("Yarika is expanding. Court bookings in these cities are not open yet. Stay tuned!")}
            </p>
          </div>

          <ul className="relative mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {cities.map(({ name, icon: Icon }) => (
              <li key={name} className="flex min-w-0 flex-col items-start rounded-2xl border border-white/15 bg-white/[0.07] p-4 sm:p-6">
                <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-200/10 text-emerald-200">
                  <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={1.5} />
                </span>
                <h3 className="flex w-full min-w-0 items-start gap-1.5 text-lg font-semibold leading-snug sm:text-2xl">
                  <MapPin aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />
                  <span className="min-w-0 break-words">{text(name)}</span>
                </h3>
                <span className="mt-3 inline-flex rounded-full bg-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-950 sm:text-sm">
                  {text("Coming soon")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default ComingCities;
