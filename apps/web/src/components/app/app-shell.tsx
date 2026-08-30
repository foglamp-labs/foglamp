"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@foglamp/ui/components/avatar";
import { cn } from "@foglamp/ui/lib/utils";
import {
  type Icon,
  IconChartBar,
  IconChevronDown,
  IconChevronRight,
  IconDotsVertical,
  IconGhost2Filled,
  IconLogout,
  IconPlus,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@foglamp/ui/components/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@foglamp/ui/components/sidebar";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { ThemeSubmenu } from "@/components/theme-switcher";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

import { Spinner } from "@foglamp/ui/components/spinner";

import { NoProject } from "@/components/app/page-parts";
import { QuotaCard } from "@/components/app/quota-card";

import { FoglampHUD } from "foglamp/hud";

import { DevBar } from "./dev-toolbar";
import { FoggyLauncher, FoggyWidget } from "./foggy/foggy-widget";
import {
  HeaderActionsSlotProvider,
  LayoutReserveProvider,
} from "./header-slot";
import { account, nav } from "./nav";
import { NewProjectDialog } from "./new-project-dialog";
import { type PrefetchCtx, prefetchRoute } from "./prefetch";
import { ProjectProvider, useProject } from "./project-context";
import { ProjectIcon } from "./project-icon";
import { RangeProvider, useRange } from "./range-context";

function initials(value: string) {
  return value.slice(0, 2).toUpperCase();
}

function ProjectSwitcher() {
  const { project, projects, setProjectId } = useProject();
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="default"
                className="px-1 pr-2 pl-1.75 [&_svg]:size-3.5"
              />
            }
          >
            <ProjectIcon url={project?.url} name={project?.name} size="sm" />
            <div className="flex flex-1 flex-col text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {project?.name ?? "Select project"}
              </span>
            </div>
            <IconChevronDown className="ml-auto size-3.5 opacity-15" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={8}
            side="right"
            className="min-w-(--anchor-width)"
          >
            {projects.map((p) => (
              <DropdownMenuItem key={p.id} onClick={() => setProjectId(p.id)}>
                <ProjectIcon url={p.url} name={p.name} size="sm" />
                <div className="flex flex-1 flex-col">
                  <span>{p.name}</span>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setNewProjectOpen(true)}>
              <IconPlus />
              New project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <NewProjectDialog
          open={newProjectOpen}
          onOpenChange={setNewProjectOpen}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NavUser() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  // Hosted-operator gate (PLATFORM_ADMIN_EMAILS) — false for everyone else,
  // so the Platform item simply never renders for regular users.
  const isPlatformAdmin = useQuery({
    ...trpc.platform.isAdmin.queryOptions(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  // The session resolves synchronously on the client but is absent during SSR,
  // so gate the user-specific name on mount: SSR and the first client render
  // both show "Account" (matching), then it swaps to the real name. Avoids a
  // hydration mismatch on the avatar initials.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const email = session?.user.email ?? "";
  const name = (mounted && (session?.user.name || email)) || "Account";
  const image = (mounted && session?.user.image) || undefined;

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger render={<SidebarMenuButton className="pr-1.5" />}>
          <Avatar size="xs">
            <AvatarImage src={image} alt={name} />
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          {/* min-w-0 lets the flex child shrink so the name can truncate. */}
          <div className="flex min-w-0 flex-1 flex-col text-left text-sm">
            <span className="truncate">{name}</span>
          </div>
          <IconChevronRight className="ml-auto size-3.5 opacity-15" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="right"
          sideOffset={8}
          className="min-w-(--anchor-width) w-fit"
        >
          <div className="flex gap-3 items-center p-2">
            <Avatar size="sm">
              <AvatarImage src={image} alt={name} />
              <AvatarFallback>{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-0.5 pr-1">
              <DropdownMenuLabel className="max-w-56 truncate p-0 text-foreground">
                {name}
              </DropdownMenuLabel>
              <DropdownMenuLabel className="max-w-56 truncate p-0 font-normal">
                {email}
              </DropdownMenuLabel>
            </div>
          </div>
          <DropdownMenuSeparator />
          <ThemeSubmenu />
          {isPlatformAdmin.data && (
            <DropdownMenuItem render={<Link href="/platform" />}>
              <IconChartBar />
              Platform
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              authClient.signOut({
                fetchOptions: { onSuccess: () => router.push("/login") },
              })
            }
          >
            <IconLogout />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/settings") return pathname === "/settings";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Cross-fades the outline icon into its filled variant when the tab goes active.
// Both icons are stacked in the same grid cell so only the glyph opacity tweens;
// the colored chip (`className`, e.g. background + padding + shadow) lives on the
// wrapper so it stays constant across the swap instead of fading in and out.
//
// The wrapper is pinned to the icon footprint (`size-4.5`) and the inner SVGs
// fill its padded content box (`size-full`, overriding the sidebar's forced
// `[&_svg]:size-4.5`). This keeps a chip item's outer size at 18px with the glyph
// inset by its padding — matching the original single-icon geometry — rather than
// letting the padding grow the chip around two full-size icons.
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
        className,
      )}
    >
      <OutlineIcon
        className={cn(
          "[grid-area:1/1] transition-opacity duration-100 ease-in-out",
          active ? "opacity-0" : "opacity-100",
        )}
      />
      <ActiveIcon
        className={cn(
          "[grid-area:1/1] transition-opacity duration-100 ease-in-out",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </span>
  );
}

// Gate page content on the project list so we don't flash "No project selected"
// while the list is still loading (or in the render between load and auto-select).
function ProjectGate({ children }: { children: React.ReactNode }) {
  const { projectId, projects, isLoading } = useProject();
  if (projectId) return <>{children}</>;
  if (isLoading || projects.length > 0) {
    return null;
  }
  return <NoProject />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ProjectProvider>
      <RangeProvider>
        <HeaderActionsSlotProvider>
          <LayoutReserveProvider>
            <ShellBody>{children}</ShellBody>
          </LayoutReserveProvider>
        </HeaderActionsSlotProvider>
      </RangeProvider>
    </ProjectProvider>
  );
}

function ShellBody({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { range } = useRange();
  const { projectId, projects, isLoading } = useProject();
  // Foggy chat open state. Lifted here so the launcher (carved into the inset)
  // and the panel (a flex sibling of the inset) can share it.
  const [foggyOpen, setFoggyOpen] = useState(false);
  // Keep the carve mounted while projects load and through the render between
  // list arrival and automatic selection. Only the interactive button waits
  // for a real project, preventing the inset corner from flashing in and out.
  const foggyAvailable = isLoading || projects.length > 0;
  const foggyCarved = foggyAvailable && !foggyOpen;

  // Hover/focus intent on a sidebar link warms that page's tRPC queries (see
  // prefetch.ts) with the same project + range args the page itself will use.
  const prefetchCtx: PrefetchCtx | null = projectId
    ? {
        projectId,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      }
    : null;

  return (
    <SidebarProvider className="group/shell relative h-svh min-h-0 overflow-hidden">
      <Sidebar variant="inset">
        <SidebarHeader>
          <ProjectSwitcher />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        render={<Link href={item.href} prefetch />}
                      >
                        <NavIcon
                          icon={item.icon}
                          activeIcon={item.activeIcon}
                          active={active}
                          className={item.iconClassName}
                        />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <QuotaCard />
          <SidebarMenu>
            {account.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={active}
                    render={<Link href={item.href} prefetch />}
                  >
                    <NavIcon
                      icon={item.icon}
                      activeIcon={item.activeIcon}
                      active={active}
                      className={item.iconClassName}
                    />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
            <NavUser />
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* This wrapper owns the inset's canvas margin so the dev bar can sit
          above it without disturbing the sidebar/Foggy horizontal flex layout.
          With no dev bar in production, the single inset fills it exactly as it
          did before. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2">
        <DevBar />

        <SidebarInset
          className={cn(
            "min-h-0 overflow-hidden transition-shadow duration-200 md:rounded-lg squircle:md:rounded-3xl",
            foggyCarved && "foggy-inset-closed",
          )}
          // Square the bottom-right corner so the carved launcher's shelf sits flush
          // there; restore the round corner once the chat pushes it in. Inline so
          // it reliably beats the component's `rounded-3xl`.
          style={foggyCarved ? { borderBottomRightRadius: 0 } : undefined}
        >
          {/* The scroll viewport is a plain block with a definite height
              (flex-1 + min-h-0); the flex-column layout lives in a child so the
              scroll container itself never tries to flex-fit its content. */}
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4 py-6 px-0 pb-16">
              <ProjectGate>{children}</ProjectGate>
            </div>
          </main>
          {/* Lights up this surface's right edge while the Foggy panel's resize
            handle is hovered or dragged (tracked via :has() on the shell), so
            the resize affordance reads as the inset's own border. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 rounded-lg squircle:rounded-3xl corner-squircle border-r border-border/80 opacity-0 transition-opacity duration-200 group-has-[[data-foggy-resize]:hover]/shell:opacity-100 group-has-[[data-foggy-resize][data-resizing]]/shell:opacity-100"
          />
        </SidebarInset>
      </div>

      {/* In-app AI assistant launcher, carved into the inset's bottom-right
          corner. It lives in the canvas layer (above the inset) so it can mask
          the inset's border for a seamless cut. Hidden while the chat is open
          (the panel pushes the corner away and carries its own controls). */}
      {foggyCarved && (
        <FoggyLauncher
          onOpen={() => setFoggyOpen(true)}
          showButton={Boolean(projectId)}
        />
      )}

      {/* The chat panel sits flat on the canvas to the right of the inset.
              As it grows the flex-1 inset shrinks to make room. Keyed by
              projectId so switching projects resets the conversation. */}
      {projectId && (
        <FoggyWidget
          key={projectId}
          projectId={projectId}
          pathname={pathname}
          range={range}
          open={foggyOpen}
          onOpenChange={setFoggyOpen}
        />
      )}

      {/* Dogfood: the live HUD overlay, dev only. `foglamp({ hud: true })` in
          apps/server streams Foggy's own execution to the local broker; this
          renders it. Tree-shaken out of production builds (static NODE_ENV). */}
      {process.env.NODE_ENV === "development" && <FoglampHUD />}
    </SidebarProvider>
  );
}
