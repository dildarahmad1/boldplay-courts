import Footer from "@/components/Footer";
import heroImage from "@/assets/kurdistan-multisport-hero.jpg";
const Support = () => {
  return <div className="flex min-h-screen flex-col bg-slate-50">
      <section className="relative isolate flex min-h-[440px] items-center overflow-hidden bg-slate-950 px-4 pb-16 pt-28" style={{ backgroundImage: `url(${heroImage})`, backgroundPosition: "center", backgroundSize: "cover" }}>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/65 via-slate-950/65 to-slate-950/90" />
        <div className="mx-auto max-w-3xl text-center text-white">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/75">Yarika support</p>
          <h1 className="mb-4 text-4xl font-semibold tracking-tight md:text-6xl">
            Support Center
          </h1>
          <p className="mx-auto max-w-2xl text-base text-white/80 sm:text-xl">
            We're here to help you with any questions or concerns
          </p>
        </div>
      </section>

      <div className="container mx-auto flex-grow px-4 py-16">

        {/* Additional Info */}
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-xl">?</div>
          <h3 className="mb-4 text-2xl font-semibold tracking-tight">Need immediate assistance?</h3>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            For urgent matters related to active bookings, safety concerns, or payment issues, please contact us 
          </p>
        </div>
      </div>

      <Footer />
    </div>;
};
export default Support;
