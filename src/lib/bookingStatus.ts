/** Only a host-confirmed status is presented as a confirmed booking. */
export function bookingStatusPresentation(status: string) {
  if (status === "pending_host_confirmation") return { title: "Waiting for host approval", message: "Your booking request is waiting for the host to approve it. We will send the details to your inbox after approval.", tone: "waiting" };
  if (status === "confirmed") return { title: "Booking confirmed!", message: "The host accepted your booking. Your court time is reserved. Pay in cash at the venue.", tone: "confirmed" };
  if (status === "completed") return { title: "Booking completed", message: "Your approved booking details are shown below.", tone: "confirmed" };
  if (status === "cancelled_host") return { title: "Booking request declined", message: "The host could not accept this booking. Choose another available time or court.", tone: "closed" };
  if (status === "cancelled_guest" || status === "cancelled") return { title: "Booking cancelled", message: "This booking has been cancelled.", tone: "closed" };
  if (status === "expired") return { title: "Booking request expired", message: "Choose another available time to send a new booking request.", tone: "closed" };
  if (status === "pending_payment") return { title: "Complete your booking request", message: "Submit your request at checkout so the host can review it.", tone: "waiting" };
  return { title: "Booking status unavailable", message: "Refresh the page to check the latest booking status.", tone: "waiting" };
}
