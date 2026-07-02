"use client";

import type { PosterData, RailItem } from "@foglamp/contracts/poster";
import { Card, CardContent } from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import NumberFlow from "@number-flow/react";
import {
  IconAiAgent,
  IconBox,
  IconGhostFilled,
  IconPlug,
  type IconProps,
  IconSitemapFilled,
  IconTool,
} from "@tabler/icons-react";
import { type ComponentType, useEffect, useState } from "react";

import { BrandMark, Favicon } from "./brand";
import { modelDomain } from "./favicon";
import { derivePersonality } from "./personality";

function Stat({
  value,
  label,
  Icon,
  iconClassName,
}: {
  value: number;
  label: string;
  Icon: ComponentType<IconProps>;
  iconClassName?: string;
}) {
  // Count up from 0 on mount (NumberFlow animates the transition).
  const [display, setDisplay] = useState(0);
  useEffect(() => setDisplay(value), [value]);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className={cn("size-[11px]", iconClassName)} />
        <span className="leading-none">{label}</span>
      </span>
      {/* Invisible copy of the final value reserves the width, so the
          count-up never shifts the layout. */}
      <span className="relative font-display text-base font-medium tabular-nums">
        <span className="invisible">{value}</span>
        <NumberFlow value={display} className="absolute inset-0" />
      </span>
    </div>
  );
}

function RailRow({
  item,
  FallbackIcon,
}: {
  item: RailItem;
  FallbackIcon: ComponentType<IconProps>;
}) {
  return (
    <li className="flex items-center gap-2">
      <Favicon
        domain={item.domain}
        className="size-3.5 rounded-sm"
        fallback={
          <FallbackIcon className="size-3.5 text-muted-foreground" stroke={2} />
        }
      />
      <span className="text-sm font-medium">{item.label}</span>
    </li>
  );
}

function SectionHeader({
  label,
  Icon,
  iconClassName,
}: {
  label: string;
  Icon: ComponentType<IconProps>;
  iconClassName?: string;
}) {
  return (
    <h2 className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className={cn("size-[11px] opacity-80", iconClassName)} />
      <span className="leading-none">{label}</span>
    </h2>
  );
}

export function LeftRail({ data }: { data: PosterData }) {
  const { project, stats, topModels, topTools, topIntegrations } = data;
  const personality = derivePersonality(data);
  return (
    <Card className="border-overlay absolute inset-y-6 left-6 z-20 w-80 overflow-y-auto">
      <CardContent className="flex h-full flex-col">
        {/* Personality card — Arc-style art block, deterministic per archetype. */}
        <div
          className={cn(
            "border-overlay relative mb-5 h-28 shrink-0 overflow-hidden rounded-2xl corner-squircle bg-linear-to-br",
            personality.gradient
          )}
        >
          {/* pseudo-art: soft light + shade orbs, and a big rotated glyph */}
          <div className="absolute -top-8 -right-2 size-28 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute -bottom-10 left-6 size-24 rounded-full bg-black/15 blur-2xl" />
          <div className="absolute top-4 left-1/2 size-10 rounded-full bg-white/10 blur-lg" />
          <personality.Icon className="absolute -right-3 -bottom-5 size-24 rotate-12 text-white/20" />
          <div className="absolute top-3 left-4 flex items-center gap-1.5 text-white">
            <personality.Icon className="size-3.5 drop-shadow" />
            <span className="font-display text-sm font-semibold tracking-tight drop-shadow">
              {personality.title}
            </span>
          </div>
          {/* foglamp brand mark */}
          <a
            href="https://foglamp.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-3.5 right-4 text-white transition-opacity hover:opacity-80"
          >
            <BrandMark className="h-2.5 w-auto drop-shadow" />
          </a>
          {/* project identity lockup */}
          <div className="absolute bottom-3 left-4 flex items-center gap-2 text-white">
            <Favicon
              domain={project.iconDomain}
              className="size-4 rounded-sm"
              fallback={
                <span className="font-display text-base font-bold drop-shadow">
                  {project.name.charAt(0)}
                </span>
              }
            />
            <h1 className="font-display text-base font-semibold tracking-tight drop-shadow">
              {project.name}
            </h1>
          </div>
        </div>

        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-5">
          <Stat
            value={stats.agents}
            label="Agents"
            Icon={IconGhostFilled}
            iconClassName="mb-px opacity-70"
          />
          <Stat
            value={stats.models}
            label="Models"
            Icon={IconAiAgent}
            iconClassName="mb-px opacity-80"
          />
          <Stat
            value={stats.tools}
            label="Tools"
            Icon={IconTool}
            iconClassName="fill-current opacity-70 mb-px"
          />
          <Stat
            value={stats.integrations}
            label="Integrations"
            Icon={IconSitemapFilled}
            iconClassName="opacity-70 mb-px"
          />
        </div>

        {topModels.length > 0 ? (
          <section className="mt-5 border-t pt-7 border-muted">
            <SectionHeader
              label="Models"
              Icon={IconAiAgent}
              iconClassName="mb-px opacity-80"
            />
            <ol className="flex list-none flex-col gap-3">
              {topModels.map((m, i) => (
                <li key={m.id} className="flex items-center gap-2">
                  <Favicon
                    domain={modelDomain(m.label, m.domain)}
                    className="size-3.5 rounded-sm"
                    fallback={
                      <IconBox
                        className="size-3.5 text-muted-foreground"
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
            <SectionHeader
              label="Tools"
              Icon={IconTool}
              iconClassName="fill-current opacity-70 mb-px"
            />
            <ul className="flex list-none flex-col gap-3">
              {topTools.map((t) => (
                <RailRow key={t.id} item={t} FallbackIcon={IconBox} />
              ))}
            </ul>
          </section>
        ) : null}

        {topIntegrations.length > 0 ? (
          <section className="mt-8 pb-12">
            <SectionHeader
              label="Integrations"
              Icon={IconSitemapFilled}
              iconClassName="opacity-70 mb-px"
            />
            <ul className="flex list-none flex-col gap-3">
              {topIntegrations.map((t) => (
                <RailRow key={t.id} item={t} FallbackIcon={IconPlug} />
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
