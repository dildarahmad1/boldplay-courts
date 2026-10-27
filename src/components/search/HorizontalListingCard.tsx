import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Trophy, Layers, Warehouse } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { formatIQD } from "@/lib/currency";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

interface HorizontalListingCardProps {
  listing: {
    id: string;
    cover_image: string;
    rating_avg: number;
    rating_count: number | null;
    base_price: number;
    city: string;
    country: string;
    type: string;
    size_sqft?: number;
    title: string;
    address?: string;
    guests_max: number;
    court_type?: string | null;
    surface_type?: string | null;
    is_indoor?: boolean | null;
  };
  dateRange?: DateRange;
}

const HorizontalListingCard = ({ listing, dateRange }: HorizontalListingCardProps) => {
  const [searchParams] = useSearchParams();
  const { language } = useLanguage();
  const translate = (value: string) => translateUiText(value, language).trim();


  return (
    <Link to={`/listing/${listing.id}?${searchParams.toString()}`}>
      <Card className="overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer bg-white border border-gray-200 rounded-2xl group p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Image Section */}
          <div className="w-full sm:w-[240px] h-[200px] flex-shrink-0 overflow-hidden rounded-xl">
            <img 
              src={listing.cover_image || "/placeholder.svg"} 
              alt={listing.title}
              onError={(e) => {
                e.currentTarget.src = "/placeholder.svg";
              }}
              className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300" 
            />
          </div>

          {/* Content Section */}
          <CardContent className="flex-1 p-0">
            {/* Top Row: Rating + Total Price */}
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-[#0F766E] text-white hover:bg-[#0F766E] font-semibold">
                  {Number(listing.rating_avg ?? 0).toFixed(1)}
                </Badge>
                <span className="text-sm text-gray-600">
                  {translate(`${listing.rating_count ?? 0} reviews`)}
                </span>
              </div>
              <div className="text-right">
                <p className="font-bold text-2xl text-gray-900">
                  {formatIQD(listing.base_price)}
                </p>
                <p className="text-sm text-muted-foreground">per hour</p>
              </div>
            </div>

            {/* Location Metadata Row - BEFORE Title */}
            <p className="text-sm text-gray-600 mb-1 capitalize">
              {translate(listing.city)}, {translate(listing.country)}
              {listing.court_type && ` • ${translate(listing.court_type.replace(/_/g, " "))}`}
              {listing.size_sqft ? ` • ${listing.size_sqft.toLocaleString()} ${translate("sq ft")}` : ""}
            </p>

            {/* Main Heading - listing.title (prominent) */}
            <h3 className="font-semibold text-lg text-gray-900 mb-3 line-clamp-2">
              {translate(listing.title)}
            </h3>

            {/* Specs Row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mb-3">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{translate(`Up to ${listing.guests_max} players`)}</span>
              </div>
              {listing.court_type && (
                <div className="flex items-center gap-1">
                  <Trophy className="h-4 w-4" />
                  <span className="capitalize">{translate(listing.court_type.replace(/_/g, " "))}</span>
                </div>
              )}
              {listing.surface_type && (
                <div className="flex items-center gap-1">
                  <Layers className="h-4 w-4" />
                  <span className="capitalize">{translate(listing.surface_type.replace(/_/g, " "))}</span>
                </div>
              )}
              {listing.is_indoor !== null && listing.is_indoor !== undefined && (
                <div className="flex items-center gap-1">
                  <Warehouse className="h-4 w-4" />
                  <span>{translate(listing.is_indoor ? "Indoor" : "Outdoor")}</span>
                </div>
              )}
            </div>

            {/* Date Range */}
            {dateRange?.from && (
              <p className="text-sm text-purple-600 font-medium">
                {format(dateRange.from, "MMM d")} - {dateRange.to ? format(dateRange.to, "MMM d, yyyy") : format(dateRange.from, "MMM d, yyyy")}
              </p>
            )}
          </CardContent>
        </div>
      </Card>
    </Link>
  );
};

export default HorizontalListingCard;
