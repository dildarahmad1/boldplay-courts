import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, X } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import FormSelect from "@/components/listing/FormSelect";
import FormInput from "@/components/listing/FormInput";
import FormTextarea from "@/components/listing/FormTextarea";
import { useDemoData } from "@/hooks/useDemoData";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreateDisputeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  listingTitle: string;
}

const DISPUTE_CATEGORIES = [
  { value: "refund_request", label: "Refund Request" },
  { value: "policy_violation", label: "Policy Violation" },
  { value: "property_damage", label: "Property Damage" },
  { value: "cleanliness_issue", label: "Cleanliness Issue" },
  { value: "amenity_issue", label: "Amenity Issue" },
  { value: "safety_concern", label: "Safety Concern" },
  { value: "billing_dispute", label: "Billing Dispute" },
  { value: "other", label: "Other" },
];

export const CreateDisputeDialog = ({
  open,
  onOpenChange,
  bookingId,
  listingTitle,
}: CreateDisputeDialogProps) => {
  const { toast } = useToast();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDemoMode, getBooking, createDisputeWithSupportThread } = useDemoData();
  
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [requestedRefund, setRequestedRefund] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const previewUrlsRef = useRef(previewUrls);
  previewUrlsRef.current = previewUrls;
  const uploadedPaths = useRef<string[]>([]);
  const t = (text: string) => translateUiText(text, language);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024)) {
        toast({ title: t("Check your photos"), description: t("Choose JPG, PNG or WEBP images smaller than 10 MB each."), variant: "destructive" });
        e.target.value = "";
        return;
      }
      if (attachmentFiles.length + files.length > 5) {
        toast({
          title: "Too many files",
          description: "You can upload a maximum of 5 images",
          variant: "destructive",
        });
        return;
      }
      
      // Create preview URLs for new images
      const newPreviews = files.map(file => URL.createObjectURL(file));
      setAttachmentFiles([...attachmentFiles, ...files]);
      setPreviewUrls([...previewUrls, ...newPreviews]);
    }
  };

  const handleRemoveFile = (index: number) => {
    // Revoke the object URL to free memory
    URL.revokeObjectURL(previewUrls[index]);
    
    setAttachmentFiles(attachmentFiles.filter((_, i) => i !== index));
    setPreviewUrls(previewUrls.filter((_, i) => i !== index));
  };

  const uploadAttachments = async (): Promise<string[]> => {
    if (attachmentFiles.length === 0) return [];

    const uploadedUrls: string[] = [];
    setUploadingFiles(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      for (const file of attachmentFiles) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}_${Math.random()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("dispute-attachments")
          .upload(fileName, file);

        if (uploadError) throw uploadError;
        uploadedPaths.current.push(fileName);

        const { data, error: signedUrlError } = await supabase.storage
          .from("dispute-attachments")
          .createSignedUrl(fileName, 60 * 60 * 24 * 7);

        if (signedUrlError) throw signedUrlError;
        uploadedUrls.push(data.signedUrl);
      }
    } finally {
      setUploadingFiles(false);
    }

    return uploadedUrls;
  };

  const handleSubmit = async () => {
    const refundAmount = requestedRefund.trim() ? Number(requestedRefund) : null;
    if (refundAmount !== null && (!Number.isSafeInteger(refundAmount) || refundAmount <= 0)) {
      toast({ title: translateUiText("Invalid refund amount", language), description: translateUiText("Enter a positive whole amount in IQD.", language), variant: "destructive" });
      return;
    }
    if (!category || !description.trim()) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    uploadedPaths.current = [];

    try {
      // Get current user
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("Not authenticated");
      
      const attachmentUrls = await uploadAttachments();
      const categoryLabel = DISPUTE_CATEGORIES.find(cat => cat.value === category)?.label || "Support Request";
      
      // Demo mode: use localStorage
      if (isDemoMode) {
        // Get listing ID from booking
        const booking = getBooking(bookingId);
        if (!booking) throw new Error("Booking not found");
        
        const result = createDisputeWithSupportThread(
          bookingId,
          booking.listing_id,
          category,
          categoryLabel,
          description,
          refundAmount,
          attachmentUrls
        );
        
        if (!result?.success) {
          throw new Error("Failed to create dispute");
        }

        toast({
          title: "Dispute submitted",
          description: "Our support team will review your case shortly.",
        });

        onOpenChange(false);
        
        // Use same path detection as real mode
        const inboxPath = location.pathname.startsWith("/host") 
          ? "/host/inbox" 
          : location.pathname.startsWith("/admin")
          ? "/admin/support"
          : "/guest/inbox";
        
        navigate(inboxPath, {
          state: { threadId: result.thread_id },
        });
        return;
      }
      
      // Real mode: call RPC
      const { data: result, error } = await supabase.rpc(
        "create_dispute_with_support_thread",
        {
          p_booking_id: bookingId,
          p_category: category as any,
          p_subject: categoryLabel,
          p_description: description,
          p_requested_refund_amount: refundAmount,
          p_attachment_urls: attachmentUrls,
        }
      );

      if (error) throw error;

      const response = result as { success: boolean; error?: string; thread_id?: string };

      if (!response?.success) {
        throw new Error(response?.error || "Failed to create dispute");
      }

      toast({
        title: "Dispute submitted",
        description: "Our support team will review your case shortly.",
      });

      uploadedPaths.current = [];
      setCategory(""); setDescription(""); setRequestedRefund(""); setAttachmentFiles([]);
      previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      setPreviewUrls([]);
      onOpenChange(false);
      window.dispatchEvent(new Event("yarika:messages-changed"));

      const inboxPath = location.pathname.startsWith("/host") 
        ? "/host/inbox" 
        : location.pathname.startsWith("/admin")
        ? "/admin/support"
        : "/guest/inbox";
      
      navigate(inboxPath, {
        state: { threadId: response.thread_id },
      });
    } catch (error: any) {
      console.error("Error creating dispute:", error);
      if (uploadedPaths.current.length) {
        await supabase.storage.from("dispute-attachments").remove(uploadedPaths.current);
        uploadedPaths.current = [];
      }
      const message = typeof error?.message === "string" ? error.message : "";
      const localized = t(message);
      toast({
        title: t("Error"),
        description: localized && localized !== message ? localized : t("Failed to submit dispute. Please try again."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Report an Issue or Contact Support</DialogTitle>
          <DialogDescription>
            Submit a dispute or issue regarding your booking for <strong>{listingTitle}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 overflow-y-auto -mx-2 px-2"
          style={{ maxHeight: 'calc(90vh - 200px)' }}
        >
          <FormSelect
            label="Issue Category *"
            value={category}
            onChange={setCategory}
            options={DISPUTE_CATEGORIES}
            required
          />

          <FormTextarea
            label="Description *"
            value={description}
            onChange={setDescription}
            required
            rows={6}
            maxLength={2000}
          />
          <p className="text-xs text-muted-foreground -mt-4">
            {description.length}/2000 characters
          </p>

          <div className="space-y-2">
            <Label htmlFor="requested-refund-iqd">{translateUiText("Requested Refund Amount (IQD, Optional)", language)}</Label>
            <div className="relative">
              <Input id="requested-refund-iqd" type="number" inputMode="numeric" min="1" step="1" value={requestedRefund} onChange={e => setRequestedRefund(e.target.value)} placeholder="0" dir="ltr" className="h-12 rounded-xl pe-16" />
              <span className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500" aria-hidden="true">IQD</span>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Image Attachments (Optional, max 5 images)</p>
            <div className="border-2 border-dashed border-[#D5DAE7] rounded-2xl p-6 bg-white">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center cursor-pointer"
              >
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Click to upload images
                </p>
              </label>
            </div>

            {previewUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {previewUrls.map((url, index) => (
                  <div key={index} className="relative aspect-square group">
                    <img 
                      src={url} 
                      alt={`Preview ${index + 1}`}
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <Button
                      type="button"
                      className="absolute top-1 right-1 h-7 w-7 p-0 opacity-90 group-hover:opacity-100 transition-opacity"
                      variant="destructive"
                      size="icon"
                      onClick={() => handleRemoveFile(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || uploadingFiles}>
            {loading || uploadingFiles ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {uploadingFiles ? "Uploading..." : "Submitting..."}
              </>
            ) : (
              "Submit Dispute"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
