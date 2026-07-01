import type { PosterData, RailItem } from "@foglamp/contracts/poster";
import { Badge } from "@foglamp/ui/components/badge";
import { Card, CardContent } from "@foglamp/ui/components/card";
import { IconBox, IconPlug, type IconProps } from "@tabler/icons-react";
import type { ComponentType } from "react";

import { BrandMark, Favicon } from "./brand";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  return `${months[(m ?? 1) - 1]} ${d} ${y}`;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="font-display text-2xl font-medium tabular-nums">
        {value}
      </span>
    </div>
  );
}

function Chip({
  item,
  FallbackIcon,
}: {
  item: RailItem;
  FallbackIcon: ComponentType<IconProps>;
}) {
  return (
    <Badge
      variant="outline"
      size="lg"
      className="gap-1.5 font-normal normal-case"
    >
      <Favicon
        domain={item.domain}
        className="size-3.5 rounded-sm"
        fallback={<FallbackIcon className="text-muted-foreground" />}
      />
      {item.label}
    </Badge>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="mb-3 text-xs uppercase text-muted-foreground">{children}</h2>
  );
}

export function LeftRail({ data }: { data: PosterData }) {
  const { project, stats, topModels, topTools, topIntegrations } = data;
  return (
    <Card className="absolute inset-y-6 left-6 z-20 w-80 overflow-y-auto">
      <CardContent className="flex h-full flex-col">
        <header className="flex flex-col gap-2">
          <Favicon
            domain={project.iconDomain}
            className="size-8 rounded-xl"
            fallback={
              <span className="font-display text-2xl font-bold text-orange-500">
                {project.name.charAt(0)}
              </span>
            }
          />
          <h1 className="font-display text-xl font-semibold tracking-tight">
            {project.name}
          </h1>
          {project.tagline ? (
            <p className="max-w-xs text-sm text-muted-foreground">
              {project.tagline}
            </p>
          ) : null}
        </header>

        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 border-t pt-6 border-muted">
          <Stat value={stats.agents} label="Agents" />
          <Stat value={stats.models} label="Models" />
          <Stat value={stats.tools} label="Tools" />
          <Stat value={stats.integrations} label="Integrations" />
        </div>

        {topModels.length > 0 ? (
          <section className="mt-8">
            <SectionTitle>Models</SectionTitle>
            <ol className="flex list-none flex-col gap-3">
              {topModels.map((m, i) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span className="w-3 text-center font-display text-xs font-semibold text-muted-foreground/50">
                    {i + 1}
                  </span>
                  <Favicon
                    domain={m.domain}
                    className="size-4 rounded-sm"
                    fallback={
                      <IconBox
                        className="size-4 text-muted-foreground"
                        stroke={2}
                      />
                    }
                  />
                  <span className="text-sm font-medium">{m.label}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {topTools.length > 0 ? (
          <section className="mt-8">
            <SectionTitle>Tools</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {topTools.map((t) => (
                <Chip key={t.id} item={t} FallbackIcon={IconBox} />
              ))}
            </div>
          </section>
        ) : null}

        {topIntegrations.length > 0 ? (
          <section className="mt-8">
            <SectionTitle>Integrations</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {topIntegrations.map((t) => (
                <Chip key={t.id} item={t} FallbackIcon={IconPlug} />
              ))}
            </div>
          </section>
        ) : null}

        <footer className="mt-auto pt-6">
          <BrandMark className="h-3.5 w-auto" />
        </footer>
      </CardContent>
    </Card>
  );
}
