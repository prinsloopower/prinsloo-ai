"use client";

import { ReactNode } from "react";
import { ChatbotProvider } from "./app/_contexts/ChatbotProvider";

export function Providers({ children }: { children: ReactNode }) {
  return <ChatbotProvider>{children}</ChatbotProvider>;
}