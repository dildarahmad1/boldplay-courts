import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDemoData } from "@/hooks/useDemoData";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, ArrowLeft } from "lucide-react";
import StepBasics from "@/components/listing/StepBasics";
import StepPropertyType from "@/components/listing/StepPropertyType";
import StepDetails from "@/components/listing/StepDetails";
import StepPhotos from "@/components/listing/StepPhotos";
import StepRules from "@/components/listing/StepRules";
import StepPricing from "@/components/listing/StepPricing";
import StepReview from "@/components/listing/StepReview";
import StepAvailability from "@/components/listing/StepAvailability";
import FeedbackBlock from "@/components/listing/FeedbackBlock";
import type { ListingFormData } from "./CreateListing";

const STEPS = ["Address", "Court Details", "Photos", "Amenities", "Rules", "Pricing", "Availability", "Review"];

// Map editing steps to admin feedback sections
const STEP_TO_FEEDBACK_SECTION: Record<number, {
  key: string;
  displayName: string;
} | null> = {
  0: { key: "map", displayName: "Location & Map" },
  1: { key: "title_description", displayName: "Title & Description" },
  2: { key: "photos", displayName: "Photos" },
  3: null, // StepDetails (Amenities) - no feedback
  4: { key: "rules", displayName: "House Rules" },
  5: { key: "price_summary", displayName: "Pricing" },
  6: null, // StepAvailability - no feedback
  7: null, // StepReview - handled separately
};

