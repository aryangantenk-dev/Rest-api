import type { Metadata } from "next";
import { AccountPanel } from "@/components/account-panel";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Akun",
  description: "Lihat, salin, dan ganti API key kamu.",
  alternates: { canonical: "/akun" },
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
      <AccountPanel fallback={SITE_URL} />
    </div>
  );
}
