"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconFileCode,
  IconFileCodeFilled,
  IconSparkles,
  IconSparkles2Filled,
  IconSparklesFilled,
} from "@tabler/icons-react";

import { FAMILY_CHIP, presetMeta } from "@/app/(app)/evals/preset-meta";
import { navItem } from "@/components/app/nav";
import { PageHeader } from "@/components/app/page-parts";
import { Stat } from "@/components/app/stat";

import { useDemo } from "../demo-context";
import { EVALS } from "../mock-data";

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export function EvalsTab() {
  const { openDetail } = useDemo();

  return (
    <>
      <PageHeader
        title="Evals"
        description="Score production traces and spans with code checks and LLM-as-a-judge."
        icon={navItem("/evals")?.icon}
        iconClassName={navItem("/evals")?.iconClassName}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {EVALS.map((e) => {
          const isCode = e.type === "code";
          const { icon: PIcon, family } = presetMeta(e.presetId);
          return (
            <Card
              key={e.id}
              size="sm"
              className="cursor-pointer transition-colors hover:bg-accent/40"
              onClick={() => openDetail({ type: "eval", id: e.id })}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PIcon
                    className={cn(
                      "size-6 shrink-0 rounded-xl corner-squircle p-1",
                      FAMILY_CHIP[family]
                    )}
                  />
                  <span className="truncate">{e.name}</span>
                  <Badge
                    variant={isCode ? "blue" : "violet"}
                    className="ml-auto shrink-0"
                  >
                    {isCode ? <IconFileCodeFilled /> : <IconSparkles2Filled />}
                    {isCode ? "code" : "LLM"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3 text-sm mt-2">
                <Stat label="Scored" value={e.scored} />
                <Stat label="Pass rate" value={pct(e.passRate)} />
                <Stat
                  label="Avg score"
                  value={e.avgScore.toFixed(2)}
                  emphasis
                  valueClassName={
                    e.avgScore < 0.9
                      ? "text-amber-600 dark:text-amber-500"
                      : undefined
                  }
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
