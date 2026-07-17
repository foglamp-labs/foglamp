"use client";

import type { ScanData, RailItem } from "@foglamp/contracts/scan";
import { Card, CardContent } from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAiAgent,
  IconArrowBarToDown,
  IconBox,
  IconList,
  IconPlug,
  type IconProps,
  IconSearch,
  IconSitemapFilled,
  IconTool,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

import { Favicon, ModelIcon } from "./brand";

// Tool icon by name convention — same logic as the HUD's toolGlyph
// (packages/sdk/src/hud/react/FoglampHUD.tsx): search/list/get prefixes map
// to recognizable icons, everything else keeps the generic mark.
function toolIcon(item: RailItem): ComponentType<IconProps> {
  const n = item.label.toLowerCase();
  if (/^(search|find|query|lookup)/.test(n)) return IconSearch;
  if (/^(list|ls|index|all)/.test(n)) return IconList;
  if (/^(get|fetch|read|load)/.test(n)) return IconArrowBarToDown;
  return IconTool;
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
    <h2 className="mb-3 flex items-center gap-2 text-xs text-muted-foreground ml-px">
      <Icon className={cn("size-[12px] opacity-70", iconClassName)} />
      <span className="leading-none">{label}</span>
    </h2>
  );
}

export function LeftRail({ data }: { data: ScanData }) {
  const { topModels, topTools, topIntegrations } = data;
  return (
    <Card className="flex max-h-[50dvh] flex-col overflow-hidden rounded-[36px] py-0 pr-12 no-scrollbar">
      {/* Scroll (and all vertical padding) lives on the content so the fade
          mask reaches the card edges and dissolves rows, not the card. */}
      <CardContent className="scroll-fade scrollbar-none flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 no-scrollbar">
        {topModels.length > 0 ? (
          <section className="mt-1 px-1">
            <SectionHeader
              label="Models"
              Icon={IconAiAgent}
              iconClassName="mb-px opacity-50"
            />
            <ol className="flex list-none flex-col gap-3">
              {topModels.map((m, i) => (
                <li key={m.id} className="flex items-center gap-2">
                  <ModelIcon
                    label={m.label}
                    domain={m.domain}
                    className="size-3.5"
                  />
                  <span className="text-sm font-medium">{m.label}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {topTools.length > 0 ? (
          <section className="mt-8 px-1">
            <SectionHeader
              label="Tools"
              Icon={IconTool}
              iconClassName="fill-current opacity-40 mb-px"
            />
            <ul className="flex list-none flex-col gap-3">
              {topTools.map((t) => (
                <RailRow key={t.id} item={t} FallbackIcon={toolIcon(t)} />
              ))}
            </ul>
          </section>
        ) : null}

        {topIntegrations.length > 0 ? (
          <section className="mt-8 pb-12 px-1">
            <SectionHeader
              label="Integrations"
              Icon={IconSitemapFilled}
              iconClassName="opacity-40 mb-px"
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
