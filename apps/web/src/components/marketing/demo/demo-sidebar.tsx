"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@foglamp/ui/components/avatar";
import { cn } from "@foglamp/ui/lib/utils";
import {
  type Icon,
  IconChevronDown,
  IconDotsVertical,
  IconHexagonFilled,
} from "@tabler/icons-react";

import { account, nav } from "@/components/app/nav";

import { useDemo } from "./demo-context";
import type { DemoTab } from "./mock-data";

// Same crossfade as the real app's NavIcon: outline → filled, stacked in one
// grid cell so only glyph opacity tweens while the colored chip stays constant.
function NavIcon({
  icon: OutlineIcon,
  activeIcon: ActiveIcon,
  active,
  className,
}: {
  icon: Icon;
  activeIcon: Icon;
  active: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-4.5 place-items-center [&_svg]:size-full!",
        className
      )}
    >
      <OutlineIcon
        className={cn(
          "[grid-area:1/1] transition-opacity duration-100 ease-in-out",
          active ? "opacity-0" : "opacity-100"
        )}
      />
      <ActiveIcon
        className={cn(
          "[grid-area:1/1] transition-opacity duration-100 ease-in-out",
          active ? "opacity-100" : "opacity-0"
        )}
      />
    </span>
  );
}

const BUTTON_BASE =
  "flex w-full items-center gap-2 overflow-hidden rounded-xl corner-squircle p-2 text-left text-sm h-8";

// nav href → demo tab id. The dashboard nav is keyed by route; the demo is keyed
// by an in-memory tab, so map across once here.
const HREF_TO_TAB: Record<string, DemoTab> = {
  "/overview": "overview",
  "/workflows": "workflows",
  "/agents": "agents",
  "/sessions": "sessions",
  "/evals": "evals",
  "/traces": "traces",
  "/alerts": "alerts",
};

export function DemoSidebar() {
  const { tab, setTab } = useDemo();

  return (
    <div className="flex size-full flex-col text-sidebar-foreground">
      {/* Project switcher (display-only) */}
      <div className="flex flex-col gap-2 p-2 px-3">
        <button
          type="button"
          disabled
          className={cn(BUTTON_BASE, "my-2 px-1 pr-2 pl-[5px] cursor-default")}
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-lg corner-squircle bg-primary/10 text-primary shadow-(--custom-shadow)">
            <IconHexagonFilled className="size-3.5" />
          </span>
          <span className="ml-0.5 flex flex-1 flex-col text-left leading-tight">
            <span className="truncate font-medium">Acme</span>
          </span>
          <IconChevronDown className="ml-auto size-4 opacity-30" />
        </button>
      </div>

      {/* Scrollable nav body */}
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-0.5">
        {/* Main nav — interactive */}
        <div className="flex w-full flex-col p-2">
          <ul className="flex w-full flex-col gap-1">
            {nav.map((item) => {
              const itemTab = HREF_TO_TAB[item.href];
              const active = tab === itemTab;
              return (
                <li key={item.href}>
                  <button
                    type="button"
                    onClick={() => itemTab && setTab(itemTab)}
                    data-active={active}
                    className={cn(
                      BUTTON_BASE,
                      "cursor-pointer hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground",
                      "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground dark:data-[active=true]:bg-sidebar-accent/50"
                    )}
                  >
                    <NavIcon
                      icon={item.icon}
                      activeIcon={item.activeIcon}
                      active={active}
                      className={item.iconClassName}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Configs — shown for fidelity but inert (no pointer, no hover/active) */}
        <div className="flex w-full flex-col p-2 px-2">
          <div className="flex h-8 shrink-0 items-center px-2 text-xs font-medium text-sidebar-foreground/70">
            Configs
          </div>
          <ul className="flex w-full flex-col gap-1" aria-hidden>
            {account.map((item) => (
              <li key={item.href}>
                <div
                  className={cn(BUTTON_BASE, "pointer-events-none select-none")}
                >
                  <NavIcon
                    icon={item.icon}
                    activeIcon={item.activeIcon}
                    active={false}
                    className={item.iconClassName}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Footer — display-only account row */}
      <div className="flex flex-col gap-2 p-2 px-2.5">
        <div className={cn(BUTTON_BASE, "pointer-events-none select-none")}>
          <Avatar className="size-5">
            <AvatarImage src="/avatar.jpg" alt="Gustavo" />
            <AvatarFallback>G</AvatarFallback>
          </Avatar>
          <span className="flex flex-1 flex-col text-left ml-0.5">
            <span className="truncate">Gustavo</span>
          </span>
          <IconDotsVertical className="ml-auto size-4 opacity-20" />
        </div>
      </div>
    </div>
  );
}
