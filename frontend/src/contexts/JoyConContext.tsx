import { createContext, useContext, type ReactNode } from "react";
import { useJoyCon, type UseJoyConResult } from "../hooks/useJoyCon";

const JoyConContext = createContext<UseJoyConResult | null>(null);

export function JoyConProvider({ children }: { children: ReactNode }) {
  const joyCon = useJoyCon();
  return <JoyConContext.Provider value={joyCon}>{children}</JoyConContext.Provider>;
}

export function useJoyConContext(): UseJoyConResult {
  const context = useContext(JoyConContext);
  if (!context) {
    throw new Error("useJoyConContext must be used within a JoyConProvider");
  }
  return context;
}
