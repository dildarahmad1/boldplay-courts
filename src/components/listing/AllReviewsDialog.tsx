import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReviewCard } from "./ReviewCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MessageSquareText, Star } from "lucide-react";

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

interface AllReviewsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reviews: Review[];
  averageRating: number;
  reviewCount: number;
  scrollToReviewId?: string;
}

export const AllReviewsDialog = ({
  open,
  onOpenChange,
  reviews,
  averageRating,
  reviewCount,
  scrollToReviewId,
}: AllReviewsDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-w-4xl flex-col overflow-hidden rounded-[1.75rem] border-slate-200 bg-slate-50 p-0 shadow-2xl">
        <DialogHeader className="flex-shrink-0 bg-white p-6 sm:p-7">
          <DialogTitle className="sr-only">Reviews</DialogTitle>
          <div className="flex items-center gap-4 pe-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <MessageSquareText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-950">Player reviews</h2>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="font-bold text-slate-900">{averageRating.toFixed(1)}</span>
                <span className="text-slate-500">
                ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>
        
        <Separator className="flex-shrink-0 my-0" />

        <ScrollArea className="min-h-0 flex-1">
          <div className="grid grid-cols-1 gap-4 p-5 sm:p-6 md:grid-cols-2">
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                truncated={false}
                highlightId={scrollToReviewId}
              />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
