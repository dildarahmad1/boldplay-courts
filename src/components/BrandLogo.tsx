import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  inverted?: boolean;
}

const BrandMark = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 64 64"
    aria-hidden="true"
    className={cn("h-11 w-11 shrink-0 drop-shadow-sm", className)}
  >
    <rect x="4" y="4" width="56" height="56" rx="17" fill="hsl(var(--primary))" />
    <path d="M17 19h10l6 12 10-12h11L36 40l-3 10H22l5-16Z" fill="white" />
    <path d="M12 45h7M10 50h7" stroke="white" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const BrandLogo = ({ className, inverted = false }: BrandLogoProps) => (
  <Link
    to="/"
    aria-label="Yarika home"
    dir="ltr"
    className={cn("group inline-flex items-center gap-2.5", className)}
  >
    <BrandMark className="transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105" />
    <span className={cn(
      "font-display text-xl font-semibold leading-none tracking-[-0.055em] sm:text-[1.35rem]",
      inverted ? "text-white" : "text-foreground",
    )}>
      Yarika
    </span>
  </Link>
);

export { BrandMark };
