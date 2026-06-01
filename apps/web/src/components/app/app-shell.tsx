"use client";

import { Avatar, AvatarFallback } from "@foglamp/ui/components/avatar";
import {
  type Icon,
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconBriefcase,
  IconBriefcaseFilled,
  IconCherryFilled,
  IconChefHatFilled,
  IconChevronDown,
  IconCloudFilled,
  IconCoin,
  IconCoinFilled,
  IconDotsVertical,
  IconDropletFilled,
  IconFlameFilled,
  IconFlask2,
  IconFlask2Filled,
  IconFlowerFilled,
  IconGauge,
  IconGaugeFilled,
  IconGhost,
  IconGhostFilled,
  IconKey,
  IconKeyFilled,
  IconLayoutDistributeHorizontal,
  IconLayoutDistributeHorizontalFilled,
  IconLogout,
  IconMessage2,
  IconMessage2Filled,
  IconMeteorFilled,
  IconMichelinStar,
  IconMichelinStarFilled,
  IconPlus,
  IconShieldLock,
  IconShieldLockFilled,
  IconSitemap,
  IconSitemapFilled,
  IconTriangleFilled,
} from "@tabler/icons-react";
import { useState } from "react";

import { getGoogleFavicon } from "@/lib/favicon";
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
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { ThemeSubmenu } from "@/components/theme-switcher";
import { authClient } from "@/lib/auth-client";

import { Spinner } from "@foglamp/ui/components/spinner";

import { NoProject } from "@/components/app/page-parts";
import { QuotaBanner } from "@/components/app/quota-banner";

import { Foggy } from "./foggy/foggy";
import { NewProjectDialog } from "./new-project-dialog";
import { ProjectProvider, useProject } from "./project-context";
import { RangeProvider } from "./range-context";

type NavItem = {
  href: Route;
  label: string;
  /** Outline icon, shown when the tab is inactive. */
  icon: Icon;
  /** Filled icon, shown when the tab is active. */
  activeIcon: Icon;
  /** Optional Tailwind class(es) for the icon, e.g. "text-blue-500". */
  iconClassName?: string;
};

const nav: NavItem[] = [
  {
    href: "/overview",
    label: "Overview",
    icon: IconMichelinStar,
    activeIcon: IconMichelinStarFilled,
    iconClassName: "dark:text-rose-600 text-rose-400",
  },
  {
    href: "/workflows",
    label: "Workflows",
    icon: IconSitemap,
    activeIcon: IconSitemapFilled,
    iconClassName: "dark:text-emerald-600 text-emerald-400",
  },
  {
    href: "/agents",
    label: "Agents",
    icon: IconGhost,
    activeIcon: IconGhostFilled,
    iconClassName: "dark:text-[#FF5512] text-orange-400",
  },
  {
    href: "/sessions",
    label: "Sessions",
    icon: IconMessage2,
    activeIcon: IconMessage2Filled,
    iconClassName: "dark:text-blue-600 text-blue-400",
  },
  {
    href: "/evals",
    label: "Evals",
    icon: IconGauge,
    activeIcon: IconGaugeFilled,
    iconClassName: "dark:text-fuchsia-600 text-fuchsia-400",
  },
  {
    href: "/traces",
    label: "Traces",
    icon: IconLayoutDistributeHorizontal,
    activeIcon: IconLayoutDistributeHorizontalFilled,
    iconClassName: "dark:text-[#0090FD] text-sky-400",
  },

  {
    href: "/alerts",
    label: "Alerts",
    icon: IconAlertTriangle,
    activeIcon: IconAlertTriangleFilled,
    iconClassName: "dark:text-yellow-500 text-yellow-400",
  },
];

