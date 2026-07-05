"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "trustvault-cookie-consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const consented = localStorage.getItem(STORAGE_KEY);
    if (!consented) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-700 p-4">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-sm text-gray-300">
          We use only essential cookies for authentication. No tracking, analytics, or advertising cookies.
          See our{" "}
          <a href="/privacy" className="text-indigo-400 underline hover:text-indigo-300">
            Privacy Policy
          </a>
          .
        </p>
        <button
          onClick={accept}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg shrink-0 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
