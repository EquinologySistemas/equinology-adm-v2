import { subscriptionStatusLabels } from "@/lib/subscriptions-api";

export function SubscriptionStatusBadge({ status }: { status?: string }) {
  if (!status) return <>—</>;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        status === "ACTIVE"
          ? "bg-green-100 text-green-800"
          : status === "TRIAL"
            ? "bg-blue-100 text-blue-800"
            : "bg-gray-100 text-gray-600"
      }`}
    >
      {subscriptionStatusLabels[status] ?? status}
    </span>
  );
}
