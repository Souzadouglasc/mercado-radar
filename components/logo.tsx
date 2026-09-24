import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className,
      )}
    >
      <svg width="20" height="20" viewBox="0 0 64 64" fill="none" aria-hidden>
        <g stroke="currentColor" strokeWidth="5" strokeLinecap="round">
          <circle cx="29" cy="35" r="5" fill="currentColor" stroke="none" />
          <circle cx="29" cy="35" r="13" />
          <circle cx="29" cy="35" r="20" opacity="0.45" />
        </g>
        <line x1="29" y1="35" x2="43" y2="21" stroke="#f5b301" strokeWidth="5" strokeLinecap="round" />
        <circle cx="43" cy="21" r="5" fill="#f5b301" />
      </svg>
    </span>
  );
}
