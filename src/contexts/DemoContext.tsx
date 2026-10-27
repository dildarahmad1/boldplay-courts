import { ReactNode } from "react";

// Compatibility API for existing consumers. Production never uses local demo data.
const productionState = {
  isDemoMode: false,
  setIsDemoMode: (_value: boolean) => {},
  demoUserId: null as string | null,
  migrationComplete: true,
};
export const DemoProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
export const useDemoMode = () => productionState;
