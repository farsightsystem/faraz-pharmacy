import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft } from "lucide-react";
import { ShortcutHint } from "@/components/shared/Kbd";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: { label: ReactNode; onClick: () => void; shortcut?: string };
  /** Rendered as an outline button directly to the left of the primary action. */
  secondaryAction?: { label: ReactNode; onClick: () => void; icon?: ReactNode };
  back?: { label: string; onClick: () => void };
}

export default function PageHeader({
  title,
  description,
  action,
  secondaryAction,
  back,
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          {back && (
            <Button variant="ghost" size="icon" onClick={back.onClick} className="rounded-xl">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h1 className="text-lg font-display font-bold text-text-primary tracking-tight">{title}</h1>
        </div>
        {description && <p className="text-xs text-text-secondary">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        {secondaryAction && (
          <Button
            variant="outline"
            size="default"
            onClick={secondaryAction.onClick}
            className="gap-1.5 rounded-xl shadow-xs border-brand/30 text-brand hover:bg-brand/10"
          >
            {secondaryAction.icon}
            <span>{secondaryAction.label}</span>
          </Button>
        )}
        {action && (
          <Button onClick={action.onClick} className="gap-2 rounded-xl" size="default" variant="brand">
            <Plus className="h-4 w-4" />
            <span>{action.label}</span>
            {action.shortcut && <ShortcutHint shortcut={action.shortcut} />}
          </Button>
        )}
      </div>
    </div>
  );
}
