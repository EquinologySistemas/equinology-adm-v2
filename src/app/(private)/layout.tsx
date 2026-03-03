import { PrivateLayoutClient } from "@/components/layout/PrivateLayoutClient";

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PrivateLayoutClient>{children}</PrivateLayoutClient>;
}
