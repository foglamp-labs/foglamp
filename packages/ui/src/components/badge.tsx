import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@boilerplate/ui/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center overflow-hidden font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--custom-shadow-primary)] [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary shadow-(--custom-shadow-secondary) text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive shadow-(--custom-shadow-destructive) focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        green:
          "bg-green-500/10 text-green-700 shadow-[var(--custom-shadow-green)] focus-visible:ring-green-500/20 dark:bg-green-500/15 dark:text-green-300 dark:focus-visible:ring-green-500/40 [a]:hover:bg-green-500/20",
        blue: "bg-blue-500/10 text-blue-700 shadow-[var(--custom-shadow-blue)] focus-visible:ring-blue-500/20 dark:bg-blue-500/15 dark:text-blue-300 dark:focus-visible:ring-blue-500/40 [a]:hover:bg-blue-500/20",
        amber:
          "bg-amber-500/10 text-amber-700 shadow-[var(--custom-shadow-amber)] focus-visible:ring-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300 dark:focus-visible:ring-amber-500/40 [a]:hover:bg-amber-500/20",
        emerald:
          "bg-emerald-500/10 text-emerald-700 shadow-[var(--custom-shadow-emerald)] focus-visible:ring-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:focus-visible:ring-emerald-500/40 [a]:hover:bg-emerald-500/20",
        rose: "bg-rose-500/10 text-rose-700 shadow-[var(--custom-shadow-rose)] focus-visible:ring-rose-500/20 dark:bg-rose-500/15 dark:text-rose-300 dark:focus-visible:ring-rose-500/40 [a]:hover:bg-rose-500/20",
        violet:
          "bg-violet-500/10 text-violet-700 shadow-[var(--custom-shadow-violet)] focus-visible:ring-violet-500/20 dark:bg-violet-500/15 dark:text-violet-300 dark:focus-visible:ring-violet-500/40 [a]:hover:bg-violet-500/20",
        outline:
          "shadow-(--custom-shadow) text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
      },
      size: {
        md: "h-5 rounded-sm px-2 py-0.5 gap-[5px] text-xs has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5 [&>svg]:size-[11px]!",
        lg: "h-6 rounded-sm px-2.5 py-1 gap-1.5 text-sm has-[>svg:first-child]:pl-2 has-[>svg:last-child]:pr-2 [&>svg]:size-3.5!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

function Badge({
  className,
  variant = "default",
  size = "md",
  render,
  children,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  const wrappedChildren = React.Children.map(children, (child) =>
    typeof child === "string" || typeof child === "number" ? (
      <span>{child}</span>
    ) : (
      child
    )
  );

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size }), className),
        children: wrappedChildren,
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
      size,
    },
  });
}

export { Badge, badgeVariants };
