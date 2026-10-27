import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { X } from "lucide-react";
import { formatIQD } from "@/lib/currency";
import type { AppLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { googleMapsSearchUrl } from "@/lib/googleMaps";

interface ListingPopupCardProps {
  listing: {
    id: string;
    title: string;
    city: string;
    country: string;
    base_price: number;
    cover_image?: string;
    images?: string[];
    latitude?: number | null;
    longitude?: number | null;
  };
  dateRange?: DateRange;
}

const ListingPopupCard = ({ listing, dateRange }: ListingPopupCardProps) => {
  // Map popups are mounted outside the React app tree, so they do not inherit
  // LanguageProvider. The provider keeps the document language in sync.
  const documentLanguage = document.documentElement.lang as AppLanguage;
  const language: AppLanguage = ["en", "ckb", "kmr", "ar"].includes(documentLanguage)
    ? documentLanguage
    : "en";
  const translate = (value: string) => translateUiText(value, language).trim();
  const imageUrl = listing.cover_image?.startsWith('http')
    ? listing.cover_image
    : supabase.storage
        .from('listing-images')
        .getPublicUrl(listing.cover_image || listing.images?.[0] || '').data.publicUrl;
  const googleMapsUrl = listing.latitude != null && listing.longitude != null
    ? googleMapsSearchUrl(Number(listing.latitude), Number(listing.longitude))
    : null;



  return (
    <div className="block w-52 bg-card rounded-lg shadow-lg overflow-hidden border border-border group">
      {/* Image */}
      <div className="relative overflow-hidden aspect-[3/2]">
        <img
          src={imageUrl}
          alt={listing.title}
          className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            e.currentTarget.src = '/placeholder.svg';
          }}
        />
        {/* Close button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="absolute top-2 right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform z-10"
          aria-label="Close popup"
        >
          <X className="w-3.5 h-3.5 text-gray-800" strokeWidth={2.5} />
        </button>
      </div>

      {/* Content */}
      <div className="p-2.5">
        <a href={`/listing/${listing.id}`} className="block">
          <h4 className="font-semibold text-sm line-clamp-2 text-foreground mb-1.5">
            {translate(listing.title)}
          </h4>
          <p className="text-sm text-foreground">
            <span className="font-bold">{formatIQD(listing.base_price)}</span>
            <span className="text-muted-foreground ml-1">{translate("per hour")}</span>
          </p>
        </a>
        {googleMapsUrl && <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-emerald-800 underline">
          {translate("Open in Google Maps")} ↗
        </a>}
      </div>
    </div>
  );
};

export default ListingPopupCard;
