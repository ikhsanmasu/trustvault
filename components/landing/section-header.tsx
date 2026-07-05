import { cn } from "@/lib/utils";

/**
 * Consistent section header for landing sections: eyebrow with gold rules,
 * an editorial display-serif title, and an optional description.
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  dark = false,
  className,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("text-center max-w-2xl mx-auto", className)}>
      <span className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-secondary">
        <span className="h-px w-6 bg-secondary/50" aria-hidden="true" />
        {eyebrow}
        <span className="h-px w-6 bg-secondary/50" aria-hidden="true" />
      </span>
      <h2
        className={cn(
          "font-display mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold leading-[1.12] text-balance",
          dark ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            "mt-5 text-lg leading-relaxed",
            dark ? "text-primary-foreground/65" : "text-muted-foreground",
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
