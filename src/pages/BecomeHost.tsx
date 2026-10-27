import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, DollarSign, Shield, Calendar, Loader2, Users2, TrendingUp, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AuthDialog } from "@/components/AuthDialog";
import Footer from "@/components/Footer";
import heroImage from "@/assets/kurdistan-multisport-hero.jpg";

const BecomeHost = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const isLoading = false;

  const handleBecomeHost = () => {
    if (user) navigate("/host/dashboard");
    else setAuthOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} initialTarget="host" />
      {/* Hero Section */}
      <section className="relative isolate flex min-h-[560px] items-center overflow-hidden bg-slate-950 py-28" style={{ backgroundImage: `url(${heroImage})`, backgroundPosition: "center", backgroundSize: "cover" }}>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/65 via-slate-950/55 to-slate-950/85" />
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center text-white">
            <div className="mb-5 inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] backdrop-blur-md">Grow with Yarika</div>
            <h1 className="mb-6 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">Turn your venue into a thriving sports destination</h1>
            <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-white/80 sm:text-xl">
              Share your sports court or playground and earn extra income by hosting players from around your city. Join venue owners making money on their terms.
            </p>
            <Button 
              size="lg" 
              className="h-13 rounded-full bg-white px-7 font-semibold text-primary shadow-xl hover:bg-white/90"
              onClick={handleBecomeHost}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "List Your Court"
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Built for venue owners</p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Why list with Yarika?</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="rounded-3xl border-slate-200 bg-white shadow-sm transition-transform hover:-translate-y-1">
            <CardContent className="p-6 text-center">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Home className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Easy Setup</h3>
              <p className="text-sm text-muted-foreground">
                List your court in minutes with our simple setup process
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-200 bg-white shadow-sm transition-transform hover:-translate-y-1">
            <CardContent className="p-6 text-center">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Earn Money</h3>
              <p className="text-sm text-muted-foreground">
                Set your hourly prices and earn income every time the court is booked
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-200 bg-white shadow-sm transition-transform hover:-translate-y-1">
            <CardContent className="p-6 text-center">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Secure Platform</h3>
              <p className="text-sm text-muted-foreground">
                Protected payments and verified player reviews for peace of mind
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-200 bg-white shadow-sm transition-transform hover:-translate-y-1">
            <CardContent className="p-6 text-center">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Full Control</h3>
              <p className="text-sm text-muted-foreground">
                Manage your availability and time slots whenever you want
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="border-y border-slate-200 bg-white py-20">
        <div className="container mx-auto px-4">
          <h2 className="mb-12 text-center text-3xl font-semibold tracking-tight sm:text-4xl">How it works</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="flex flex-col items-center text-center relative">
              <div className="mb-4 relative">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Home className="h-8 w-8 text-primary" />
                </div>
                <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  1
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-2">List your court</h3>
              <p className="text-sm text-muted-foreground">
                Create your venue listing in minutes with photos and details about your court
              </p>
              <div className="hidden md:block absolute top-8 -right-4 text-muted-foreground">
                <ArrowRight className="h-6 w-6" />
              </div>
            </div>

            <div className="flex flex-col items-center text-center relative">
              <div className="mb-4 relative">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users2 className="h-8 w-8 text-primary" />
                </div>
                <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  2
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-2">Welcome players</h3>
              <p className="text-sm text-muted-foreground">
                Approve bookings and communicate with players through our messaging system
              </p>
              <div className="hidden md:block absolute top-8 -right-4 text-muted-foreground">
                <ArrowRight className="h-6 w-6" />
              </div>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="mb-4 relative">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-8 w-8 text-primary" />
                </div>
                <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  3
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-2">Get paid</h3>
              <p className="text-sm text-muted-foreground">
                Receive automatic payouts after each booking, securely transferred to your account
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-20">
        <div className="container mx-auto rounded-[2rem] bg-slate-950 px-6 py-14 text-center text-white sm:px-12">
          <h2 className="mb-4 text-3xl font-semibold tracking-tight">Ready to get started?</h2>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-white/70">
            Join venue owners earning income by sharing their sports courts and playgrounds
          </p>
          <Button 
            size="lg"
            className="rounded-full px-7"
            onClick={handleBecomeHost}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "List Your Court"
            )}
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default BecomeHost;
