import { useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronDown, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  badgeColor?: string;
}

interface AdminSidebarNavGroupProps {
  title: string;
  icon: LucideIcon;
  items: AdminNavItem[];
  defaultOpen?: boolean;
}

export function AdminSidebarNavGroup({
  title,
  icon: GroupIcon,
  items,
  defaultOpen = false,
}: AdminSidebarNavGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const groupBadgeTotal = items.reduce((sum, item) => sum + (item.badge ?? 0), 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg transition-all text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50">
        <GroupIcon className="h-5 w-5" />
        <span className="flex-1 text-left">{title}</span>
        {!isOpen && groupBadgeTotal > 0 && (
          <Badge className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs">
            {groupBadgeTotal}
          </Badge>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4 space-y-0.5 mt-0.5">
        {items.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm",
                isActive
                  ? "bg-destructive/10 text-destructive border border-destructive/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <Badge
                className={cn(
                  "ml-auto text-xs",
                  item.badgeColor || "bg-destructive hover:bg-destructive/90"
                )}
              >
                {item.badge}
              </Badge>
            )}
          </NavLink>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
