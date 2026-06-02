"use client";

import { Avatar, AvatarFallback } from "@foglamp/ui/components/avatar";
import { cn } from "@foglamp/ui/lib/utils";
import {
  type Icon,
  IconChevronDown,
  IconDotsVertical,
  IconFlask2,
  IconFlask2Filled,
  IconLogout,
  IconPlus,
} from "@tabler/icons-react";
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

import { Spinner } from "@foglamp/ui/components/spinner";

import { NoProject } from "@/components/app/page-parts";
import { QuotaBanner } from "@/components/app/quota-banner";

import { FoggyLauncher, FoggyWidget } from "./foggy/foggy-widget";
import { account, nav } from "./nav";
import { NewProjectDialog } from "./new-project-dialog";
import { ProjectProvider, useProject } from "./project-context";
import { ProjectIcon } from "./project-icon";
import { RangeProvider } from "./range-context";

// Inlined by Next at build time. The Admin tools (synthetic ingest, raw pricing
// table) are dev-only and never shipped in a production build (e.g. Docker).
const isDev = process.env.NODE_ENV !== "production";

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
                className="my-2 px-1 pr-2 pl-[5px]"
              />
            }
          >
            <ProjectIcon url={project?.url} name={project?.name} />
            <div className="flex flex-1 flex-col text-left text-sm leading-tight ml-0.5">
              <span className="truncate font-medium">
                {project?.name ?? "Select project"}
              </span>
            </div>
            <IconChevronDown className="ml-auto size-4 opacity-30" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={8}
            side="right"
            className="min-w-(--anchor-width)"
          >
            <DropdownMenuLabel>Projects</DropdownMenuLabel>
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
  // The session resolves synchronously on the client but is absent during SSR,
  // so gate the user-specific name on mount: SSR and the first client render
  // both show "Account" (matching), then it swaps to the real name. Avoids a
  // hydration mismatch on the avatar initials.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const email = session?.user.email ?? "";
  const name = (mounted && (session?.user.name || email)) || "Account";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton />}>
            <Avatar size="sm">
              <AvatarFallback>{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col text-left text-sm ">
              <span className="truncate font-medium">{name}</span>
            </div>
            <IconDotsVertical className="ml-auto size-4 opacity-20" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="right"
            sideOffset={8}
            className="min-w-(--anchor-width)"
          >
            <DropdownMenuLabel>{email}</DropdownMenuLabel>
            <ThemeSubmenu />
            <DropdownMenuSeparator />
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
    </SidebarMenu>
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
        <ShellBody>{children}</ShellBody>
      </RangeProvider>
    </ProjectProvider>
  );
}

function ShellBody({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { projectId } = useProject();
  // Foggy chat open state. Lifted here so the launcher (carved into the inset)
  // and the panel (a flex sibling of the inset) can share it.
  const [foggyOpen, setFoggyOpen] = useState(false);

  return (
    <SidebarProvider className="relative h-svh min-h-0 overflow-hidden">
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
                        render={<Link href={item.href} />}
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

          <SidebarGroup>
            <SidebarGroupLabel>Configs</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {account.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        render={<Link href={item.href} />}
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

          {isDev && (
            <SidebarGroup>
              <SidebarGroupLabel>Dev mode</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={isActive(pathname, "/admin")}
                      render={<Link href="/admin" />}
                    >
                      <NavIcon
                        icon={IconFlask2}
                        activeIcon={IconFlask2Filled}
                        active={isActive(pathname, "/admin")}
                        className="dark:text-neutral-500 text-neutral-400"
                      />
                      <span>Admin</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          <NavUser />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset
        className="min-h-0 overflow-hidden"
        // Square the top-right corner so the carved launcher's shelf sits flush
        // there; restore the round corner once the chat pushes it in. Inline so
        // it reliably beats the component's `rounded-3xl`.
        style={!foggyOpen ? { borderTopRightRadius: 0 } : undefined}
      >
        {/* The scroll viewport is a plain block with a definite height
              (flex-1 + min-h-0); the flex-column layout lives in a child so the
              scroll container itself never tries to flex-fit its content. */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6 p-12 2xl:p-16 max-w-380 mx-auto">
            <QuotaBanner />
            <ProjectGate>{children}</ProjectGate>
          </div>
        </main>
      </SidebarInset>

      {/* In-app AI assistant launcher, carved into the inset's top-right
          corner. It lives in the canvas layer (above the inset) so it can mask
          the inset's border for a seamless cut. Hidden while the chat is open
          (the panel pushes the corner away and carries its own controls). */}
      {projectId && !foggyOpen && (
        <FoggyLauncher onOpen={() => setFoggyOpen(true)} />
      )}

      {/* The chat panel sits flat on the canvas to the right of the inset.
              As it grows the flex-1 inset shrinks to make room. Keyed by
              projectId so switching projects resets the conversation. */}
      {projectId && (
        <FoggyWidget
          key={projectId}
          projectId={projectId}
          open={foggyOpen}
          onOpenChange={setFoggyOpen}
        />
      )}
    </SidebarProvider>
  );
}
