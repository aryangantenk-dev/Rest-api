"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Daftar yang anak-anaknya masuk berurutan (40 ms per item) saat pertama terlihat.
 * Keadaan tersembunyi hanya dipasang lewat skrip pada daftar yang masih di bawah layar,
 * sehingga tanpa JavaScript, atau bila gerak dikurangi, isinya langsung tampil.
 * Beri tiap anak `style={{ "--i": urutan }}`.
 */
export function Stagger({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add("stagger-wait");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.replace("stagger-wait", "stagger-go");
        io.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      el.classList.remove("stagger-wait");
    };
  }, []);

  return (
    <ul ref={ref} className={className}>
      {children}
    </ul>
  );
}
