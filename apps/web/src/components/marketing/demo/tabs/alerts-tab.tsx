"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAlertTriangleFilled,
  IconCircleCheckFilled,
} from "@tabler/icons-react";

import { navItem } from "@/components/app/nav";
import { PageHeader } from "@/components/app/page-parts";

import { ALERTS } from "../mock-data";

export function AlertsTab() {
  return (
    <>
      <PageHeader
        title="Alerts"
        description="Threshold rules on cost, latency, errors, and eval scores — checked every minute."
        icon={navItem("/alerts")?.icon}
        iconClassName={navItem("/alerts")?.iconClassName}
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ALERTS.map((a) => {
          const firing = a.status === "firing";
          return (
            <Card
              key={a.id}
              size="sm"
              className={cn(
                firing &&
                  "shadow-[inset_0_0_0_1px_rgba(244,63,94,0.3),0_2px_10px_-4px_rgba(244,63,94,0.4)]"
              )}
            >
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-lg corner-squircle p-0.5",
                      firing
                        ? "bg-rose-100 text-rose-500 dark:bg-rose-950"
                        : "bg-emerald-100 text-emerald-500 dark:bg-emerald-950"
                    )}
                  >
                    {firing ? (
                      <span className="relative grid place-items-center">
                        <span className="absolute size-3.5 animate-ping rounded-full bg-rose-500/40" />
                        <IconAlertTriangleFilled className="relative size-3.5" />
                      </span>
                    ) : (
                      <IconCircleCheckFilled className="size-3.5" />
                    )}
                  </span>
                  <CardTitle className="truncate">{a.name}</CardTitle>
                  <span className="text-xs text-muted-foreground/50 ml-auto">
                    {a.when}
                  </span>
                </div>
                <CardDescription className="font-mono text-xs bg-muted/50 p-1.5 rounded mt-1">
                  {a.metric} {a.condition}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-baseline justify-between">
                <span className="text-base font-medium tabular-nums">
                  {a.lastValue}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </>
  );
}
