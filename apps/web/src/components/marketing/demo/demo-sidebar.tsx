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
  IconHexagonFilled,
} from "@tabler/icons-react";

import { account, nav } from "@/components/app/nav";

import { useDemo } from "./demo-context";
import type { DemoTab } from "./mock-data";
import { Piece, useEntering } from "./piece";

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
  "flex w-full items-center gap-2 overflow-hidden rounded-md squircle:rounded-xl corner-squircle p-2 text-left text-sm h-8";

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
  const { tab, setTab, interactive } = useDemo();

  // While the entrance runs, every box between this sidebar and its pieces
  // keeps 3D and does not clip, so each piece's lift reads (see piece.tsx).
  const entering = useEntering();
  const deep = entering && "transform-3d";

  return (
    <div className={cn("flex size-full flex-col text-sidebar-foreground", deep)}>
      {/* Project switcher (display-only) */}
      <Piece className="flex flex-col gap-2 p-2 px-3.5 pb-1">
        <button
          type="button"
          disabled
          className={cn(
            BUTTON_BASE,
            "my-2 mb-1 px-1 pr-2 pl-1.25 cursor-default"
          )}
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-lg corner-squircle bg-primary/10 text-primary shadow-(--custom-shadow)">
            <IconHexagonFilled className="size-3.5" />
          </span>
          <span className="ml-0.5 flex flex-1 flex-col text-left leading-tight">
            <span className="truncate font-medium">Acme</span>
          </span>
          <IconChevronDown className="ml-auto size-3.5 opacity-25" />
        </button>
      </Piece>

      {/* Scrollable nav body */}
      <div
        className={cn(
          "no-scrollbar flex min-h-0 flex-1 flex-col gap-2 px-1",
          entering ? "transform-3d" : "overflow-auto"
        )}
      >
        {/* Main nav — interactive */}
        <div className={cn("flex w-full flex-col p-2", deep)}>
          <ul className={cn("flex w-full flex-col gap-0.75", deep)}>
            {nav.map((item) => {
              const itemTab = HREF_TO_TAB[item.href];
              const active = tab === itemTab;
              return (
                <Piece as="li" key={item.href}>
                  <button
                    type="button"
                    // Off until the hero's entrance has finished. The link
                    // keeps its look; only the click and the hover are held.
                    disabled={!interactive}
                    onClick={() => itemTab && setTab(itemTab)}
                    data-active={active}
                    className={cn(
                      BUTTON_BASE,
                      "cursor-pointer enabled:hover:bg-sidebar-accent/40 enabled:hover:text-sidebar-accent-foreground disabled:cursor-default",
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
                </Piece>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Footer — display-only account row */}
      <div className={cn("flex flex-col gap-1 p-2 px-3 pb-3", deep)}>
        <ul className={cn("flex w-full flex-col gap-0.75", deep)} aria-hidden>
          {account.map((item) => (
            <Piece as="li" key={item.href}>
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
            </Piece>
          ))}
        </ul>

        <Piece className={cn(BUTTON_BASE, "pointer-events-none select-none")}>
          <Avatar className="size-4">
            <AvatarImage src="/avatar.jpg" alt="Gustavo" />
            <AvatarFallback>G</AvatarFallback>
          </Avatar>
          <span className="flex flex-1 flex-col text-left ml-0.5">
            <span className="truncate">Gustavo</span>
          </span>
        </Piece>
      </div>
    </div>
  );
}
