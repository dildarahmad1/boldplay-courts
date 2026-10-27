import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const routes = [
  "search",
  "faq",
  "help-center",
  "support",
  "forgot-password",
  "change-password",
  "email-verified",
  "become-host",
  "checkout",
  "host/dashboard",
  "host/listings",
  "host/bookings",
  "host/availability",
  "host/payouts",
  "host/earnings-report",
  "host/inbox",
  "host/create-listing",
  "guest/dashboard",
  "guest/bookings",
  "guest/payments",
  "guest/inbox",
  "guest/profile",
  "guest/settings",
  "admin/dashboard",
  "admin/listings",
  "admin/bookings",
  "admin/disputes",
  "admin/users",
  "admin/transactions",
  "admin/commissions",
  "admin/reports",
  "admin/support",
  "admin/content",
];

const rootIndex = resolve("dist/index.html");
copyFileSync(rootIndex, resolve("dist/404.html"));

for (const route of routes) {
  const target = resolve("dist", route, "index.html");
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(rootIndex, target);
}

console.log(`Prepared GitHub Pages fallbacks for ${routes.length} routes.`);
