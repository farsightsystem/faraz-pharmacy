import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  className?: string;
  valueClassName?: string;
}

export default function KPICard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
  valueClassName,
}: KPICardProps) {
  return (
    <Card className={cn("hover:shadow-md transition-all duration-200 border-border/50", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          {title}
        </CardTitle>
        {icon && <div className="text-text-secondary/60">{icon}</div>}
      </CardHeader>
      <CardContent>
        <p className={cn("text-2xl font-bold font-mono tracking-tight", valueClassName)}>{value}</p>
        {subtitle && (
          <p className="text-[11px] mt-1 text-text-secondary truncate">{subtitle}</p>
        )}
        {trend && (
          <p
            className={cn(
              "text-xs mt-1.5 font-medium",
              trend.isPositive ? "text-success" : "text-danger"
            )}
          >
            {trend.isPositive ? "+" : ""}
            {trend.value}% from last period
          </p>
        )}
      </CardContent>
    </Card>
  );
}
