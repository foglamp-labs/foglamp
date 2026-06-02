"use client";
import Link from "next/link";

import { Button } from "@foglamp/ui/components/button";
import { ThemeSwitcher } from "./theme-switcher";
import UserMenu from "./user-menu";

export default function Header() {
  const links = [
    { to: "/", label: "Home" },
    { to: "/overview", label: "Dashboard" },
    { to: "/pricing", label: "Pricing" },
  ] as const;

  return (
    <div>
      <div
        className="flex flex-row items-center justify-between py-4
       "
      >
        <nav className="flex gap-8 text-lg">
          {links.map(({ to, label }) => {
            return (
              <Link key={to} href={to}>
                <Button size="sm" variant="link" className="p-0">
                  {label}
                </Button>
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <UserMenu />
        </div>
      </div>
    </div>
  );
}
