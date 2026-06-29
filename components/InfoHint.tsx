import { Icon } from "@/components/Icon";

// Иконка-подсказка с всплывающим пояснением (CSS-hover, серверный рендер, без JS).
export function InfoHint({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`relative inline-flex items-center group align-middle ${className}`}>
      <Icon name="info" className="w-3.5 h-3.5 text-muted cursor-help" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-60 z-20 hidden group-hover:block bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs font-normal leading-snug text-foreground shadow-lg text-left normal-case"
      >
        {text}
      </span>
    </span>
  );
}
