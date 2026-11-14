import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { HAS_EMAIL, HAS_GOOGLE } from "@/lib/auth/config";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Masuk",
  description: `Masuk ke ${SITE_NAME} dengan Google atau email untuk mendapat API key gratis.`,
  alternates: { canonical: "/login" },
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
      {/* useSearchParams di dalam form butuh Suspense; kerangka ini memesan tempatnya. */}
      <Suspense fallback={<div className="h-[28rem] border border-line bg-card" aria-hidden />}>
        <LoginForm google={HAS_GOOGLE} email={HAS_EMAIL} />
      </Suspense>
    </div>
  );
}
