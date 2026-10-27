import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-primary/10 px-4 pt-20">
      <div className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-10 text-center shadow-xl sm:p-14">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-primary">Page not found</p>
        <h1 className="mb-4 text-7xl font-semibold tracking-tight text-slate-950">404</h1>
        <p className="mb-8 text-lg text-muted-foreground">The page you are looking for does not exist or has moved.</p>
        <Button asChild className="h-12 rounded-full px-7"><Link to="/">Return to home</Link></Button>
      </div>
    </div>
  );
};

export default NotFound;
