import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import venues from "@/data/kurdistan-venues.json";
import { venueName } from "@/lib/venueNames";
import { translateUiText } from "@/lib/uiTranslations";
import { googleMapsSearchUrl } from "@/lib/googleMaps";
import type { ListingFormData } from "@/pages/host/CreateListing";

const normalize = (text: string) => text.normalize("NFKD").toLowerCase()
  .replace(/[\u064b-\u065f\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/ي/g, "ی").replace(/ك/g, "ک");
const copy = {
  en: ["Court name", "Type a name or city", "Map suggestions, not verified listings. Check the pin and details before publishing.", "No matches. You can enter your own court name.", "Use this name without a suggestion", "mapped sports locations", "Map"],
  ar: ["اسم الملعب", "اكتب اسمًا أو مدينة", "اقتراحات من الخريطة وليست إعلانات موثقة. تحقق من الموقع والتفاصيل قبل النشر.", "لا توجد نتائج. يمكنك كتابة اسم ملعبك يدويًا.", "استخدم هذا الاسم دون اقتراح", "موقع رياضي على الخريطة", "الخريطة"],
  ckb: ["ناوی یاریگا", "ناو یان شار بنووسە", "پێشنیاری نەخشەن، نەک ڕیکلامی پشتڕاستکراو. پێش بڵاوکردنەوە شوێن و زانیارییەکان بپشکنە.", "ئەنجام نییە. دەتوانیت ناوی یاریگاکەت بنووسیت.", "ئەم ناوە بەبێ پێشنیار بەکاربهێنە", "شوێنی وەرزشی لە نەخشە", "نەخشە"],
  kmr: ["ناڤێ یاریگەهێ", "ناڤ یان باژێر بنڤیسە", "پێشنیارێن نەخشەیێ نە، نەک ڕیکلامێن پشتڕاستکری. بەری بەلاڤکرنێ جهـ و زانیاریان بپشکنە.", "ئەنجام نینن. دشێی ناڤێ یاریگەها خۆ بنڤیسی.", "ڤی ناڤی بێ پێشنیار بکاربینە", "جهێن وەرزشی ل نەخشەیێ", "نەخشە"],
};

export default function VenueSuggestions({ formData, updateFormData }: {
  formData: ListingFormData; updateFormData: (data: Partial<ListingFormData>) => void;
}) {
  const { language } = useLanguage();
  const t = copy[language];
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [browsing, setBrowsing] = useState(false);
  const [browseQuery, setBrowseQuery] = useState("");
  const [sportFilter, setSportFilter] = useState("");
  const browseResults = venues.venues.filter(v => normalize([v.name, ...Object.values(v.names), ...v.aliases, v.city, v.region].join(" ")).includes(normalize(browseQuery)) && (!sportFilter || (sportFilter === "soccer" ? v.sport.split(";").some(s => ["soccer", "football", "futsal"].includes(s)) : v.sport.split(";").includes(sportFilter))));
  const query = normalize(formData.title.trim());
  const results = venues.venues.filter(v =>
    query.split(/\s+/).filter(Boolean).every(token =>
      normalize([v.name, ...Object.values(v.names), ...v.aliases, v.city, v.region].join(" ")).includes(token)));
  const select = (venue: typeof venues.venues[number]) => {
    const sport = ({ soccer: "football", football: "football", futsal: "football", padel: "padel", basketball: "basketball", tennis: "tennis", volleyball: "volleyball", multi: "multi_use" } as Record<string, string>)[venue.sport.split(";")[0]];
    updateFormData({
      title: venue.name, latitude: venue.latitude, longitude: venue.longitude,
      country: "Iraq", city: venue.city || "", state: venue.region,
      address: venue.address || "", postal_code: "",
      city_id: null, state_region_id: null, country_id: null,
      ...(sport ? { court_type: sport } : {}),
    });
    setOpen(false);
    setBrowsing(false);
    setActive(-1);
  };
  const selected = venues.venues.find(v => v.name === formData.title && v.latitude === formData.latitude && v.longitude === formData.longitude);
  return <div className="relative space-y-2" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <Label htmlFor={id}>{t[0]}</Label>
    <Input id={id} value={selected ? venueName(selected, language) : formData.title} placeholder={t[1]} role="combobox" dir="auto"
      aria-autocomplete="list" aria-expanded={open}
      aria-controls={id + "-list"} aria-activedescendant={active >= 0 ? id + "-" + active : undefined}
      autoComplete="off" onFocus={() => setOpen(true)}
      onChange={event => { updateFormData({ title: event.target.value }); setOpen(true); setActive(-1); }}
      onKeyDown={event => {
        if (event.key === "Escape") setOpen(false);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          setActive(index => Math.max(0, Math.min(results.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
        }
        if (event.key === "Enter" && open && active >= 0 && results[active]) {
          event.preventDefault(); select(results[active]);
        }
      }} />
    <p className="text-xs leading-relaxed text-slate-500">{venues.venues.length} {t[5]} · {t[2]}</p>
    {selected && <a href={googleMapsSearchUrl(selected.latitude, selected.longitude) || selected.source} target="_blank" rel="noreferrer" className="block text-sm text-emerald-700 underline">{translateUiText("Open in Google Maps", language)} ↗</a>}
    {open && <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border bg-white shadow-lg">
      <p role="status" className="border-b px-4 py-2 text-xs text-slate-500">{results.length} / {venues.venues.length}</p>
      <div id={id + "-list"} role="listbox" className="max-h-64 overflow-y-auto overscroll-contain">
        {results.map((venue, index) => <button key={venue.id} id={id + "-" + index}
          role="option" aria-selected={active === index} type="button"
          onMouseDown={event => event.preventDefault()} onClick={() => select(venue)}
          className={"block w-full px-4 py-3 text-start hover:bg-emerald-50 " + (active === index ? "bg-emerald-50" : "")}>
          <span className="block font-medium" dir="auto" translate="no">{venueName(venue, language)}</span>
          <span className="block text-xs text-slate-500" dir="auto">{[venue.city, venue.region].filter(Boolean).map(value => translateUiText(value, language)).join(" · ")}</span>
        </button>)}
        {!results.length && <p className="p-4 text-sm text-slate-500">{t[3]}</p>}
      </div>
      <button type="button" onClick={() => setOpen(false)} className="w-full border-t px-4 py-3 text-start text-sm text-emerald-700">{t[4]}</button>
    </div>}
    <Button type="button" variant="link" className="h-auto px-0 text-emerald-800" onClick={() => setBrowsing(true)}>{translateUiText("Browse mapped courts", language)}</Button>
    <Dialog open={browsing} onOpenChange={setBrowsing}>
      <DialogContent className="max-h-[85dvh] max-w-xl overflow-hidden">
        <DialogHeader><DialogTitle>{translateUiText("Find your court", language)}</DialogTitle><DialogDescription>{t[2]}</DialogDescription></DialogHeader>
        <Input aria-label={t[1]} placeholder={t[1]} value={browseQuery} onChange={e => setBrowseQuery(e.target.value)} />
        <select aria-label={translateUiText("Sport", language)} value={sportFilter} onChange={e => setSportFilter(e.target.value)} className="h-10 rounded-lg border bg-white px-3 text-sm">
          <option value="">{translateUiText("All sports", language)}</option>
          <option value="soccer">{translateUiText("Football", language)}</option>
          <option value="padel">{translateUiText("Padel", language)}</option>
          <option value="basketball">{translateUiText("Basketball", language)}</option>
          <option value="tennis">{translateUiText("Tennis", language)}</option>
          <option value="volleyball">{translateUiText("Volleyball", language)}</option>
        </select>
        <p role="status" className="text-xs text-slate-500">{browseResults.length} {t[5]}</p>
        <div className="max-h-[42dvh] overflow-y-auto divide-y rounded-xl border">
          {browseResults.map(venue => <button type="button" key={venue.id} onClick={() => select(venue)} className="block w-full p-4 text-start hover:bg-emerald-50 focus:bg-emerald-50">
            <span className="block font-medium" dir="auto" translate="no">{venueName(venue, language)}</span>
            <span className="mt-1 block text-xs text-slate-500" dir="auto">{[venue.city, venue.region].filter(Boolean).map(value => translateUiText(value, language)).join(" · ")}</span>
          </button>)}
          {!browseResults.length && <p className="p-4 text-sm">{t[3]}</p>}
        </div>
        <Button variant="outline" onClick={() => setBrowsing(false)}>{translateUiText("Enter my court manually", language)}</Button>
      </DialogContent>
    </Dialog>
    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="block text-xs text-slate-400 underline">© OpenStreetMap contributors · ODbL · {venues.fetchedAt}</a>
  </div>;
}
