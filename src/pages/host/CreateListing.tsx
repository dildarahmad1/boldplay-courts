import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useDemoData } from "@/hooks/useDemoData";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import ListingWizard from "@/components/listing/ListingWizard";
import { initialListingForm, listingStepError, restoreListingDraft } from "@/lib/listingForm";
import ListingCreationErrorBoundary from "@/components/listing/ListingCreationErrorBoundary";

export type AvailabilityRule = {
  id: string;
  startDate: string;
  endDate: string;
  price: number | null;
};

export type ListingFormData = {
  // Address
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  
  // Location foreign keys
  city_id: string | null;
  state_region_id: string | null;
  country_id: string | null;
  
  // Court Details
  title: string;
  description: string;
  guests_max: number;
  court_type: string;
  surface_type: string;
  is_indoor: boolean;
  square_feet: number;
  
  // Details
  amenities: string[];
  
  // Photos
  cover_image: string;
  images: string[];
  
  // Rules
  check_in_time: string;
  check_out_time: string;
  min_nights: number;
  max_nights: number;
  house_rules: string;
  cancellation_policy_id: string | null;
  cancellation_policy_name?: string;
  cleaning_fee: number | null;
  
  // Pricing
  base_price: number;
  weekly_discount: number;
  monthly_discount: number;
  
  // Availability
  opening_time: string;
  closing_time: string;
  availability_rules: AvailabilityRule[];
}

const STEPS = ["Location", "Court & photos", "Price", "Review"];

