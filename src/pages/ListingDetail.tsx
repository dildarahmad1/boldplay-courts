import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import BookingWidget from "@/components/booking/BookingWidget";
import LocationMap from "@/components/listing/LocationMap";
import Footer from "@/components/Footer";
import { ReviewsSection } from "@/components/listing/ReviewsSection";
import { ContactHostDialog } from "@/components/listing/ContactHostDialog";
import { AuthDialog } from "@/components/AuthDialog";
import { formatTimeOfDay } from "@/lib/bookingTime";
import {
  MapPin,
  Users,
  Trophy,
  Layers,
  Warehouse,
  Star,
  Home,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

interface Listing {
  id: string;
  title: string;
  description: string;
  type: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number;
  longitude: number;
  base_price: number;
  cleaning_fee: number;
  guests_max: number;
  min_nights: number;
  max_nights: number;
  min_hours: number | null;
  max_hours: number | null;
  slot_duration_minutes: number | null;
  opening_time: string | null;
  closing_time: string | null;
  court_type: string | null;
  surface_type: string | null;
  is_indoor: boolean | null;
  size_sqft: number;
  checkin_from: string;
  checkout_until: string;
  amenities: string[];
  cover_image: string;
  images: string[];
  house_rules: string;
  cancellation_policy_id: string;
  weekly_discount: number;
  monthly_discount: number;
  cancellation_policy: {
    name: string;
    description: string;
  };
  rating_avg: number;
  rating_count: number;
  host_user_id: string;
  profiles: {
    first_name: string;
    last_name: string;
    avatar_url: string;
    about: string;
  };
}

const ListingDetail = () => {
  const { language } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  useEffect(() => {
    const fetchListing = async () => {
      // First fetch the listing with policy details
      const { data: listingData, error: listingError } = await supabase
        .from("listings")
        .select(`
          *,
          cancellation_policy:cancellation_policies(name, description)
        `)
        .eq("id", id)
        .eq("status", "approved")
        .maybeSingle();

      if (listingError || !listingData) {
        toast({
          title: "Error",
          description: "Failed to load listing",
          variant: "destructive",
        });
        navigate("/search");
        setLoading(false);
        return;
      }

      // Then fetch the host profile
      const { data: profileData } = await supabase
        .from("public_profiles")
        .select("first_name, last_name, avatar_url, about")
        .eq("id", listingData.host_user_id)
        .maybeSingle();

      setListing({
        ...listingData,
        profiles: profileData || {}
      } as any);
      setLoading(false);
    };

    if (id) {
      fetchListing();
    }
  }, [id, navigate, toast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <Home className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Listing not found</h3>
            <Button onClick={() => navigate("/search")}>Browse Listings</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allImages = [listing.cover_image, ...listing.images].filter(Boolean);
  const hostName = `${listing.profiles?.first_name || ""} ${listing.profiles?.last_name || ""}`.trim() || "Host";

  return (
    <div className="public-page min-h-screen bg-slate-50">
      <div className="container mx-auto max-w-7xl px-4 py-8 sm:py-10">
        {/* Back Button */}
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-5 -ml-3 rounded-full px-3 text-slate-600 hover:bg-white hover:text-slate-950">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
          {/* Left Column - Details */}
          <div className="min-w-0 space-y-8">
            {/* Image Gallery */}
            <div className="space-y-3">
              <div className="group relative aspect-[16/10] w-full overflow-hidden rounded-[2rem] bg-slate-200 shadow-[0_20px_55px_rgba(15,23,42,0.15)] sm:aspect-video">
                <img
                  src={allImages[currentImageIndex]}
                  alt={translateUiText(listing.title, language)}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-slate-950/10" />
                <div className="absolute bottom-5 left-5 flex flex-wrap gap-2">
                  {listing.court_type && <Badge className="rounded-full border border-white/25 bg-white/95 px-3 py-1.5 capitalize text-slate-950 hover:bg-white">{listing.court_type.replace(/_/g, " ")}</Badge>}
                  <Badge className="rounded-full border border-white/25 bg-slate-950/55 px-3 py-1.5 text-white backdrop-blur-md hover:bg-slate-950/65">{listing.is_indoor ? "Indoor" : "Outdoor"}</Badge>
                </div>
                {allImages.length > 1 && (
                  <>
                    {/* Previous Button */}
                    <button
                      onClick={() => setCurrentImageIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1))}
                      className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2.5 text-foreground opacity-100 shadow-lg transition-all duration-300 hover:scale-105 hover:bg-white sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    
                    {/* Next Button */}
                    <button
                      onClick={() => setCurrentImageIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1))}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2.5 text-foreground opacity-100 shadow-lg transition-all duration-300 hover:scale-105 hover:bg-white sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>

                    {/* Image Counter */}
                    <div className="absolute bottom-5 right-5 rounded-full border border-white/20 bg-slate-950/60 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-md">
                      {currentImageIndex + 1} / {allImages.length}
                    </div>
                  </>
                )}
              </div>
              {allImages.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {allImages.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`aspect-[4/3] w-24 flex-none overflow-hidden rounded-xl border-2 transition-all sm:w-28 ${
                        idx === currentImageIndex
                          ? "border-primary"
                          : "border-transparent hover:border-border"
                      }`}
                    >
                      <img
                        src={img}
                        alt={`${translateUiText(listing.title, language)} ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Header Section - Outside Gray Container */}
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              {/* Rating - First */}
              {listing.rating_avg > 0 && (
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-900"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{Number(listing.rating_avg ?? 0).toFixed(1)}</span>
                  <span className="text-slate-500">{translateUiText(`${listing.rating_count} ${listing.rating_count === 1 ? "review" : "reviews"}`, language)}</span>
                </div>
              )}
              
              {/* Main Title */}
              <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl">{listing.title}</h1>
              
              {/* Key Specs */}
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <span className="flex min-w-0 items-center gap-2 rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-700">
                  <MapPin className="h-4 w-4 flex-none text-primary" />
                  <span className="truncate">{listing.city}</span>
                </span>
                {listing.size_sqft && (
                  <span className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-700"><Home className="h-4 w-4 flex-none text-primary" />{listing.size_sqft} sq ft</span>
                )}
                <span className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-700">
                  <Users className="h-4 w-4 flex-none text-primary" /> Up to 25 players
                </span>
                {listing.court_type && (
                  <span className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-sm font-medium capitalize text-slate-700"><Trophy className="h-4 w-4 flex-none text-primary" />{listing.court_type.replace(/_/g, " ")}</span>
                )}
                {listing.surface_type && (
                  <span className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-sm font-medium capitalize text-slate-700"><Layers className="h-4 w-4 flex-none text-primary" />{listing.surface_type.replace(/_/g, " ")}</span>
                )}
                <span className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-700"><Warehouse className="h-4 w-4 flex-none text-primary" />{listing.is_indoor ? "Indoor" : "Outdoor"}</span>
                <span className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-700"><Clock3 className="h-4 w-4 flex-none text-primary" />{listing.opening_time ? formatTimeOfDay(listing.opening_time) : "08:00"}</span>
              </div>
            </div>

            {/* Consolidated Content Block */}
            <div className="space-y-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">

              {/* About this property */}
              {listing.description && (
                <>
                  <div>
                    <h3 className="mb-4 text-2xl font-semibold tracking-tight">About this court</h3>
                    <p className="whitespace-pre-wrap leading-7 text-slate-600">
                      {listing.description}
                    </p>
                  </div>
                  <Separator />
                </>
              )}

              {/* Amenities */}
              {listing.amenities && listing.amenities.length > 0 && (
                <>
                  <div>
                    <h3 className="mb-4 text-2xl font-semibold tracking-tight">Amenities</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {listing.amenities.map((amenity) => (
                        <div key={amenity} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                          <span>{amenity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* House Rules */}
              <div>
                <h3 className="mb-4 text-2xl font-semibold tracking-tight">Rules</h3>
                {listing.house_rules && (
                  <>
                    <p className="text-foreground mb-3">When playing at this court, please follow these rules:</p>
                    <ul className="list-disc list-inside space-y-2 text-foreground mb-4">
                      {listing.house_rules.split('\n').filter(rule => rule.trim()).map((rule, idx) => (
                        <li key={idx}>{rule.trim()}</li>
                      ))}
                    </ul>
                  </>
                )}
                <ul className="list-disc list-inside space-y-2 text-foreground">
                  <li>Open from {listing.opening_time ? formatTimeOfDay(listing.opening_time) : '08:00'} to {listing.closing_time ? formatTimeOfDay(listing.closing_time) : '22:00'}.</li>
                </ul>
              </div>
              
              <Separator />

              {/* Cancellation Policy */}
              <div>
                <h3 className="mb-4 text-2xl font-semibold tracking-tight">Cancellation policy</h3>
                <p className="text-foreground">
                  {listing.cancellation_policy?.description || "Contact host for cancellation policy details."}
                </p>
              </div>

            </div>

            {/* Property Location Section */}
            <div className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-semibold tracking-tight">Court location</h2>
              
              {listing.latitude != null && listing.longitude != null && (
                <LocationMap 
                  latitude={listing.latitude} 
                  longitude={listing.longitude}
                />
              )}
              
              <div className="flex items-center gap-2 text-foreground">
                <MapPin className="h-5 w-5 flex-shrink-0" />
                <span>
                  {[
                    listing.address,
                    listing.city,
                    listing.state,
                    listing.postal_code,
                    listing.country
                  ].filter(Boolean).map((part) => translateUiText(String(part), language)).join(', ')}
                </span>
              </div>
            </div>

            {/* Reviews Section */}
            <ReviewsSection
              listingId={listing.id}
              averageRating={listing.rating_avg || 0}
              reviewCount={listing.rating_count || 0}
            />

            {/* Host Info - Separate Container */}
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h3 className="mb-5 text-2xl font-semibold tracking-tight">Meet your host</h3>
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16 border-4 border-primary/10">
                  <AvatarImage src={listing.profiles?.avatar_url} />
                  <AvatarFallback>
                    {hostName.split(" ").map((n) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h4 className="font-semibold text-lg mb-1">{hostName}</h4>
                  {listing.profiles?.about && (
                    <p className="text-muted-foreground mb-3">{listing.profiles.about}</p>
                  )}
                  {user?.id !== listing.host_user_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full bg-white px-5"
                      onClick={() => {
                        if (!user) {
                          setAuthDialogOpen(true);
                        } else {
                          setContactDialogOpen(true);
                        }
                      }}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Contact Host
                    </Button>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* Right Column - Booking Widget */}
          <div>
            <div className="sticky top-24 self-start">
              <BookingWidget listing={listing} />
            </div>
          </div>
        </div>

      </div>

      {/* Footer */}
      <Footer />

      {/* Contact Host Dialog */}
      {listing && (
        <ContactHostDialog
          open={contactDialogOpen}
          onOpenChange={setContactDialogOpen}
          listingId={listing.id}
          hostId={listing.host_user_id}
          listingTitle={listing.title}
        />
      )}

      {/* Auth Dialog for non-logged-in users */}
      <AuthDialog 
        open={authDialogOpen} 
        onOpenChange={setAuthDialogOpen} 
      />
    </div>
  );
};

export default ListingDetail;
