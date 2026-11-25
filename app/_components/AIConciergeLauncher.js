"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const AIConcierge = dynamic(() => import("./AIConcierge"), {
  ssr: false,
});

export default function AIConciergeLauncher() {
  const [isLoaded, setIsLoaded] = useState(false);

  if (isLoaded) {
    return <AIConcierge initialOpen={true} />;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex justify-end">
      <button
        type="button"
        onClick={() => setIsLoaded(true)}
        aria-label="Open AI Concierge"
        className="ai-concierge-launcher h-16 w-16 rounded-full bg-accent-500 text-primary-950 shadow-xl flex items-center justify-center text-3xl"
      >
        ✦
      </button>
    </div>
  );
}
