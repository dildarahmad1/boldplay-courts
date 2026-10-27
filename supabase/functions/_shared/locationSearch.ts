const groups = [
  ["Erbil", "Arbil", "Hawler", "Hewler", "هەولێر", "هەولیر", "أربيل", "اربيل", "اربیل"],
  ["Sulaymaniyah", "Sulaimani", "Slemani", "سلێمانی", "السليمانية", "سليمانية"],
  ["Duhok", "Dohuk", "دهۆک", "دهوك", "دهۆك"],
  ["Halabja", "هەڵەبجە", "حلبجة"],
  ["Kirkuk", "کەرکووک", "كركوك"],
  ["Zakho", "زاخۆ", "زاخو"],
  ["Soran", "سۆران", "سوران"],
  ["Shaqlawa", "شەقڵاوە", "شقلاوة"],
  ["Akre", "Aqrah", "ئاکرێ", "عقرة"],
  ["Amedi", "Amadiya", "ئامێدی", "العمادية"],
  ["Rawanduz", "ڕەواندز", "راوندوز"],
  ["Koya", "Koysinjaq", "کۆیە", "كويسنجق"],
  ["Choman", "چۆمان", "جومان"],
  ["Mergasor", "مێرگەسۆر", "ميركسور"],
  ["Salahaddin", "سەلاحەدین", "صلاح الدين"],
  ["Harir", "هەریر", "حرير"],
  ["Ranya", "ڕانیە", "رانية"],
  ["Qaladiza", "قەڵادزێ", "قلعة دزة"],
  ["Dukan", "دووکان", "دوكان"],
  ["Chamchamal", "چەمچەماڵ", "جمجمال"],
  ["Kalar", "کەلار", "كلار"],
  ["Darbandikhan", "دەربەندیخان", "دربندخان"],
  ["Penjwen", "پێنجوێن", "بنجوين"],
  ["Said Sadiq", "سەید سادق", "سيد صادق"],
  ["Sharbazher", "شارباژێڕ", "شهربازير"],
  ["Kifri", "کفری", "كفري"],
  ["Khanaqin", "خانەقین", "خانقين"],
  ["Bardarash", "بەردەڕەش", "بردرش"],
  ["Semel", "Sumel", "سێمێل", "سميل"],
  ["Shekhan", "شێخان", "شيخان"],
  ["Makhmur", "مەخموور", "مخمور"],
  ["Altun Kupri", "پردێ", "التون كوبري"],
  ["Iraq", "عێراق", "عيراق", "عراق", "العراق"],
  ["Kurdistan Region", "Kurdistan", "هەرێمی کوردستان", "کوردستان", "إقليم كردستان", "كردستان"],
];
export const normalizePlaceName = (value: string) => value.normalize("NFC").toLocaleLowerCase()
  .replace(/[أإآ]/g, "ا").replace(/ك/g, "ک").replace(/ي/g, "ی").replace(/[\u064b-\u065fـ]/g, "")
  .replace(/\s+/g, " ").trim();
const aliases = groups.map(group => group.map(normalizePlaceName));
export const locationAliases = (value: string) => {
  const name = normalizePlaceName(value.split(/[,،]/)[0]);
  return aliases.find(group => group.includes(name)) || [name];
};
export const matchesLocation = (listing: { city?: string | null; state?: string | null; country?: string | null }, query: string) => {
  if (!query.trim()) return true;
  const names = locationAliases(query);
  return [listing.city, listing.state, listing.country].some(field => {
    const normalized = normalizePlaceName(field || "");
    return names.some(name => name.length > 0 && normalized.includes(name));
  });
};
