import type { CategoryId } from "@/lib/api/types";

type P = { className?: string };

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function CategoryIcon({ id, className }: { id: CategoryId } & P) {
  switch (id) {
    case "ai":
      return (
        <svg {...base} className={className}>
          <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
          <path d="M19 15l.7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7L19 15z" />
        </svg>
      );
    case "tools":
      return (
        <svg {...base} className={className}>
          <path d="M14.7 6.3a4 4 0 0 0-5 5L3.5 17.5a1.8 1.8 0 0 0 2.5 2.5l6.2-6.2a4 4 0 0 0 5-5l-2.5 2.5-2.2-.5-.5-2.2 2.5-2.3z" />
        </svg>
      );
    case "text":
      return (
        <svg {...base} className={className}>
          <path d="M4 6h16M4 12h10M4 18h16" />
        </svg>
      );
    case "image":
      return (
        <svg {...base} className={className}>
          <rect x="3" y="4" width="18" height="16" rx="1" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M21 16l-5-5-8 8" />
        </svg>
      );
    case "random":
      return (
        <svg {...base} className={className}>
          <rect x="4" y="4" width="16" height="16" rx="1" />
          <circle cx="9" cy="9" r="1" fill="currentColor" />
          <circle cx="15" cy="15" r="1" fill="currentColor" />
          <circle cx="15" cy="9" r="1" fill="currentColor" />
          <circle cx="9" cy="15" r="1" fill="currentColor" />
        </svg>
      );
    case "islami":
      return (
        <svg {...base} className={className}>
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
        </svg>
      );
    case "info":
      return (
        <svg {...base} className={className}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z" />
        </svg>
      );
    case "komik":
      return (
        <svg {...base} className={className}>
          <path d="M12 6.5C10.2 5.2 7.6 4.8 4 5v13c3.6-.2 6.2.2 8 1.5 1.8-1.3 4.4-1.7 8-1.5V5c-3.6-.2-6.2.2-8 1.5z" />
          <path d="M12 6.5v13" />
        </svg>
      );
    case "canvas":
      return (
        <svg {...base} className={className}>
          <path d="M4 20l1.2-4.2L16.5 4.500a2.100 2.100 0 0 1 3 3L8.200 18.800 4 20z" />
          <path d="M14.500 6.500l3 3" />
        </svg>
      );
    case "search":
      return (
        <svg {...base} className={className}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.200-4.200" />
        </svg>
      );
    case "downloader":
      return (
        <svg {...base} className={className}>
          <path d="M12 4v11M7.500 10.500L12 15l4.500-4.500" />
          <path d="M5 19h14" />
        </svg>
      );
    case "games":
      return (
        <svg {...base} className={className}>
          <rect x="2.500" y="7" width="19" height="11" rx="5.500" />
          <path d="M7 12.500h4M9 10.500v4" />
          <circle cx="15.500" cy="11.500" r="0.900" fill="currentColor" />
          <circle cx="18" cy="13.500" r="0.900" fill="currentColor" />
        </svg>
      );
    case "anime":
      return (
        <svg {...base} className={className}>
          <rect x="3" y="5" width="18" height="13" rx="1" />
          <path d="M10 9l5 2.5-5 2.5V9z" />
          <path d="M8 21h8" />
        </svg>
      );
    case "film":
      return (
        <svg {...base} className={className}>
          <rect x="3" y="4" width="18" height="16" rx="1" />
          <path d="M7.5 4v16M16.5 4v16M3 9h4.5M3 15h4.5M16.5 9H21M16.5 15H21" />
        </svg>
      );
  }
}

export function ArrowIcon({ className }: P) {
  return (
    <svg {...base} width={18} height={18} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ExternalIcon({ className }: P) {
  return (
    <svg {...base} width={18} height={18} className={className}>
      <path d="M14 5h5v5M19 5l-8 8M11 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-5" />
    </svg>
  );
}

export function CopyIcon({ className }: P) {
  return (
    <svg {...base} width={18} height={18} className={className}>
      <rect x="8.5" y="8.5" width="11" height="11" />
      <path d="M15.5 8.5v-4h-11v11h4" />
    </svg>
  );
}

export function CheckIcon({ className }: P) {
  return (
    <svg {...base} width={18} height={18} className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function SearchIcon({ className }: P) {
  return (
    <svg {...base} width={18} height={18} className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

export function ChevronIcon({ className }: P) {
  return (
    <svg {...base} width={18} height={18} className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function PlayIcon({ className }: P) {
  return (
    <svg {...base} width={18} height={18} className={className}>
      <path d="M8 5.5v13l10.5-6.5L8 5.5z" />
    </svg>
  );
}

export function SunIcon({ className }: P) {
  return (
    <svg {...base} width={20} height={20} className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

export function MoonIcon({ className }: P) {
  return (
    <svg {...base} width={20} height={20} className={className}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  );
}

export function MenuIcon({ className }: P) {
  return (
    <svg {...base} width={20} height={20} className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function CloseIcon({ className }: P) {
  return (
    <svg {...base} width={20} height={20} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Tanda merek: kotak tajam berwarna aksen dengan huruf Y. */
export function LogoMark({ className }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" fill="var(--accent)" />
      <path d="M9 8l7 9.5V25M23 8l-7 9.5" stroke="var(--on-accent)" strokeWidth="3.2" strokeLinecap="square" strokeLinejoin="miter" fill="none" />
    </svg>
  );
}

export function KeyIcon({ className }: P) {
  return (
    <svg {...base} width={20} height={20} className={className}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M16 7l3 3M14 9l2 2" />
    </svg>
  );
}

export function UserIcon({ className }: P) {
  return (
    <svg {...base} width={20} height={20} className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function EyeIcon({ className }: P) {
  return (
    <svg {...base} width={20} height={20} className={className}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon({ className }: P) {
  return (
    <svg {...base} width={20} height={20} className={className}>
      <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.9M6.5 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    </svg>
  );
}

export function LogoutIcon({ className }: P) {
  return (
    <svg {...base} width={20} height={20} className={className}>
      <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export function RefreshIcon({ className }: P) {
  return (
    <svg {...base} width={20} height={20} className={className}>
      <path d="M20 11a8 8 0 0 0-14.3-4.4L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.4L20 15.5M20 20v-4.5h-4.5" />
    </svg>
  );
}

export function MailIcon({ className }: P) {
  return (
    <svg {...base} width={20} height={20} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

/** Logo "G" resmi Google (warna merek, jangan diubah). */
export function GoogleIcon({ className }: P) {
  return (
    <svg width={20} height={20} viewBox="0 0 48 48" aria-hidden className={className}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.75 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
