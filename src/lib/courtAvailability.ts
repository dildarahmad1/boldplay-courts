import { supabase } from "@/integrations/supabase/client";

/**
 * Live availability channel for a single court.
 * Anyone viewing the court (players and the venue owner) listens on this topic,
 * so a new booking or a blocked hour refreshes every open slot grid instantly.
 */
export const courtChannelName = (listingId: string) => `court:${listingId}`;

export async function notifyCourtAvailabilityChanged(listingId: string) {
  const channel = supabase.channel(courtChannelName(listingId));
  await new Promise<void>(resolve => {
    channel.subscribe(status => {
      if (status === "SUBSCRIBED") resolve();
    });
    setTimeout(resolve, 2000);
  });
  await channel.send({
    type: "broadcast",
    event: "availability_changed",
    payload: { listing_id: listingId },
  });
  supabase.removeChannel(channel);
}
