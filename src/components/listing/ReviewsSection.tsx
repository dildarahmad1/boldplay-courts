import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ReviewCard } from "./ReviewCard";
import { AllReviewsDialog } from "./AllReviewsDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MessageSquareText, Star, ShieldCheck, ChevronRight } from "lucide-react";

interface ReviewsSectionProps {
  listingId: string;
  averageRating: number;
  reviewCount: number;
}

interface Review {
  id: string;
  rating: number;
  text: string | null;
  created_at: string;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}

export const ReviewsSection = ({ listingId, averageRating, reviewCount }: ReviewsSectionProps) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scrollToReviewId, setScrollToReviewId] = useState<string | undefined>();

  useEffect(() => {
    fetchReviews();
  }, [listingId]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("reviews")
        .select(`
          id,
          rating,
          text,
          created_at,
          author_user_id,
          listing_id
        `)
        .eq("listing_id", listingId)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch profiles separately for all reviews
      const authorIds = data?.map(r => r.author_user_id).filter(Boolean) || [];
      const { data: profilesData } = await supabase
        .from("public_profiles")
        .select("id, first_name, last_name, avatar_url")
        .in("id", authorIds);

      // Map profiles to reviews
      const reviewsWithProfiles = data?.map(review => ({
        ...review,
        profiles: profilesData?.find(p => p.id === review.author_user_id) || null
      })) || [];

      setReviews(reviewsWithProfiles);
    } catch (error) {
      console.error("Error fetching reviews:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleShowMore = (reviewId: string) => {
    setScrollToReviewId(reviewId);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setScrollToReviewId(undefined);
  };

  if (loading) {
    return (
      <div className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <MessageSquareText className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Player reviews</h2>
            <p className="mt-0.5 text-sm text-slate-500">Feedback from verified bookings</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-100">
            <Star className="h-6 w-6" />
          </span>
          <h3 className="text-lg font-bold text-slate-900">No reviews yet</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">This court is ready for its first verified player review.</p>
        </div>
      </div>
    );
  }

  const displayedReviews = reviews.slice(0, 6);
  const hasMoreReviews = reviews.length > 6;
  const totalReviews = Math.max(reviewCount, reviews.length);
  const ratingValue = averageRating || reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  const ratingBreakdown = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: reviews.filter((review) => Math.round(review.rating) === rating).length,
  }));

  return (
    <>
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-8 flex flex-col gap-6 border-b border-slate-100 pb-8 lg:flex-row lg:items-stretch">
          <div className="flex min-w-[210px] items-center gap-4 lg:border-e lg:border-slate-100 lg:pe-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
              <Star className="h-7 w-7 fill-current" />
            </div>
            <div>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold tracking-tight text-slate-950">{ratingValue.toFixed(1)}</span>
                <span className="mb-1 text-sm font-medium text-slate-400">/ 5</span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-500">{totalReviews} {totalReviews === 1 ? "review" : "reviews"}</p>
            </div>
          </div>

          <div className="flex-1">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-slate-950">Player reviews</h2>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <ShieldCheck className="h-4 w-4" /> Verified bookings
              </span>
            </div>
            <div className="space-y-2">
              {ratingBreakdown.map(({ rating, count }) => (
                <div key={rating} className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="w-3 font-semibold text-slate-700">{rating}</span>
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-900 transition-all duration-500" style={{ width: `${reviews.length ? (count / reviews.length) * 100 : 0}%` }} />
                  </div>
                  <span className="w-5 text-end tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {displayedReviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              truncated={true}
              onShowMore={handleShowMore}
            />
          ))}
        </div>
        {(hasMoreReviews || reviews.length > 1) && (
          <div className="mt-6 flex justify-center border-t border-slate-100 pt-6">
            <Button onClick={() => setDialogOpen(true)} variant="outline" className="h-11 rounded-full border-slate-300 bg-white px-6 font-bold hover:bg-slate-50">
              Show all reviews <ChevronRight className="ms-2 h-4 w-4 rtl:rotate-180" />
            </Button>
          </div>
        )}
      </section>

      <AllReviewsDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        reviews={reviews}
        averageRating={averageRating}
        reviewCount={reviewCount}
        scrollToReviewId={scrollToReviewId}
      />
    </>
  );
};
