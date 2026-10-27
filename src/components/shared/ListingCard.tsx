import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star, Users, Trophy, Layers, Warehouse } from "lucide-react";
import { formatIQD } from "@/lib/currency";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

interface ListingCardProps {
  listing: {
    id: string;
    cover_image: string;
    rating_avg: number | null;
    rating_count: number | null;
    base_price: number;
    city: string;
    country: string;
    type: string;
    size_sqft?: number;
    title: string;
    guests_max: number;
    court_type?: string | null;
    surface_type?: string | null;
    is_indoor?: boolean | null;
  };
}

const label = (value?: string | null) => (value ? value.replace(/_/g, " ") : null);

const ListingCard = ({ listing }: ListingCardProps) => {
  const [searchParams] = useSearchParams();
  const { language } = useLanguage();
  const translate = (value: string) => translateUiText(value, language).trim();

  return (
    <Link to={`/listing/${listing.id}?${searchParams.toString()}`} className="group block h-full">
      <Card className="flex h-full cursor-pointer flex-col overflow-hidden rounded-[1.5rem] border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
        <div className="relative aspect-[4/3] overflow-hidden">
            <img 
              src={listing.cover_image || "/placeholder.svg"} 
              alt={listing.title}
              onError={(e) => {
                e.currentTarget.src = "/placeholder.svg";
              }}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" 
            />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/65 to-transparent" />
            <Badge className="absolute left-4 top-4 gap-1 rounded-full border-0 bg-white px-2.5 py-1 text-slate-950 shadow-md hover:bg-white">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {Number(listing.rating_avg ?? 0).toFixed(1)}
              <span className="font-normal text-slate-500">({listing.rating_count ?? 0})</span>
            </Badge>
            <div className="absolute bottom-4 right-4 rounded-full bg-white px-3 py-1.5 text-slate-950 shadow-md">
              <span className="font-bold">{formatIQD(listing.base_price)}</span>
              <span className="ml-1 text-xs text-slate-500">/ hour</span>
            </div>
          </div>
        <CardContent className="flex flex-1 flex-col p-5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium capitalize text-slate-500">
            <MapPin className="h-3.5 w-3.5 flex-none text-primary" />
            {translate(listing.city)}, {translate(listing.country)}
            {label(listing.court_type) && ` • ${translate(label(listing.court_type)!)}`}
            {listing.size_sqft ? ` • ${listing.size_sqft.toLocaleString()} ${translate("sq ft")}` : ""}
          </p>

          {/* Title */}
          <p className="mb-4 line-clamp-2 text-lg font-semibold leading-snug tracking-tight text-slate-950 transition-colors group-hover:text-primary">
            {translate(listing.title)}
          </p>

          {/* Specs */}
          <div className="mt-auto flex flex-wrap gap-x-3 gap-y-2 border-t border-slate-100 pt-4 text-xs font-medium text-slate-500">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>{translate(`Up to ${listing.guests_max} players`)}</span>
            </div>
            {label(listing.court_type) && (
              <div className="flex items-center gap-1">
                <Trophy className="h-4 w-4" />
                <span className="capitalize">{translate(label(listing.court_type)!)}</span>
              </div>
            )}
            {label(listing.surface_type) && (
              <div className="flex items-center gap-1">
                <Layers className="h-4 w-4" />
                <span className="capitalize">{translate(label(listing.surface_type)!)}</span>
              </div>
            )}
            {listing.is_indoor !== null && listing.is_indoor !== undefined && (
              <div className="flex items-center gap-1">
                <Warehouse className="h-4 w-4" />
                <span>{translate(listing.is_indoor ? "Indoor" : "Outdoor")}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

export default ListingCard;
