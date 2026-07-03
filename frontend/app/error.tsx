"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bp-bg-primary text-bp-text-primary p-4">
      <div className="bg-bp-bg-secondary p-8 rounded-lg border border-bp-border max-w-md w-full text-center">
        <h2 className="text-xl font-bold text-bp-red mb-2">Something went wrong!</h2>
        <p className="text-sm text-bp-text-secondary mb-6">
          {error.message || "An unexpected error occurred in the application."}
        </p>
        <button
          onClick={() => reset()}
          className="px-6 py-2 bg-bp-bg-tertiary hover:bg-bp-border text-bp-text-primary font-medium rounded transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
