import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Star, ShieldCheck } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ReviewCardProps {
  review: {
    id: string;
    rating: number;
    text: string | null;
    created_at: string;
    profiles: {
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
    } | null;
  };
  truncated?: boolean;
  onShowMore?: (reviewId: string) => void;
  highlightId?: string;
}

export const ReviewCard = ({ review, truncated = true, onShowMore, highlightId }: ReviewCardProps) => {
  const { language } = useLanguage();
  const [isTextTruncated, setIsTextTruncated] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const firstName = review.profiles?.first_name || "Anonymous";
  const lastName = review.profiles?.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase();
  const locale = language === "ar" ? "ar-IQ" : language === "ckb" ? "ckb-IQ" : language === "kmr" ? "ku-Latn" : "en-US";
  const reviewDate = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(review.created_at));
  const isHighlighted = highlightId === review.id;

  useEffect(() => {
    if (truncated && textRef.current) {
      const lineHeight = parseInt(window.getComputedStyle(textRef.current).lineHeight);
      const maxHeight = lineHeight * 3;
      setIsTextTruncated(textRef.current.scrollHeight > maxHeight);
    }
  }, [truncated, review.text]);

  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isHighlighted]);

  return (
    <div
      ref={cardRef}
      className={`flex h-full flex-col rounded-2xl border bg-white p-5 transition-all duration-300 ${
        isHighlighted ? "border-emerald-500 bg-emerald-50/30 ring-4 ring-emerald-500/10" : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
      }`}
    >
      <div className="mb-5 flex items-center gap-3">
        <Avatar className="h-11 w-11 border border-slate-100 shadow-sm">
          <AvatarImage src={review.profiles?.avatar_url || undefined} />
          <AvatarFallback className="bg-slate-100 text-sm font-bold text-slate-700">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-slate-950">{fullName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Verified booking</p>
        </div>
        <p className="shrink-0 text-xs text-slate-400">{reviewDate}</p>
      </div>

      <div className="mb-3 flex items-center gap-1" aria-label={`${review.rating} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} className={`h-4 w-4 ${star <= Math.round(review.rating) ? "fill-amber-400 text-amber-400" : "fill-slate-100 text-slate-200"}`} />
        ))}
        <Badge variant="secondary" className="ms-2 rounded-full border-0 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{review.rating.toFixed(1)}</Badge>
      </div>

      {review.text && (
        <div>
          <p
            ref={textRef}
            className={`text-sm leading-6 text-slate-700 ${
              truncated ? "line-clamp-3" : ""
            }`}
          >
            {review.text}
          </p>
          {truncated && isTextTruncated && onShowMore && (
            <button
              onClick={() => onShowMore(review.id)}
              className="mt-3 text-sm font-bold text-emerald-700 hover:text-emerald-800 hover:underline"
            >
              Show more
            </button>
          )}
        </div>
      )}
    </div>
  );
};
