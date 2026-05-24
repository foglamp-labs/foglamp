import * as React from "react";

import { cn } from "@watchtower/ui/lib/utils";

export function ComponentSection({
  name,
  description,
  children,
}: {
  name: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={name.toLowerCase().replace(/\s+/g, "-")}
      className="grid grid-cols-1 gap-6 border-b border-border/60 px-8 py-10 lg:grid-cols-[200px_1fr]"
    >
      <div className="lg:sticky lg:top-8 lg:self-start">
        <h2 className="font-heading text-base font-medium text-foreground">
          {name}
        </h2>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-6">{children}</div>
    </section>
  );
}

export function VariantColumn({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-[180px] flex-col gap-3", className)}>
      <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className="flex flex-col items-start gap-3">{children}</div>
    </div>
  );
}

export function SizeRow({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      {label ? (
        <span className="text-[10px] text-muted-foreground/80">{label}</span>
      ) : null}
      <div className="flex w-full items-center">{children}</div>
    </div>
  );
}