const EditListing = () => {
  const { id } = useParams();
  const { language } = useLanguage();
  const { user } = useAuth();
  const { isDemoMode, getListing, updateListing, getAvailabilityRules, updateAvailabilityRules, getModerationFeedback, resolveFeedback, migrationComplete } = useDemoData();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [listingStatus, setListingStatus] = useState<string>("");
  const [adminFeedback, setAdminFeedback] = useState<{
    photos?: { status: "approved" | "rejected"; comment: string | null };
    title_description?: { status: "approved" | "rejected"; comment: string | null };
    price_summary?: { status: "approved" | "rejected"; comment: string | null };
    rules?: { status: "approved" | "rejected"; comment: string | null };
    map?: { status: "approved" | "rejected"; comment: string | null };
  }>({});
  const [formData, setFormData] = useState<ListingFormData>({
    address: "",
    city: "",
    state: "",
    postal_code: "",
    country: "Iraq",
    latitude: null,
    longitude: null,
    city_id: null,
    state_region_id: null,
    country_id: null,
    title: "",
    description: "",
    guests_max: 1,
    court_type: "football",
    surface_type: "artificial_turf",
    is_indoor: false,
    square_feet: 0,
    amenities: [],
    cover_image: "",
    images: [],
    check_in_time: "14:00",
    check_out_time: "11:00",
    min_nights: 1,
    max_nights: 30,
    house_rules: "",
    cancellation_policy_id: null,
    cleaning_fee: null,
    base_price: 50,
    weekly_discount: 0,
    monthly_discount: 0,
    opening_time: "08:00",
    closing_time: "22:00",
    availability_rules: [],
  });

  useEffect(() => {
    const fetchListing = async () => {
      if (!id || !user) return;

      if (isDemoMode) {
        // DEMO MODE: Fetch from localStorage
        const listing = getListing(id);
        if (!listing) {
          toast({
            title: "Error",
            description: "Listing not found",
            variant: "destructive",
          });
          navigate("/host/dashboard");
          return;
        }
        
        const availabilityRules = getAvailabilityRules(id)
          .filter((rule: any) => !rule.start_time && !rule.end_time)
          .map((rule: any) => ({
          id: rule.id,
          startDate: rule.start_date,
          endDate: rule.end_date,
          price: rule.price,
          }));
        
        const feedback = getModerationFeedback(id);
        const feedbackMap = feedback.reduce((acc: any, item: any) => {
          acc[item.section_key] = {
            status: item.status as "approved" | "rejected",
            comment: item.comment,
          };
          return acc;
        }, {});
        
        setAdminFeedback(feedbackMap);
        setListingStatus(listing.status);
        
        setFormData({
          address: listing.address || "",
          city: listing.city || "",
          state: listing.state || "",
          postal_code: listing.postal_code || "",
          country: listing.country || "Iraq",
          latitude: listing.latitude || null,
          longitude: listing.longitude || null,
          city_id: listing.city_id || null,
          state_region_id: listing.state_region_id || null,
          country_id: listing.country_id || null,
          title: listing.title || "",
          description: listing.description || "",
          guests_max: listing.guests_max || 1,
          court_type: listing.court_type || "football",
          surface_type: listing.surface_type || "artificial_turf",
          is_indoor: listing.is_indoor ?? false,
          square_feet: listing.size_sqft || 0,
          amenities: listing.amenities || [],
          cover_image: listing.cover_image || "",
          images: listing.images || [],
          check_in_time: listing.checkin_from || "14:00",
          check_out_time: listing.checkout_until || "11:00",
          opening_time: listing.opening_time || "08:00",
          closing_time: listing.closing_time || "22:00",
          min_nights: listing.min_nights || 1,
          max_nights: listing.max_nights || 30,
          house_rules: listing.house_rules || "",
          cancellation_policy_id: listing.cancellation_policy_id || null,
          cleaning_fee: listing.cleaning_fee ?? null,
          base_price: listing.base_price || 50,
          weekly_discount: listing.weekly_discount || 0,
          monthly_discount: listing.monthly_discount || 0,
          availability_rules: availabilityRules,
        });
        
        setInitialLoading(false);
        return;
      }

      // REAL MODE: Fetch from Supabase
      const { data: listing, error } = await supabase
        .from("listings")
        .select("*")
        .eq("id", id)
        .eq("host_user_id", user.id)
        .maybeSingle();

      if (error || !listing) {
        toast({
          title: "Error",
          description: error?.message || "This court was not found in your host account.",
          variant: "destructive",
        });
        navigate("/host/dashboard");
        return;
      }

      const [feedbackResult, availabilityResult] = await Promise.all([
        supabase.from("listing_moderation_feedback").select("section_key,status,comment,is_resolved").eq("listing_id", id),
        supabase.from("listing_availability").select("id,start_date,end_date,price").eq("listing_id", id).is("start_time", null).is("end_time", null),
      ]);
      if (availabilityResult.error) {
        toast({ title: "Error", description: availabilityResult.error.message, variant: "destructive" });
        setInitialLoading(false);
        return;
      }
      const data = {
        ...listing,
        listing_moderation_feedback: feedbackResult.data || [],
        listing_availability: availabilityResult.data || [],
      };

      // Process admin feedback if listing is rejected
      if (data.status === "rejected" && data.listing_moderation_feedback) {
        const unresolvedFeedback = (data.listing_moderation_feedback as any[]).filter(
          (fb) => fb.is_resolved === false
        );
        
        const feedbackMap = unresolvedFeedback.reduce((acc, item) => {
          acc[item.section_key] = {
            status: item.status as "approved" | "rejected",
            comment: item.comment,
          };
          return acc;
        }, {} as typeof adminFeedback);
        
        setAdminFeedback(feedbackMap);
      }

      setListingStatus(data.status);

      // Transform availability data
      const availabilityRules = (data.listing_availability as any[])?.map(rule => ({
        id: rule.id,
        startDate: rule.start_date,
        endDate: rule.end_date,
        price: rule.price,
      })) || [];

      setFormData({
        address: data.address || "",
        city: data.city || "",
        state: data.state || "",
        postal_code: data.postal_code || "",
        country: data.country || "Iraq",
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        city_id: data.city_id || null,
        state_region_id: data.state_region_id || null,
        country_id: data.country_id || null,
        title: data.title || "",
        description: data.description || "",
        guests_max: data.guests_max || 1,
        court_type: data.court_type || "football",
        surface_type: data.surface_type || "artificial_turf",
        is_indoor: data.is_indoor ?? false,
        square_feet: data.size_sqft || 0,
        amenities: data.amenities || [],
        cover_image: data.cover_image || "",
        images: data.images || [],
        check_in_time: data.checkin_from || "14:00",
        check_out_time: data.checkout_until || "11:00",
        opening_time: data.opening_time || "08:00",
        closing_time: data.closing_time || "22:00",
        min_nights: data.min_nights || 1,
        max_nights: data.max_nights || 30,
        house_rules: data.house_rules || "",
        cancellation_policy_id: data.cancellation_policy_id || null,
        cleaning_fee: data.cleaning_fee ?? null,
        base_price: data.base_price || 50,
        weekly_discount: data.weekly_discount || 0,
        monthly_discount: data.monthly_discount || 0,
        availability_rules: availabilityRules,
      });

      setInitialLoading(false);
    };

    fetchListing();
  }, [id, user, isDemoMode]);

  const updateFormData = useCallback((data: Partial<ListingFormData>) => {
    setFormData((prevData) => ({ ...prevData, ...data }));
  }, []);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const getCurrentStepFeedback = () => {
    const mapping = STEP_TO_FEEDBACK_SECTION[currentStep];
    if (!mapping || !adminFeedback[mapping.key]) {
      return null;
    }
    
    return {
      ...adminFeedback[mapping.key],
      sectionName: mapping.displayName,
    };
  };

  const handleSubmit = async () => {
    if (!user || !id) {
      toast({
        title: "Error",
        description: "You must be logged in to edit listings",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    if (isDemoMode && !migrationComplete) {
      toast({
        title: "Please wait",
        description: "Demo data is still loading...",
        variant: "default",
      });
      setLoading(false);
      return;
    }

    if (isDemoMode) {
      // DEMO MODE: Update localStorage
      const updates = {
        title: formData.title,
        description: formData.description,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        postal_code: formData.postal_code,
        country: formData.country,
        latitude: formData.latitude,
        longitude: formData.longitude,
        city_id: formData.city_id,
        state_region_id: formData.state_region_id,
        country_id: formData.country_id,
        guests_max: formData.guests_max,
        court_type: formData.court_type,
        surface_type: formData.surface_type,
        is_indoor: formData.is_indoor,
        size_sqft: formData.square_feet,
        amenities: formData.amenities,
        cover_image: formData.cover_image,
        images: formData.images,
        checkin_from: formData.check_in_time,
        checkout_until: formData.check_out_time,
        opening_time: formData.opening_time,
        closing_time: formData.closing_time,
        base_price: formData.base_price,
        weekly_discount: formData.weekly_discount,
        monthly_discount: formData.monthly_discount,
        cleaning_fee: formData.cleaning_fee ?? 0,
        min_nights: formData.min_nights,
        max_nights: formData.max_nights,
        house_rules: formData.house_rules,
        cancellation_policy_id: formData.cancellation_policy_id,
        status: "approved",
        updated_at: new Date().toISOString(),
      };
      
      try {
      if (!updateListing(id, updates)) {
        setLoading(false);
        toast({ title: "Error", description: "The court could not be found, so no changes were saved.", variant: "destructive" });
        return;
      }
      
      if (formData.availability_rules) {
        const availabilityRecords = formData.availability_rules.map(rule => ({
          start_date: rule.startDate,
          end_date: rule.endDate,
          price: rule.price,
        }));
        if (!updateAvailabilityRules(id, availabilityRecords)) throw new Error("Availability could not be saved.");
      }
      
      // INVALIDATE CACHE
      queryClient.invalidateQueries({ queryKey: ["host-listings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-listings"] });
      
      setLoading(false);
      toast({
        title: "Success!",
        description: "Your listing and availability have been updated and published",
      });
      navigate("/host/dashboard");
      } catch (error: any) {
        setLoading(false);
        toast({ title: "Save failed", description: error.message || "Your changes could not be saved.", variant: "destructive" });
      }
      return;
    }

    // REAL MODE: Update Supabase. Selecting the updated row is important:
    // RLS can hide a row from UPDATE without returning a database error.
    try {
      const { data: savedListing, error } = await supabase
        .from("listings")
        .update({
        title: formData.title,
        description: formData.description,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        postal_code: formData.postal_code,
        country: formData.country,
        latitude: formData.latitude,
        longitude: formData.longitude,
        city_id: formData.city_id,
        state_region_id: formData.state_region_id,
        country_id: formData.country_id,
        guests_max: formData.guests_max,
        court_type: formData.court_type as any,
        surface_type: formData.surface_type as any,
        is_indoor: formData.is_indoor,
        size_sqft: formData.square_feet,
        amenities: formData.amenities,
        cover_image: formData.cover_image,
        images: formData.images,
        checkin_from: formData.check_in_time,
        checkout_until: formData.check_out_time,
        opening_time: formData.opening_time,
        closing_time: formData.closing_time,
        base_price: formData.base_price,
        weekly_discount: formData.weekly_discount,
        monthly_discount: formData.monthly_discount,
        cleaning_fee: formData.cleaning_fee ?? 0,
        min_nights: formData.min_nights,
        max_nights: formData.max_nights,
        house_rules: formData.house_rules,
        cancellation_policy_id: formData.cancellation_policy_id,
        status: "approved" as any,
      })
      .eq("id", id)
      .eq("host_user_id", user.id)
      .select("id")
      .maybeSingle();

      if (error) throw error;
      if (!savedListing) throw new Error("No changes were saved. Refresh the page and confirm this court belongs to your account.");

    // Delete all existing availability rules for this listing
    const { error: deleteError } = await supabase
      .from("listing_availability")
      .delete()
      .eq("listing_id", id)
      .is("start_time", null)
      .is("end_time", null);

      if (deleteError) throw new Error(`The court was updated, but its old availability could not be cleared: ${deleteError.message}`);

    // Insert new availability rules if they exist
      if (formData.availability_rules && formData.availability_rules.length > 0) {
      const availabilityRecords = formData.availability_rules.map(rule => ({
        listing_id: id,
        start_date: rule.startDate,
        end_date: rule.endDate,
        price: rule.price,
      }));

      const { error: availabilityError } = await supabase
        .from("listing_availability")
        .insert(availabilityRecords);

        if (availabilityError) throw new Error(`The court was updated, but new availability could not be saved: ${availabilityError.message}`);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["host-listings"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-recent-listings"] }),
      ]);
      setLoading(false);
      toast({ title: "Success!", description: "Your listing and availability have been saved." });
      navigate("/host/dashboard");
    } catch (error: any) {
      setLoading(false);
      toast({ title: "Save failed", description: error.message || "Your changes could not be saved. Please try again.", variant: "destructive" });
    }
  };

  const handleResubmit = async () => {
    if (!user || !id) {
      toast({
        title: "Error",
        description: "You must be logged in to resubmit listings",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    if (isDemoMode && !migrationComplete) {
      toast({
        title: "Please wait",
        description: "Demo data is still loading...",
        variant: "default",
      });
      setLoading(false);
      return;
    }
    
    if (isDemoMode) {
      // Publish the corrected listing immediately and clear the old rejection.
      const updates = {
        status: 'approved',
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      };
      
      if (!updateListing(id, updates) || !updateAvailabilityRules(id, formData.availability_rules)) {
        setLoading(false);
        toast({ title: "Save failed", description: "The court changes could not be saved.", variant: "destructive" });
        return;
      }
      
      // Resolve all moderation feedback
      const feedback = getModerationFeedback(id);
      feedback.forEach(f => {
        if (!f.is_resolved) {
          resolveFeedback(f.id);
        }
      });
      
      // INVALIDATE CACHE
      queryClient.invalidateQueries({ queryKey: ["host-listings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-listings"] });
      
      setLoading(false);
      toast({
        title: "Success!",
        description: "Your listing has been updated and published",
      });
      navigate("/host/dashboard");
      return;
    }

    try {
      // REAL MODE: Update Supabase
      // Step 1: Save listing changes
      const { data: savedListing, error: updateError } = await supabase
        .from("listings")
        .update({
          title: formData.title,
          description: formData.description,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          postal_code: formData.postal_code,
          country: formData.country,
          latitude: formData.latitude,
          longitude: formData.longitude,
          city_id: formData.city_id,
          state_region_id: formData.state_region_id,
          country_id: formData.country_id,
          guests_max: formData.guests_max,
          court_type: formData.court_type as any,
          surface_type: formData.surface_type as any,
          is_indoor: formData.is_indoor,
          size_sqft: formData.square_feet,
          amenities: formData.amenities,
          cover_image: formData.cover_image,
          images: formData.images,
          checkin_from: formData.check_in_time,
          checkout_until: formData.check_out_time,
          opening_time: formData.opening_time,
          closing_time: formData.closing_time,
          base_price: formData.base_price,
          weekly_discount: formData.weekly_discount,
          monthly_discount: formData.monthly_discount,
          cleaning_fee: formData.cleaning_fee ?? 0,
          min_nights: formData.min_nights,
          max_nights: formData.max_nights,
          house_rules: formData.house_rules,
          cancellation_policy_id: formData.cancellation_policy_id,
          status: "approved" as any,
          rejection_reason: null,
        })
        .eq("id", id)
        .eq("host_user_id", user.id)
        .select("id")
        .maybeSingle();

      if (updateError) {
        throw new Error(`Failed to update listing: ${updateError.message}`);
      }
      if (!savedListing) {
        throw new Error("No changes were saved. Refresh the page and confirm this court belongs to your account.");
      }

      // Update availability rules
      const { error: deleteError } = await supabase
        .from("listing_availability")
        .delete()
        .eq("listing_id", id)
        .is("start_time", null)
        .is("end_time", null);

      if (deleteError) {
        throw new Error(`Could not replace availability rules: ${deleteError.message}`);
      }

      if (formData.availability_rules && formData.availability_rules.length > 0) {
        const availabilityRecords = formData.availability_rules.map(rule => ({
          listing_id: id,
          start_date: rule.startDate,
          end_date: rule.endDate,
          price: rule.price,
        }));

        const { error: availabilityError } = await supabase
          .from("listing_availability")
          .insert(availabilityRecords);

        if (availabilityError) throw new Error(`Could not save availability rules: ${availabilityError.message}`);
      }

      // Step 2: Resolve old feedback
      const { error: feedbackError } = await supabase
        .from("listing_moderation_feedback")
        .update({ is_resolved: true })
        .eq("listing_id", id)
        .eq("is_resolved", false);

      if (feedbackError) {
        console.error("Error resolving feedback:", feedbackError);
        toast({
          title: "Warning",
          description: "Listing published, but old feedback could not be archived. The admin will still see your updated listing.",
          variant: "default",
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["host-listings"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-recent-listings"] }),
      ]);

      // Step 3: Success
      setLoading(false);
      toast({
        title: "Success!",
        description: "Your listing has been updated and published successfully.",
      });
      navigate("/host/dashboard");

    } catch (error: any) {
      setLoading(false);
      toast({
        title: "Error",
        description: error.message || "Failed to resubmit listing. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (initialLoading) {
    return (
      <div className="container mx-auto px-4 py-8 lg:px-8 flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <Button
          variant="ghost"
          onClick={() => {
            const from = (location.state as any)?.from;
            navigate(from || "/host/listings");
          }}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Edit Listing</CardTitle>
            <div className="space-y-2 mt-4">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{translateUiText(`Step ${currentStep + 1} of ${STEPS.length}: ${STEPS[currentStep]}`, language)}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {currentStep === 0 && (
              <StepBasics formData={formData} updateFormData={updateFormData} />
            )}
            {currentStep === 1 && (
              <StepPropertyType formData={formData} updateFormData={updateFormData} />
            )}
            {currentStep === 2 && (
              <StepPhotos formData={formData} updateFormData={updateFormData} />
            )}
            {currentStep === 3 && (
              <StepDetails formData={formData} updateFormData={updateFormData} />
            )}
            {currentStep === 4 && (
              <StepRules formData={formData} updateFormData={updateFormData} />
            )}
            {currentStep === 5 && (
              <StepPricing formData={formData} updateFormData={updateFormData} />
            )}
            {currentStep === 6 && (
              <StepAvailability formData={formData} updateFormData={updateFormData} />
            )}
            {currentStep === 7 && <StepReview formData={formData} />}

            {/* Show feedback for current step if available */}
            {listingStatus === "rejected" && getCurrentStepFeedback() && (
              <FeedbackBlock
                status={getCurrentStepFeedback()!.status}
                comment={getCurrentStepFeedback()!.comment}
                sectionName={getCurrentStepFeedback()!.sectionName}
              />
            )}


            <div className="flex justify-between pt-6">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 0 || loading}
              >
                Back
              </Button>
              {currentStep < STEPS.length - 1 ? (
                <Button onClick={handleNext} disabled={loading}>
                  Next
                </Button>
              ) : (
                <Button 
                  onClick={listingStatus === "rejected" ? handleResubmit : handleSubmit} 
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {listingStatus === "rejected" ? "Resubmitting..." : "Updating..."}
                    </>
                  ) : (
                    listingStatus === "rejected" ? "Resubmit for Review" : "Update Listing"
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EditListing;