const account: NavItem[] = [
  {
    href: "/settings/org",
    label: "Organization",
    icon: IconBriefcase,
    activeIcon: IconBriefcaseFilled,
    iconClassName: "dark:text-neutral-600 text-neutral-400",
  },
  {
    href: "/settings",
    label: "API Keys",
    icon: IconKey,
    activeIcon: IconKeyFilled,
    iconClassName: "dark:text-neutral-600 text-neutral-400",
  },
  {
    href: "/settings/pricing",
    label: "Pricing",
    icon: IconCoin,
    activeIcon: IconCoinFilled,
    iconClassName: "dark:text-neutral-600 text-neutral-400",
  },
  {
    href: "/settings/provider-keys",
    label: "Provider Keys",
    icon: IconShieldLock,
    activeIcon: IconShieldLockFilled,
    iconClassName: "dark:text-neutral-600 text-neutral-400",
  },
];

// Inlined by Next at build time. The Admin tools (synthetic ingest, raw pricing
// table) are dev-only and never shipped in a production build (e.g. Docker).
const isDev = process.env.NODE_ENV !== "production";

function initials(value: string) {
  return value.slice(0, 2).toUpperCase();
}

// Placeholder icons used when a project has no favicon. One is picked
// deterministically from the project name, so the same project always shows
// the same icon while different projects get some visual variety.
const placeholderIcons: Icon[] = [
  IconCloudFilled,
  IconFlask2Filled,
  IconFlowerFilled,
  IconCherryFilled,
  IconMeteorFilled,
  IconFlameFilled,
  IconDropletFilled,
  IconChefHatFilled,
  IconTriangleFilled,
];

function placeholderIcon(name: string | null | undefined): Icon {
  const letter = name?.trim().charAt(0).toLowerCase() ?? "";
  const code = letter.charCodeAt(0);
  const index = Number.isNaN(code) ? 0 : code % placeholderIcons.length;
  return placeholderIcons[index];
}

// A project's favicon (from its URL) or a per-project placeholder icon, in a
// rounded box.
function ProjectIcon({
  url,
  name,
  size = "md",
}: {
  url: string | null | undefined;
  name?: string | null | undefined;
  size?: "sm" | "md";
}) {
  const box =
    size === "md"
      ? "size-6 rounded-lg corner-squircle shadow-(--custom-shadow)"
      : "size-5 rounded-lg corner-squircle";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external favicon service, no optimization wanted
      <img
        src={getGoogleFavicon(url)}
        alt=""
        className={`${box} bg-background object-cover`}
      />
    );
  }
  const PlaceholderIcon = placeholderIcon(name);
  return (
    <div
      className={`flex aspect-square items-center justify-center bg-primary/10 text-primary ${box}`}
    >
      <PlaceholderIcon className={size === "md" ? "size-4" : "size-3"} />
    </div>
  );
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
              <SidebarMenuButton size="default" className="my-2 px-1 pr-2" />
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
  const email = session?.user.email ?? "";
  const name = session?.user.name || email || "Account";

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
            <IconDotsVertical className="ml-auto size-4 opacity-30" />
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

// Gate page content on the project list so we don't flash "No project selected"
// while the list is still loading (or in the render between load and auto-select).
function ProjectGate({ children }: { children: React.ReactNode }) {
  const { projectId, projects, isLoading } = useProject();
  if (projectId) return <>{children}</>;
  if (isLoading || projects.length > 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }
  return <NoProject />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <ProjectProvider>
      <RangeProvider>
        <SidebarProvider className="h-svh min-h-0 overflow-hidden">
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
                      const Icon = active ? item.activeIcon : item.icon;
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            isActive={active}
                            render={<Link href={item.href} />}
                          >
                            <Icon className={item.iconClassName} />
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
                      const Icon = active ? item.activeIcon : item.icon;
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            isActive={active}
                            render={<Link href={item.href} />}
                          >
                            <Icon className={item.iconClassName} />
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
                          {isActive(pathname, "/admin") ? (
                            <IconFlask2Filled className="dark:text-neutral-600 text-neutral-400" />
                          ) : (
                            <IconFlask2 className="dark:text-neutral-600 text-neutral-400" />
                          )}
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

          <SidebarInset className="min-h-0 overflow-hidden">
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
        </SidebarProvider>
        {/* In-app AI assistant. Renders its own floating launcher; hides itself
            when no project is selected. */}
        <Foggy />
      </RangeProvider>
    </ProjectProvider>
  );
}
