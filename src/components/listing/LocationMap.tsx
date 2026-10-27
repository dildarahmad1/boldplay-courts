import GoogleMapEmbed from "@/components/shared/GoogleMapEmbed";

interface LocationMapProps { latitude: number; longitude: number; }
const LocationMap = ({ latitude, longitude }: LocationMapProps) => (
  <GoogleMapEmbed latitude={latitude} longitude={longitude} className="h-[400px] w-full" />
);
export default LocationMap;
