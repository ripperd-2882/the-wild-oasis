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
    <div className="fixed bottom-6 right-6 z-50">
      <button
        type="button"
        onClick={() => setIsLoaded(true)}
        aria-label="Open AI Concierge"
        className="ai-concierge-orb"
      >
        ✦
      </button>
    </div>
  );
}
