import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FAQAccordion } from "@/components/shared/FAQAccordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Footer from "@/components/Footer";
import heroImage from "@/assets/kurdistan-multisport-hero.jpg";

const FAQ = () => {
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const { data: faqs, isLoading } = useQuery({
    queryKey: ['published-faqs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faqs')
        .select('id, question, answer, category')
        .eq('status', 'published')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const categories = [
    { value: 'all', label: 'All' },
    { value: 'general', label: 'General' },
    { value: 'booking', label: 'Booking' },
    { value: 'payment', label: 'Payment' },
    { value: 'host', label: 'Host' },
    { value: 'support', label: 'Support' },
  ];

  const filteredFaqs = activeCategory === 'all' 
    ? faqs 
    : faqs?.filter(faq => faq.category === activeCategory);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <section className="relative isolate flex min-h-[440px] items-center overflow-hidden bg-slate-950 px-4 pb-16 pt-28" style={{ backgroundImage: `url(${heroImage})`, backgroundPosition: "center", backgroundSize: "cover" }}>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/65 via-slate-950/65 to-slate-950/90" />
        <div className="mx-auto max-w-3xl text-center text-white">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/75">Answers made simple</p>
          <h1 className="mb-4 text-4xl font-semibold tracking-tight md:text-6xl">
            Frequently Asked Questions
          </h1>
          <p className="mx-auto max-w-2xl text-base text-white/80 sm:text-xl">
            Find answers to common questions about booking sports courts and playgrounds
          </p>
        </div>
      </section>

      <div className="container mx-auto flex-grow px-4 py-16">

        {/* Category Tabs */}
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
          <TabsList className="mb-8 h-auto w-full justify-start gap-2 overflow-x-auto bg-transparent p-0 pb-2 sm:flex-wrap">
            {categories.map((category) => (
              <TabsTrigger 
                key={category.value} 
                value={category.value}
                className="flex-none rounded-full border border-slate-200 bg-white px-6 py-2.5 shadow-sm data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {category.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeCategory} className="mt-0">
            {isLoading ? (
              <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))}
              </div>
            ) : filteredFaqs && filteredFaqs.length > 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <FAQAccordion faqs={filteredFaqs} />
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white py-12 text-center shadow-sm">
                <p className="text-muted-foreground text-lg">
                  No FAQs available in this category.
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

export default FAQ;
