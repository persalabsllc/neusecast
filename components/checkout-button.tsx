"use client";

import { useState } from "react";
import { CreditCard, LoaderCircle } from "lucide-react";

export function CheckoutButton({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function beginCheckout() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const result = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !result.url) {
        throw new Error(result.error ?? "Checkout is temporarily unavailable.");
      }

      window.location.assign(result.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout is temporarily unavailable.");
      setLoading(false);
    }
  }

  return (
    <div className="checkout-action">
      <button className="button button-primary" type="button" onClick={beginCheckout} disabled={loading}>
        {loading ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <CreditCard size={17} aria-hidden="true" />}
        {loading ? "Opening secure checkout…" : "Pay campaign"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
