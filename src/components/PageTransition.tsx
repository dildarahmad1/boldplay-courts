import { motion } from "framer-motion";
import { ReactNode } from "react";
import { useLocation } from "react-router-dom";

const PageTransition = ({ children }: { children: ReactNode }) => {
  const location = useLocation();

  return (
    <motion.div
      key={location.pathname}
      initial={false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="[&_h1]:animate-[fade-in_500ms_ease-out] [&_h2]:animate-[fade-in_600ms_ease-out] [&_p]:animate-[fade-in_700ms_ease-out]"
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
