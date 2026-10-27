import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Home, CreditCard, MessageSquare, Shield, FileText, Search } from "lucide-react";
import Footer from "@/components/Footer";
import heroImage from "@/assets/kurdistan-multisport-hero.jpg";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

const HelpCenter = () => {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { language } = useLanguage();
  const t = (text: string) => translateUiText(text, language);

  const categories = [
    { value: 'all', label: 'All Topics', icon: BookOpen },
    { value: 'getting-started', label: 'Getting Started', icon: Home },
    { value: 'booking', label: 'Booking', icon: FileText },
    { value: 'payments', label: 'Payments', icon: CreditCard },
    { value: 'communication', label: 'Communication', icon: MessageSquare },
    { value: 'safety', label: 'Safety & Security', icon: Shield },
  ];

  const articles = [
    {
      category: 'getting-started',
      title: 'How to Create an Account',
      description: 'Learn how to sign up and set up your profile on our platform.',
      content: 'Creating an account is simple. Click the Sign Up button in the top right corner, enter your email address and create a password. You\'ll receive a confirmation email to verify your account.'
    },
    {
      category: 'getting-started',
      title: 'Understanding Your Dashboard',
      description: 'Navigate through your personal dashboard and manage your activities.',
      content: 'Your dashboard is your central hub for all activities. From here you can view bookings, messages, payments, and update your profile settings.'
    },
    {
      category: 'booking',
      title: 'How to Book a Court',
      description: 'Step-by-step guide to booking a sports court on our platform.',
      content: 'To book a court, search for your city or area, select your date and preferred time slot, choose a venue from the results, and click Book Now. Review the details and complete the payment to confirm your booking.'
    },
    {
      category: 'booking',
      title: 'Cancellation Policy',
      description: 'Learn about our cancellation policies and refund process.',
      content: 'Cancellation policies vary by venue. You can view the specific policy for each court on its detail page. Generally, cancellations made more than 24 hours before your booking receive a full refund.'
    },
    {
      category: 'booking',
      title: 'Modifying Your Booking',
      description: 'How to change dates or time slots for your existing booking.',
      content: 'To modify your booking, go to your bookings page, select the booking you want to change, and contact the venue owner through the messaging system to discuss changes.'
    },
    {
      category: 'payments',
      title: 'Payment Methods',
      description: 'Accepted payment methods and how to add them to your account.',
      content: 'Bookings currently use cash payment. Confirm your time online, then pay the venue directly when you arrive.'
    },
    {
      category: 'payments',
      title: 'Payment Schedule',
      description: 'When and how payments are processed.',
      content: 'Your booking is confirmed online, and you pay the venue in cash when you arrive. Keep your booking confirmation until the visit is complete.'
    },
    {
      category: 'payments',
      title: 'Refund Process',
      description: 'How refunds work and when to expect them.',
      content: 'Refunds follow the court cancellation policy. Because payment is made in cash, contact the court through Yarika to arrange any approved refund.'
    },
    {
      category: 'communication',
      title: 'Messaging Venue Owners and Players',
      description: 'How to communicate through our messaging system.',
      content: 'Use our secure messaging system to communicate with venue owners or players. Access messages from your inbox. All booking-related communications should happen through our platform.'
    },
    {
      category: 'communication',
      title: 'Notifications Settings',
      description: 'Manage your email and push notification preferences.',
      content: 'Control your notification preferences in your account settings. You can choose to receive notifications for bookings, messages, reminders, and promotional content.'
    },
    {
      category: 'safety',
      title: 'Platform Safety Guidelines',
      description: 'Best practices for staying safe on our platform.',
      content: 'Always communicate through our platform, verify venue details, read reviews from previous players, and report any suspicious activity to our support team immediately.'
    },
    {
      category: 'safety',
      title: 'Dispute Resolution',
      description: 'How to file and resolve disputes.',
      content: 'If you encounter an issue with a booking, you can file a dispute through your booking page. Our support team will review the case and work with both parties to reach a fair resolution.'
    },
  ];

  const filteredArticles = articles.filter((article) => {
    const matchesCategory = activeCategory === 'all' || article.category === activeCategory;
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || `${t(article.title)} ${t(article.description)} ${t(article.content)}`.toLocaleLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <section className="relative isolate flex min-h-[500px] items-center overflow-hidden bg-slate-950 px-4 pb-20 pt-28" style={{ backgroundImage: `url(${heroImage})`, backgroundPosition: "center", backgroundSize: "cover" }}>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/65 via-slate-950/60 to-slate-950/90" />
        <div className="mx-auto w-full max-w-3xl text-center text-white">
          <div className="mb-5 inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] backdrop-blur-md">{t("Support when you need it")}</div>
          <h1 className="mb-4 text-4xl font-semibold tracking-tight md:text-6xl">
            {t("Help Center")}
          </h1>
          <p className="mx-auto max-w-2xl text-base text-white/80 sm:text-xl">
            {t("Browse our comprehensive guides and articles about booking sports courts")}
          </p>
          <label className="mx-auto mt-8 flex h-14 max-w-2xl items-center gap-3 rounded-2xl border border-white/40 bg-white px-5 text-left shadow-2xl">
            <Search className="h-5 w-5 flex-none text-primary" />
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t("Search for answers...")} className="h-full min-w-0 flex-1 bg-transparent text-slate-950 outline-none placeholder:text-slate-400" />
          </label>
        </div>
      </section>

      <div className="container mx-auto flex-grow px-4 py-16">

        {/* Category Tabs */}
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
          <TabsList className="mb-8 h-auto w-full justify-start gap-2 overflow-x-auto bg-transparent p-0 pb-2 sm:flex-wrap">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <TabsTrigger 
                  key={category.value} 
                  value={category.value}
                  className="flex flex-none items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 shadow-sm data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Icon className="h-4 w-4" />
                  {t(category.label)}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value={activeCategory} className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredArticles.map((article, index) => (
                <Card 
                  key={index} 
                  className="cursor-pointer rounded-3xl border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardHeader>
                    <CardTitle className="text-xl">{t(article.title)}</CardTitle>
                    <CardDescription>{t(article.description)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {t(article.content)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {filteredArticles.length === 0 && (
              <div className="text-center py-12 rounded-xl" style={{ backgroundColor: '#F8FAFF' }}>
                <p className="text-muted-foreground text-lg">
                  {t("No articles available in this category.")}
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Footer />
    </div>
  );
};

export default HelpCenter;
