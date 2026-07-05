import { cn } from "@/lib/utils";
import { IconTrendUp, IconTrendDown, IconTrendNeutral } from "@/components/icons";

export interface TrendIndicator {
  direction: "up" | "down" | "neutral";
  value: string;
  label?: string;
}

interface StatsCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  description?: string;
  trend?: TrendIndicator;
  className?: string;
}

const trendStyles: Record<string, { text: string; bg: string }> = {
  up: {
    text: "text-success",
    bg: "bg-success/10",
  },
  down: {
    text: "text-destructive",
    bg: "bg-destructive/10",
  },
  neutral: {
    text: "text-muted-foreground",
    bg: "bg-muted",
  },
};

function TrendArrow({ direction }: { direction: TrendIndicator["direction"] }) {
  if (direction === "up") {
    return <IconTrendUp className="h-3 w-3" />;
  }
  if (direction === "down") {
    return <IconTrendDown className="h-3 w-3" />;
  }
  return <IconTrendNeutral className="h-3 w-3" />;
}

export function StatsCard({
  label,
  value,
  icon,
  description,
  trend,
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card text-card-foreground",
        "shadow-elevation-1 transition-all duration-300 ease-out",
        "hover:shadow-elevation-2 hover:border-secondary/30",
        className,
      )}
    >
      {/* Gold accent line on hover */}
      <div className="absolute top-0 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-secondary/0 to-transparent transition-all duration-300 group-hover:via-secondary/60" />

      <div className="relative p-5">
        {/* Top row: icon + trend */}
        <div className="mb-4 flex items-start justify-between">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              "bg-primary/[0.07] text-primary ring-1 ring-inset ring-primary/10",
              "transition-colors duration-300",
              "group-hover:bg-secondary/10 group-hover:text-secondary group-hover:ring-secondary/20",
              "dark:bg-primary/15 dark:ring-primary/20",
            )}
          >
            {icon}
          </div>

          {trend && (
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                trendStyles[trend.direction].text,
                trendStyles[trend.direction].bg,
              )}
            >
              <TrendArrow direction={trend.direction} />
              <span>{trend.value}</span>
            </div>
          )}
        </div>

        {/* Value */}
        <p className="text-2xl font-bold tracking-tight tabular-nums text-foreground sm:text-3xl">
          {value}
        </p>

        {/* Label */}
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          {label}
        </p>

        {/* Optional description */}
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
