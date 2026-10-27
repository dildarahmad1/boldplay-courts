import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDemoData } from "@/hooks/useDemoData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatIQD } from "@/lib/currency";
import { useDebounce } from "@/hooks/useDebounce";
import StepAvailability from "@/components/listing/StepAvailability";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListingsFiltersSheet } from "@/components/host/ListingsFiltersSheet";
import { ListingsTable } from "@/components/host/ListingsTable";

interface Listing {
  id: string;
  title: string;
  status: "approved" | "draft" | "pending" | "blocked" | "rejected";
  type: string;
  city: string;
  state: string | null;
  country: string;
  base_price: number;
  cover_image: string | null;
  rating_avg: number;
  rating_count: number;
  availability_rules?: any[];
}

const ListingsManagement = () => {
  const { user } = useAuth();
  const { isDemoMode, getListingsFiltered, getAvailabilityRules, updateAvailabilityRules } = useDemoData();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [isAvailabilityDialogOpen, setIsAvailabilityDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortValue, setSortValue] = useState("created_at-desc");
  const { toast } = useToast();

  // Stored court prices use compact thousands for legacy records (for example, 45 = 45,000 IQD).
  const parsePriceFilter = (value: string) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return null;
    return amount >= 1000 ? amount / 1000 : amount;
  };

  const debouncedSearch = useDebounce(searchQuery, 500);

  const { data: listings = [], isLoading } = useQuery({
    queryKey: [
      "host-listings",
      user?.id,
      debouncedSearch,
      statusFilter,
      minPrice,
      maxPrice,
      sortValue,
      isDemoMode,
    ],
    queryFn: async () => {
      if (!user?.id) return [];

      if (isDemoMode) {
        // DEMO MODE: Use localStorage with client-side filtering
        const [sortBy, sortOrder] = sortValue.split("-");
        
        return getListingsFiltered({
          searchQuery: debouncedSearch || null,
          statusFilter: statusFilter !== "all" ? statusFilter : null,
          minPrice: minPrice ? parsePriceFilter(minPrice) : null,
          maxPrice: maxPrice ? parsePriceFilter(maxPrice) : null,
          sortBy,
          sortOrder,
        });
      } else {
        // REAL MODE: Use Supabase RPC
        const [sortBy, sortOrder] = sortValue.split("-");
        const { data, error } = await supabase.rpc("host_search_listings", {
          host_id: user.id,
          search_query: debouncedSearch || null,
          status_filter: statusFilter !== "all" ? (statusFilter as any) : null,
          min_price: minPrice ? parsePriceFilter(minPrice) : null,
          max_price: maxPrice ? parsePriceFilter(maxPrice) : null,
          sort_by: sortBy,
          sort_order: sortOrder,
        });

        if (error) throw error;
        return data as Listing[];
      }
    },
    enabled: !!user?.id,
  });

  const handleApplyFilters = (filters: {
    statusFilter: string;
    minPrice: string;
    maxPrice: string;
  }) => {
    setStatusFilter(filters.statusFilter);
    setMinPrice(filters.minPrice);
    setMaxPrice(filters.maxPrice);
  };

  const handleClearFilters = () => {
    setStatusFilter("all");
    setMinPrice("");
    setMaxPrice("");
  };

  const handleEditClick = (listingId: string) => {
    navigate(`/host/edit-listing/${listingId}`, { 
      state: { from: location.pathname } 
    });
  };

  const handleAvailabilityClick = async (listing: Listing) => {
    if (isDemoMode) {
      // DEMO MODE: Fetch from localStorage
      const availabilityRules = getAvailabilityRules(listing.id);
      
      const formattedRules = availabilityRules.map(rule => ({
        id: rule.id,
        startDate: rule.start_date,
        endDate: rule.end_date,
        price: rule.price,
      }));
      
      setSelectedListing({ ...listing, availability_rules: formattedRules });
      setIsAvailabilityDialogOpen(true);
    } else {
      // REAL MODE: Fetch from Supabase
      const { data: availabilityData } = await supabase
        .from("listing_availability")
        .select("*")
        .eq("listing_id", listing.id)
        .is("start_time", null)
        .is("end_time", null)
        .order("start_date", { ascending: true });

      // Convert snake_case from DB to camelCase for StepAvailability component
      const formattedRules = (availabilityData || []).map(rule => ({
        id: rule.id,
        startDate: rule.start_date,
        endDate: rule.end_date,
        price: rule.price
      }));

      setSelectedListing({ ...listing, availability_rules: formattedRules });
      setIsAvailabilityDialogOpen(true);
    }
  };

  const handleSaveAvailability = async (availabilityRules: any[]) => {
    if (!selectedListing || !user) return;
    
    setIsSaving(true);
    
    try {
      if (isDemoMode) {
        // DEMO MODE: Update localStorage
        // Convert camelCase to snake_case to match database schema
        const rulesWithSnakeCase = availabilityRules.map(rule => ({
          id: rule.id,
          start_date: rule.startDate,
          end_date: rule.endDate,
          price: rule.price,
        }));
        
        if (!updateAvailabilityRules(selectedListing.id, rulesWithSnakeCase)) {
          throw new Error("Availability rules could not be saved.");
        }
        
        // Invalidate query to refetch listings
        await queryClient.invalidateQueries({ 
          queryKey: ["host-listings"] 
        });
        
        // Update selected listing state to reflect changes in UI
        setSelectedListing(prev => prev ? {
          ...prev,
          availability_rules: availabilityRules
        } : null);
        
        toast({
          title: "Success",
          description: "Availability updated successfully",
        });
      } else {
        // REAL MODE: Update Supabase
        const { data: deletedRows, error: deleteError } = await supabase
          .from("listing_availability")
          .delete()
          .eq("listing_id", selectedListing.id)
          .is("start_time", null)
          .is("end_time", null)
          .select("id");

        if (deleteError) throw deleteError;
        const expectedDeleteCount = selectedListing.availability_rules?.length ?? 0;
        if ((deletedRows?.length ?? 0) !== expectedDeleteCount) {
          throw new Error("Some availability changes were not saved. Refresh and try again.");
        }

        if (availabilityRules.length > 0) {
          const rulesToInsert = availabilityRules.map(rule => ({
            listing_id: selectedListing.id,
            start_date: rule.startDate,
            end_date: rule.endDate,
            price: rule.price,
          }));

          const { error } = await supabase
            .from("listing_availability")
            .insert(rulesToInsert);

          if (error) throw error;
        }

        if (availabilityRules.length > 0) {
          const { data: savedRules, error: verifyError } = await supabase
            .from("listing_availability")
            .select("id")
            .eq("listing_id", selectedListing.id)
            .is("start_time", null)
            .is("end_time", null);
          if (verifyError) throw verifyError;
          if ((savedRules?.length ?? 0) !== availabilityRules.length) {
            throw new Error("Availability changes did not appear after saving. Please try again.");
          }
        }

        // Invalidate query to refetch listings
        await queryClient.invalidateQueries({ 
          queryKey: ["host-listings"] 
        });

        setSelectedListing(prev => prev ? {
          ...prev,
          availability_rules: availabilityRules
        } : null);
        
        toast({
          title: "Success",
          description: "Availability updated successfully",
        });
      }
    } catch (error: any) {
      console.error("Error saving availability:", error);
      toast({
        title: "Availability not saved",
        description: error?.message || "Failed to save availability rules",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 pb-8 lg:px-8">
      <Card className="bg-card">
        <CardContent className="p-6">
          {/* Controls Row */}
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            {/* Search Input - Left */}
            <div className="relative flex-1 max-w-md min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by title, location, or type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background border-border"
              />
            </div>

            {/* Filter and Sort - Right */}
            <div className="flex items-center gap-2">
              <ListingsFiltersSheet
                statusFilter={statusFilter}
                minPrice={minPrice}
                maxPrice={maxPrice}
                onApplyFilters={handleApplyFilters}
                onClearFilters={handleClearFilters}
              />

              <Select value={sortValue} onValueChange={setSortValue}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at-desc">Date: Newest First</SelectItem>
                  <SelectItem value="created_at-asc">Date: Oldest First</SelectItem>
                  <SelectItem value="base_price-desc">Price: High to Low</SelectItem>
                  <SelectItem value="base_price-asc">Price: Low to High</SelectItem>
                  <SelectItem value="rating_avg-desc">Rating: High to Low</SelectItem>
                  <SelectItem value="rating_avg-asc">Rating: Low to High</SelectItem>
                  <SelectItem value="updated_at-desc">Recently Updated</SelectItem>
                  <SelectItem value="updated_at-asc">Least Recently Updated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block">
            <ListingsTable
              listings={listings}
              loading={isLoading}
              onEditClick={handleEditClick}
              onAvailabilityClick={handleAvailabilityClick}
            />
          </div>

          {/* Mobile Card View */}
          <div className="lg:hidden space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : listings.length === 0 ? (
              <div className="bg-card rounded-lg border p-8 text-center">
                <p className="text-muted-foreground">
                  {searchQuery || statusFilter !== "all" || minPrice || maxPrice
                    ? "No listings found matching your filters. Try adjusting your search or filters."
                    : "No listings found. Create your first listing to get started."
                  }
                </p>
              </div>
            ) : (
              listings.map((listing) => (
                <div key={listing.id} className="bg-card rounded-lg border p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{listing.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {listing.city}, {listing.state || listing.country}
                      </p>
                      <p className="text-sm text-muted-foreground capitalize">{listing.type}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-lg">{formatIQD(listing.base_price)}/hour</p>
                      {listing.rating_count > 0 && (
                        <p className="text-sm text-muted-foreground">
                          ⭐ {Number(listing.rating_avg ?? 0).toFixed(1)} ({listing.rating_count})
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleEditClick(listing.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleAvailabilityClick(listing)}
                    >
                      Availability
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Availability Dialog */}
      <Dialog open={isAvailabilityDialogOpen} onOpenChange={setIsAvailabilityDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Availability - {selectedListing?.title}</DialogTitle>
          </DialogHeader>
          {selectedListing && (
            <StepAvailability
              formData={{
                availability_rules: selectedListing.availability_rules || [],
                base_price: selectedListing.base_price,
                currency: 'IQD',
                title: selectedListing.title
              }}
              updateFormData={(data) => {
                if (data.availability_rules) {
                  handleSaveAvailability(data.availability_rules);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ListingsManagement;
