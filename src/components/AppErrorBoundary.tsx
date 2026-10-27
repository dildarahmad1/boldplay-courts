import { translateUiText } from "@/lib/uiTranslations";
import type { AppLanguage } from "@/contexts/LanguageContext";
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** Keeps a visible recovery screen in place if a page crashes while rendering. */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Yarika page failed to render", error, info.componentStack);
  }

  componentDidMount() {
    document.getElementById("yarika-startup")?.remove();
  }

  render() {
    if (this.state.hasError) {
      let language: AppLanguage = "ckb";
      try {
        const saved = localStorage.getItem("boldplay-language");
        if (["en", "ar", "ckb", "kmr"].includes(saved || "")) language = saved as AppLanguage;
      } catch { /* Use the default language if browser storage is unavailable. */ }
      const t = (text: string) => translateUiText(text, language);
      return (
        <main dir={language === "en" ? "ltr" : "rtl"} className="grid min-h-screen place-items-center bg-[#f4f7f7] px-6 py-12 text-[#173e3d]">
          <section className="max-w-md text-center" role="alert">
            <p className="mb-2 text-3xl font-bold tracking-tight">Yarika</p>
            <h1 className="mb-3 text-xl font-semibold">{t("This page ran into a problem")}</h1>
            <p className="mb-6 text-sm leading-6 text-slate-600">{t("Your visit is safe. Reload the site to try again.")}</p>
            <button className="rounded-xl bg-[#176b66] px-5 py-3 font-semibold text-white" onClick={() => window.location.reload()}>
              {t("Reload site")}
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
