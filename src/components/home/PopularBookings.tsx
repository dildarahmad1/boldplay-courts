import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ListingCard from "@/components/shared/ListingCard";

const PopularBookings = () => {
  const [listings, setListings] = useState<any[]>([]);

  useEffect(() => {
    const fetchPopularListings = async () => {
      const { data } = await supabase
        .from("listings")
        .select("*")
        .eq("status", "approved")
        .order("rating_count", { ascending: false })
        .limit(8);

      if (data) {
        setListings(data);
      }
    };
    fetchPopularListings();
  }, []);

  if (listings.length === 0) {
    return null;
  }

  return (
    <section className="bg-slate-50 py-20">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Play nearby</p>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Popular Courts</h2>
          </div>
          <Link 
            to="/search" 
            className="flex-none text-sm font-semibold text-primary transition-opacity hover:opacity-70 sm:text-base"
          >
            See All
          </Link>
        </div>

        {/* Grid */}
        <div className="grid auto-rows-fr grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default PopularBookings;
