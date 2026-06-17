import {
  type Icon,
  IconAffiliate,
  IconAffiliateFilled,
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconGauge,
  IconGaugeFilled,
  IconGhost,
  IconGhostFilled,
  IconKey,
  IconKeyFilled,
  IconLock,
  IconLockFilled,
  IconMessage2,
  IconMessage2Filled,
  IconMichelinStar,
  IconMichelinStarFilled,
  IconSettings,
  IconSettingsFilled,
  IconSitemap,
  IconSitemapFilled,
} from "@tabler/icons-react";
import type { Route } from "next";

export type NavItem = {
  href: Route;
  label: string;
  /** Outline icon, shown when the tab is inactive. */
  icon: Icon;
  /** Filled icon, shown when the tab is active. */
  activeIcon: Icon;
  /** Optional Tailwind class(es) for the icon, e.g. "text-blue-500". */
  iconClassName?: string;
};

export const nav: NavItem[] = [
  {
    href: "/overview",
    label: "Overview",
    icon: IconMichelinStar,
    activeIcon: IconMichelinStarFilled,
    iconClassName:
      "bg-rose-100 dark:bg-rose-950 rounded-xl p-0.5 corner-squircle text-rose-500 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.14),0_2px_6px_-2px_rgba(244,63,94,0.25)] dark:shadow-(--custom-shadow)",
  },
  {
    href: "/workflows",
    label: "Workflows",
    icon: IconSitemap,
    activeIcon: IconSitemapFilled,
    iconClassName:
      "bg-emerald-100 dark:bg-emerald-950 rounded-xl p-0.5 corner-squircle text-emerald-500 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.14),0_2px_6px_-2px_rgba(16,185,129,0.25)] dark:shadow-(--custom-shadow)",
  },
  {
    href: "/agents",
    label: "Agents",
    icon: IconGhost,
    activeIcon: IconGhostFilled,
    iconClassName:
      "bg-orange-100 dark:bg-orange-950 rounded-xl p-0.5 corner-squircle text-orange-500 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.14),0_2px_6px_-2px_rgba(249,115,22,0.25)] dark:shadow-(--custom-shadow)",
  },
  {
    href: "/sessions",
    label: "Sessions",
    icon: IconMessage2,
    activeIcon: IconMessage2Filled,
    iconClassName:
      "bg-sky-100 dark:bg-sky-950 rounded-xl p-0.5 corner-squircle text-sky-500 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.14),0_2px_6px_-2px_rgba(14,165,233,0.25)] dark:shadow-(--custom-shadow)",
  },
  {
    href: "/traces",
    label: "Traces",
    icon: IconAffiliate,
    activeIcon: IconAffiliateFilled,
    iconClassName:
      "bg-[#ede0d4] dark:bg-[#2e211b] rounded-xl p-0.5 corner-squircle text-[#8b5e34] dark:text-[#c9a888] shadow-[inset_0_0_0_1px_rgba(139,94,52,0.14),0_2px_6px_-2px_rgba(139,94,52,0.25)] dark:shadow-(--custom-shadow)",
  },
  {
    href: "/evals",
    label: "Evals",
    icon: IconGauge,
    activeIcon: IconGaugeFilled,
    iconClassName:
      "bg-fuchsia-100 dark:bg-fuchsia-950 rounded-xl p-0.5 corner-squircle text-fuchsia-500 shadow-[inset_0_0_0_1px_rgba(217,70,239,0.14),0_2px_6px_-2px_rgba(217,70,239,0.25)] dark:shadow-(--custom-shadow)",
  },

  {
    href: "/alerts",
    label: "Alerts",
    icon: IconAlertTriangle,
    activeIcon: IconAlertTriangleFilled,
    iconClassName:
      "bg-yellow-100 dark:bg-yellow-950 rounded-xl p-0.5 corner-squircle text-yellow-500 shadow-[inset_0_0_0_1px_rgba(234,179,8,0.14),0_2px_6px_-2px_rgba(234,179,8,0.25)] dark:shadow-(--custom-shadow)",
  },
];

export const account: NavItem[] = [
  {
    href: "/settings",
    label: "API Keys",
    icon: IconKey,
    activeIcon: IconKeyFilled,
    iconClassName: "dark:text-neutral-500 text-neutral-400",
  },
  {
    href: "/settings/provider-keys",
    label: "Provider Keys",
    icon: IconLock,
    activeIcon: IconLockFilled,
    iconClassName: "dark:text-neutral-500 text-neutral-400",
  },
  {
    href: "/settings/org",
    label: "Settings",
    icon: IconSettings,
    activeIcon: IconSettingsFilled,
    iconClassName: "dark:text-neutral-500 text-neutral-400",
  },
];

/** Look up a nav item by its href, e.g. to drive a page-header breadcrumb. */
export function navItem(href: Route): NavItem | undefined {
  return [...nav, ...account].find((item) => item.href === href);
}
