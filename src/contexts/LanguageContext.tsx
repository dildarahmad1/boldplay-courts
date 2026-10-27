import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AppLanguage = "en" | "ckb" | "kmr" | "ar";

const languageOptions = [
  { code: "en" as const, short: "EN", label: "English", dir: "ltr" as const },
  { code: "ckb" as const, short: "کوردی", label: "کوردی سۆرانی", dir: "rtl" as const },
  { code: "kmr" as const, short: "بادینی", label: "کوردی بادینی", dir: "rtl" as const },
  { code: "ar" as const, short: "عربي", label: "العربية", dir: "rtl" as const },
];

const translations = {
  en: {
    home: "Home", listCourt: "List Your Court", help: "Help Center", dashboard: "Dashboard", account: "Account", myAccount: "My Account", myBookings: "My Bookings", venueDashboard: "Venue Dashboard", adminDashboard: "Admin Dashboard", logout: "Log out", menu: "Menu", ready: "Ready for your next game?",
    join: "Join Yarika", eyebrow: "Kurdistan's sports booking platform",
    title: "Find your court. Own the moment.", subtitle: "Book football, padel, basketball and more across the Kurdistan Region in just a few clicks.",
    location: "City or area", dates: "Select dates", players: "Players", find: "Find a court",
  },
  ckb: {
    home: "سەرەکی", listCourt: "یاریگاکەت تۆمار بکە", help: "ناوەندی یارمەتی", dashboard: "داشبۆرد", account: "هەژمار", myAccount: "هەژماری من", myBookings: "رزێرڤەکانم", venueDashboard: "داشبۆردی یاریگا", adminDashboard: "داشبۆردی بەڕێوەبەر", logout: "چوونەدەرەوە", menu: "مێنیو", ready: "ئامادەی یاریی داهاتووتیت؟",
    join: "بەشداری Yarika بکە", eyebrow: "پلاتفۆرمی رزێرڤکردنی وەرزش لە کوردستان",
    title: "یاریگاکەت بدۆزەوە. ساتەکە هی تۆیە.", subtitle: "یاریگای تۆپی پێ، پادێل، باسکە و وەرزشی زیاتر لە هەرێمی کوردستان بە چەند کرتەیەک رزێرڤ بکە.",
    location: "شار یان ناوچە", dates: "بەروار هەڵبژێرە", players: "یاریزان", find: "یاریگا بدۆزەوە",
  },
  kmr: {
    home: "سەرەکی", listCourt: "یاریگەها خۆ تۆمار بکە", help: "ناڤەندا هاریکاریا", dashboard: "داشبۆرد", account: "هەژمار", myAccount: "هەژمارا من", myBookings: "حجزێن من", venueDashboard: "داشبۆردا یاریگەهێ", adminDashboard: "داشبۆردا بەڕێڤەبەری", logout: "دەرکەفتن", menu: "مێنیو", ready: "تو بۆ یاریا داهاتی ئامادەیی؟",
    join: "بەشداری Yarika ببە", eyebrow: "پلاتفۆرما حجزکرنا وەرزشێ ل کوردستانێ",
    title: "یاریگەها خۆ ببینە. دەما تەیە.", subtitle: "یاریگەهێن فوتبۆل، پادێل، باسکەت و وەرزشێن دی ل هەرێما کوردستانێ ب ساناهی حجز بکە.",
    location: "باژێر یان ناڤچە", dates: "دەم هەلبژێرە", players: "یاریزان", find: "یاریگەهێ ببینە",
  },
  ar: {
    home: "الرئيسية", listCourt: "أضف ملعبك", help: "مركز المساعدة", dashboard: "لوحة التحكم", account: "الحساب", myAccount: "حسابي", myBookings: "حجوزاتي", venueDashboard: "لوحة إدارة الملعب", adminDashboard: "لوحة الإدارة", logout: "تسجيل الخروج", menu: "القائمة", ready: "هل أنت مستعد لمباراتك القادمة؟",
    join: "انضم إلى Yarika", eyebrow: "منصة حجز الرياضة في إقليم كردستان",
    title: "اعثر على ملعبك. واصنع لحظتك.", subtitle: "احجز ملاعب كرة القدم والبادل والسلة والمزيد في إقليم كردستان بخطوات بسيطة.",
    location: "المدينة أو المنطقة", dates: "اختر التاريخ", players: "اللاعبون", find: "ابحث عن ملعب",
  },
};

type TranslationKey = keyof typeof translations.en;

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  options: typeof languageOptions;
  direction: "ltr" | "rtl";
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const saved = localStorage.getItem("boldplay-language") as AppLanguage | null;
    return languageOptions.some((option) => option.code === saved) ? saved! : "ckb";
  });

  const setLanguage = (nextLanguage: AppLanguage) => {
    localStorage.setItem("boldplay-language", nextLanguage);
    setLanguageState(nextLanguage);
  };

  const direction = languageOptions.find((option) => option.code === language)?.dir || "ltr";

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [direction, language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    options: languageOptions,
    direction,
    t: (key: TranslationKey) => translations[language][key],
  }), [direction, language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
};