const CreateListing = () => {
  const { user } = useAuth();
  const { isDemoMode, addListing, addAvailabilityRules, migrationComplete } = useDemoData();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ListingFormData>({ ...initialListingForm });
  const [draftLoadedFor, setDraftLoadedFor] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const draftKey = user ? `yarika:court-draft:v1:${user.id}` : null;

  useEffect(() => {
    if (!draftKey) return;
    setFormData({ ...initialListingForm });
    setCurrentStep(0);
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const draft = restoreListingDraft(saved);
        setFormData(draft.data);
        setCurrentStep(draft.step);
        setDraftStatus("Draft restored on this device");
      }
    } catch {
      setDraftStatus("Draft could not be restored");
    }
    setDraftLoadedFor(draftKey);
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || draftLoadedFor !== draftKey) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ version: 1, step: currentStep, data: formData }));
        setDraftStatus("Draft saved on this device");
      } catch { setDraftStatus("Draft could not be saved on this device"); }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftKey, draftLoadedFor, currentStep, formData]);

  const clearDraft = () => {
    if (draftKey) { try { localStorage.removeItem(draftKey); } catch { /* Storage may be unavailable. */ } }
  };
  const saveAndExit = () => {
    try {
      if (!draftKey) throw new Error("Sign in to save your draft.");
      localStorage.setItem(draftKey, JSON.stringify({ version: 1, step: currentStep, data: formData }));
      navigate("/host/dashboard");
    } catch { setFormError("Your draft could not be saved. Keep this page open and try again."); }
  };

  const updateFormData = (data: Partial<ListingFormData>) => {
    setFormData(previous => ({ ...previous, ...data }));
    setFormError(null);
  };

  const handleNext = () => {
    const error = listingStepError(formData, currentStep);
    setFormError(error);
    if (!error) { setCurrentStep(step => Math.min(step + 1, STEPS.length - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  };
  const handleBack = () => { setFormError(null); setCurrentStep(step => Math.max(0, step - 1)); };

  const handleSubmit = async () => {
    if (loading) return;
    for (let step = 0; step < STEPS.length - 1; step++) {
      const error = listingStepError(formData, step);
      if (error) { setCurrentStep(step); setFormError(error); return; }
    }
    // Phase 1: Validation
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to create listings",
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

    try {
      if (isDemoMode) {
        // DEMO MODE: Save to localStorage
        const newListingId = `listing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const demoListing = {
          id: newListingId,
          host_user_id: user.id,
          status: 'approved',
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
          min_nights: formData.min_nights,
          max_nights: formData.max_nights,
          house_rules: formData.house_rules,
          cancellation_policy_id: formData.cancellation_policy_id,
          base_price: formData.base_price,
          weekly_discount: formData.weekly_discount,
          monthly_discount: formData.monthly_discount,
          cleaning_fee: formData.cleaning_fee ?? 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        addListing(demoListing);
        
        if (formData.availability_rules && formData.availability_rules.length > 0) {
          const availabilityRecords = formData.availability_rules.map(rule => ({
            start_date: rule.startDate,
            end_date: rule.endDate,
            price: rule.price,
          }));
          addAvailabilityRules(newListingId, availabilityRecords);
        }
        
        // INVALIDATE CACHE to refresh all listing queries
        queryClient.invalidateQueries({ queryKey: ["host-listings"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-recent-listings"] });
        
        setLoading(false);
        toast({
          title: "Success!",
          description: "Your court is published and visible in search now.",
        });
        clearDraft();
        navigate("/host/dashboard");
        return;
      }

      // REAL MODE: Save directly to Supabase and publish immediately.
      const listingData: TablesInsert<"listings"> & { type: NonNullable<TablesInsert<"listings">["type"]> } = {
        type: "court",
        host_user_id: user.id,
        title: formData.title,
        description: formData.description,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        postal_code: formData.postal_code,
        country: formData.country,
        latitude: formData.latitude,
        longitude: formData.longitude,
        city_id: formData.city_id || null,
        state_region_id: formData.state_region_id || null,
        country_id: formData.country_id || null,
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
        min_nights: formData.min_nights,
        max_nights: formData.max_nights,
        house_rules: formData.house_rules,
        cancellation_policy_id: formData.cancellation_policy_id,
        base_price: formData.base_price,
        weekly_discount: formData.weekly_discount,
        monthly_discount: formData.monthly_discount,
        cleaning_fee: formData.cleaning_fee ?? 0,
        currency: "IQD",
        opening_time: formData.opening_time,
        closing_time: formData.closing_time,
        min_hours: 1,
        max_hours: 5,
        slot_duration_minutes: 60,
        rating_avg: 0,
        rating_count: 0,
        status: "approved" as any,
      };

      const { data: createdListing, error: listingError } = await supabase
        .from("listings")
        .insert([listingData])
        .select()
        .single();

      // Phase 2: Handle listing creation error
      if (listingError) {
        setFormError(listingError.message);
        setLoading(false);
        toast({
          title: "Error",
          description: listingError.message,
          variant: "destructive",
        });
        return;
      }

      // Phase 3: Defensive check for listing ID
      if (!createdListing || !createdListing.id) {
        setLoading(false);
        toast({
          title: "Error",
          description: "Listing was created but ID is missing",
          variant: "destructive",
        });
        return;
      }

      // Phase 3: Handle availability rules if they exist
      if (formData.availability_rules && formData.availability_rules.length > 0) {
        const availabilityRecords = formData.availability_rules.map(rule => ({
          listing_id: createdListing.id,
          start_date: rule.startDate,
          end_date: rule.endDate,
          price: rule.price,
        }));

        const { error: availabilityError } = await supabase
          .from("listing_availability")
          .insert(availabilityRecords);

        // Phase 3: Handle availability error (partial failure)
        if (availabilityError) {
          setLoading(false);
          toast({
            title: "Partial Success",
            description: "Your listing was created, but availability rules could not be saved. You can add them later by editing the listing.",
            variant: "destructive",
          });
          clearDraft();
          navigate("/host/dashboard");
          return;
        }
      }

      // Phase 4: Complete success
      setLoading(false);
      toast({
        title: "Success!",
        description: "Your court is published and visible in search now.",
      });
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["host-listings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-listings"] });
      navigate("/host/dashboard");

    } catch (error) {
      // Catch any unexpected errors
      setLoading(false);
      setFormError(error instanceof Error ? error.message : "An unexpected error occurred");
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const restartForm = () => {
    clearDraft();
    setFormData({ ...initialListingForm, amenities: [], images: [], availability_rules: [] });
    setCurrentStep(0);
    setFormError(null);
    setDraftStatus("");
  };

  return <ListingCreationErrorBoundary onReset={restartForm}>
    <ListingWizard
      formData={formData} updateFormData={updateFormData} currentStep={currentStep}
      loading={loading} error={formError} draftStatus={draftStatus}
      onNext={handleNext} onBack={handleBack} onSubmit={handleSubmit}
      onSaveExit={saveAndExit} onEdit={step => { setCurrentStep(step); setFormError(null); }}
      onExit={() => navigate((location.state as { from?: string } | null)?.from || "/host/listings")}
    />
  </ListingCreationErrorBoundary>;
};

export default CreateListing;
