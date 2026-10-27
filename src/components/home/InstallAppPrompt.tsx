import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & { prompt: () => Promise<void> };
type InstallWindow = Window & { __yarikaInstallPrompt?: InstallPromptEvent | null };

const DISMISSED_KEY = "yarika-install-dismissed";

const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Phone-only banner on the home page: native install on Android/Chrome, Share-sheet steps on iPhone. */
const InstallAppPrompt = () => {
  const [installEvent, setInstallEvent] = useState(() => (window as InstallWindow).__yarikaInstallPrompt ?? null);
  // Session-scoped so the prompt returns on the next visit until the app is installed.
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISSED_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    const onPrompt = (event: Event) => setInstallEvent(event as InstallPromptEvent);
    const onInstalled = () => setDismissed(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const isPhone = window.matchMedia("(pointer: coarse) and (max-width: 767px)").matches;
  const isIphone = /iphone|ipod/i.test(navigator.userAgent);
  if (dismissed || !isPhone || isInstalled() || (!installEvent && !isIphone)) return null;

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISSED_KEY, "1"); } catch { /* storage unavailable */ }
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    // A prompt event can only be used once.
    (window as InstallWindow).__yarikaInstallPrompt = null;
    setInstallEvent(null);
  };

  return (
    <aside aria-labelledby="install-app-title" className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl md:hidden">
      <div className="flex items-start gap-3">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="h-12 w-12 flex-none rounded-xl" />
        <div className="min-w-0 flex-1">
          <p id="install-app-title" className="font-semibold text-slate-950">Install Yarika</p>
          <p className="mt-1 text-sm text-slate-600">Add Yarika to your home screen to book courts faster, like an app.</p>
          {installEvent ? (
            <Button type="button" size="sm" className="mt-3 rounded-full" onClick={install}>
              <Download className="me-2 h-4 w-4" aria-hidden="true" />Install app
            </Button>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-slate-800">
              <Share className="h-4 w-4 flex-none" aria-hidden="true" />Tap Share, then Add to Home Screen.
            </p>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 flex-none" aria-label="Close" onClick={dismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
};

export default InstallAppPrompt;
