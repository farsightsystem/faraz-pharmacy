import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: { value: number; positive: boolean };
  subtitle?: string;
  loading?: boolean;
  delay?: number;
  href?: string;
  onClick?: () => void;
}

function useCountUp(end: number, duration = 500) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    let frame: number;

    function animate(timestamp: number) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * end));
      if (progress < 1) frame = requestAnimationFrame(animate);
    }

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [end, duration]);

  return count;
}

export default function StatCard({
  title,
  value,
  icon,
  trend,
  subtitle,
  loading,
  delay = 0,
  href,
  onClick,
}: StatCardProps) {
  const isNumberValue = typeof value === "number";
  const numValue = isNumberValue ? value : 0;
  const isCurrency =
    title.toLowerCase().includes("revenue") || title.toLowerCase().includes("arrear");
  const animatedValue = useCountUp(numValue, 500);
  const isClickable = !!(href || onClick);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/80 bg-surface p-5 space-y-3">
        <div className="h-3 w-20 bg-surface-2 rounded-full animate-pulse" />
        <div className="h-7 w-28 bg-surface-2 rounded-full animate-pulse" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: "easeOut" }}
      whileHover={isClickable ? { y: -3, scale: 1.01 } : { y: -2 }}
      whileTap={isClickable ? { scale: 0.98 } : undefined}
      onClick={onClick}
      className={`group rounded-2xl border border-border/80 bg-surface p-5 relative overflow-hidden transition-all duration-200 shadow-xs ${
        isClickable ? "cursor-pointer hover:shadow-md hover:border-[#4A25E1]/40" : "hover:shadow-md"
      }`}
    >
      <span className="absolute left-0 top-0 bottom-0 w-1 bg-[#4A25E1]/30 group-hover:bg-[#4A25E1] dark:group-hover:bg-[#754BFB] transition-colors duration-200" />
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-text-secondary tracking-wider uppercase">
            {title}
          </p>
          <div className="flex items-baseline gap-1.5">
            <p className="text-2xl font-bold font-display text-text-primary tabular-nums tracking-tight">
              {isNumberValue
                ? isCurrency
                  ? formatCurrency(animatedValue)
                  : animatedValue.toLocaleString()
                : value}
            </p>
            {isNumberValue && value !== animatedValue && (
              <span className="text-[10px] text-text-secondary animate-pulse">...</span>
            )}
          </div>
          {subtitle && <p className="text-[11px] text-text-secondary">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-2xl bg-[#4A25E1]/10 dark:bg-white/10 flex items-center justify-center text-[#4A25E1] dark:text-[#754BFB] group-hover:scale-105 transition-all duration-200 shadow-xs">
            {icon}
          </div>
          {isClickable && (
            <ArrowRight className="h-4 w-4 text-text-secondary/40 group-hover:text-[#4A25E1] dark:group-hover:text-[#754BFB] group-hover:translate-x-1 transition-all duration-200" />
          )}
        </div>
      </div>
      {trend && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + 0.2 }}
          className="mt-3 flex items-center gap-1 text-[10px]"
        >
          {trend.positive ? (
            <TrendingUp className="h-3 w-3 text-success" />
          ) : (
            <TrendingDown className="h-3 w-3 text-danger" />
          )}
          <span
            className={trend.positive ? "font-semibold text-success" : "font-semibold text-danger"}
          >
            {trend.value}%
          </span>
          <span className="text-text-secondary">vs last week</span>
        </motion.div>
      )}
    </motion.div>
  );
}
