import { useState } from "react";
import { ListingFormData } from "@/pages/host/CreateListing";
import FormInput from "./FormInput";
import VenueSuggestions from "./VenueSuggestions";
import FormCityCombobox from "./FormCityCombobox";
import CourtLocationPicker from "./CourtLocationPicker";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, LocateFixed, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StepBasicsProps {
  formData: ListingFormData;
  updateFormData: (data: Partial<ListingFormData>) => void;
}

const StepBasics = ({ formData, updateFormData }: StepBasicsProps) => {
  const [isLocating, setIsLocating] = useState(false);
  const { toast } = useToast();

  const handleShowOnMap = () => {
    const query = [formData.address, formData.city, formData.state, formData.country].filter(Boolean).join(", ");
    window.open(`https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query })}`, "_blank", "noopener,noreferrer");
  };

  const canShowMap = formData.country && formData.address && formData.city;

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Location unavailable", description: "Your browser does not support location services.", variant: "destructive" });
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateFormData({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setIsLocating(false);
        toast({ title: "Location pinned", description: "Check the map and coordinates before continuing." });
      },
      () => {
        setIsLocating(false);
        toast({ title: "Location unavailable", description: "Allow location access or paste the court coordinates from Google Maps.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };


  return (
    <div className="space-y-6">
      <VenueSuggestions formData={formData} updateFormData={updateFormData} />
      <FormCityCombobox
        value={
          formData.city ? {
            city_id: formData.city_id,
            city_name: formData.city,
            state_region_id: formData.state_region_id,
            state_name: formData.state,
            country_id: formData.country_id,
            country_name: formData.country,
          } : null
        }
        onChange={(cityData) => {
          updateFormData({
            city_id: cityData.city_id,
            city: cityData.city_name,
            state_region_id: cityData.state_region_id,
            state: cityData.state_name,
            country_id: cityData.country_id,
            country: "Iraq",
          });
        }}
        required
      />

      <div>
        <FormInput
          label="Address or nearby landmark"
          placeholder="Street, neighbourhood or a landmark near the entrance"
          value={formData.address}
          onChange={(value) => updateFormData({ address: value })}
          required
        />
      </div>

      <div className="space-y-4 pt-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-slate-950">Pin the court location</h3>
            <p className="mt-1 text-sm text-slate-500">Place the pin at the main entrance so players can arrive easily.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-xl bg-white" onClick={useCurrentLocation} disabled={isLocating}>
              {isLocating ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <LocateFixed className="me-2 h-4 w-4" />}
              Use current location
            </Button>
            <Button type="button" variant="outline" className="rounded-xl bg-white" onClick={handleShowOnMap} disabled={!canShowMap}>
              <MapPin className="me-2 h-4 w-4" />
              Find address in Google Maps
            </Button>
          </div>
        </div>


      </div>

      <CourtLocationPicker latitude={formData.latitude} longitude={formData.longitude} onLocationChange={(latitude, longitude) => updateFormData({ latitude, longitude })} />

      <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${formData.latitude !== null && formData.longitude !== null ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        {formData.latitude !== null && formData.longitude !== null ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <MapPin className="h-5 w-5 shrink-0" />}
        <span className="font-semibold">
          {formData.latitude !== null && formData.longitude !== null
            ? "Location pinned. Check that it marks your court entrance."
            : "A map pin is required before continuing."}
        </span>
      </div>
    </div>
  );
};

export default StepBasics;
