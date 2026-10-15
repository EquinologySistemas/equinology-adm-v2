"use client";
import { useEffect, useState } from "react";
import { useApiContext } from "@/context/ApiContext";
type Limit = {
  currentUsers: number;
  maxUsers: number;
  planName: string;
  hasActiveSignature: boolean;
};
export function CompanyUserLimit({ companyId }: { companyId: string }) {
  const { GetAPI } = useApiContext();
  const [limit, setLimit] = useState<(Limit & { companyId: string }) | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    if (companyId)
      void GetAPI("/admin/companies/" + companyId + "/user-limit", true).then(
        (res) => {
          if (!cancelled && res.status === 200)
            setLimit({ ...res.body, companyId });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [companyId, GetAPI]);
  if (!limit || limit.companyId !== companyId) return null;
  return (
    <p className="rounded-lg bg-[var(--dash-bg)] p-3 text-sm">
      Usuários:{" "}
      <strong>
        {limit.currentUsers} /{" "}
        {limit.hasActiveSignature
          ? limit.maxUsers < 0
            ? "ilimitado"
            : limit.maxUsers
          : "sem plano"}
      </strong>{" "}
      · {limit.planName}
    </p>
  );
}
