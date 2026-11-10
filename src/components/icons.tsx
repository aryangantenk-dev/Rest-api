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
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M21 16l-5-5-8 8" />
        </svg>
      );
    case "random":
      return (
        <svg {...base} className={className}>
          <rect x="4" y="4" width="16" height="16" rx="3.5" />
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
  }
}

export function ArrowIcon({ className }: P) {
  return (
    <svg {...base} strokeWidth={1.8} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function CopyIcon({ className }: P) {
  return (
    <svg {...base} width={16} height={16} className={className}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" />
    </svg>
  );
}

export function CheckIcon({ className }: P) {
  return (
    <svg {...base} width={16} height={16} strokeWidth={2} className={className}>
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
    <svg {...base} width={18} height={18} strokeWidth={1.8} className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function PlayIcon({ className }: P) {
  return (
    <svg {...base} width={14} height={14} fill="currentColor" stroke="none" className={className}>
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
    </svg>
  );
}

export function LogoMark({ className }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#ff6b3d" />
      <path d="M9 9l7 8.5V24M23 9l-7 8.5" stroke="#14110e" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
