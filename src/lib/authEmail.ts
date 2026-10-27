import type { AppLanguage } from "@/contexts/LanguageContext";

export const authRedirectUrl = (page: "forgot-password" | "email-verified", language: AppLanguage) => {
  const url = new URL(`${import.meta.env.BASE_URL}${page}`, window.location.origin);
  url.searchParams.set("lang", language);
  if (page === "forgot-password") url.searchParams.set("mode", "recovery");
  return url.toString();
};

export const authEmailError = (error: unknown): string => {
  const code = (error as { code?: string })?.code;
  const status = (error as { status?: number })?.status;
  if (status === 429 || code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "Too many email requests. Please wait a few minutes before trying again.";
  if (code === "email_address_not_authorized" || status === 500 || code === "unexpected_failure") return "Email delivery is currently unavailable. Please contact support.";
  return "Could not send the email. Check your connection and try again.";
};
