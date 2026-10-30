"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/post-json";
import { decimalToCents } from "@/src/domain/money";

export function TopUp({ purseId }: { purseId: string }) {
  const router = useRouter();
  const [dollars, setDollars] = useState("100");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PayPal mock refused that step.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const cents = decimalToCents(dollars);
        if (cents == null || cents <= 0) {
          setMessage("Enter a dollar amount like 100 or 25.50.");
          return;
        }
        void run(async () => {
          const payload = await postJson(`/api/purses/${purseId}/topups`, { amountCents: cents });
          const order = payload.order as { id: string; status: string };
          setOrderId(order.id);
          setOrderStatus(order.status);
          setMessage(`${order.id} is created. Approve it as the sandbox buyer. Nothing is funded yet.`);
        });
      }}
    >
      <label htmlFor="topup-amount">Top up with PayPal</label>
      <input
        id="topup-amount"
        name="amount"
        inputMode="decimal"
        value={dollars}
        onChange={(event) => setDollars(event.target.value)}
        aria-describedby="topup-help"
      />
      <p id="topup-help" className="muted">
        Mock checkout. Created, then approved, then captured.
        {orderStatus ? ` Current order status: ${orderStatus}.` : ""}
      </p>
      <div className="actions">
        <button className="btn" type="submit" disabled={pending}>
          Create order
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={pending || !orderId || orderStatus !== "CREATED"}
          onClick={() => {
            if (!orderId) return;
            void run(async () => {
              const payload = await postJson(`/api/paypal/orders/${orderId}/approve`);
              const order = payload.order as { status: string };
              setOrderStatus(order.status);
              setMessage(`${orderId} is approved. Capture it to fund the purse.`);
            });
          }}
        >
          Approve
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={pending || !orderId || orderStatus !== "APPROVED"}
          onClick={() => {
            if (!orderId) return;
            void run(async () => {
              const payload = await postJson(`/api/paypal/orders/${orderId}/capture`);
              const order = payload.order as { status: string };
              setOrderStatus(order.status);
              setOrderId(null);
              setMessage("Captured. The purse balance includes this top-up.");
              router.refresh();
            });
          }}
        >
          Capture
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
