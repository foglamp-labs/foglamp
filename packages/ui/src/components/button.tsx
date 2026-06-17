import * as React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@foglamp/ui/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-[1.5px] focus-visible:ring-ring/50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[1.5px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "bg-neutral-800 dark:bg-neutral-200 shadow-[var(--custom-shadow-primary)] text-primary-foreground hover:bg-primary/80 dark:hover:bg-primary/90",
        outline:
          "shadow-(--custom-shadow) bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-input/10 dark:hover:bg-input/50",
        secondary:
          "bg-secondary shadow-[var(--custom-shadow-secondary)] text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        // Like `ghost` (transparent at rest), but hover tints it red — bg and
        // icon/text both shift to the destructive color. For low-emphasis
        // delete affordances that only "arm" on hover.
        "ghost-destructive":
          "hover:bg-destructive/10 hover:text-destructive focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:hover:bg-destructive/20 dark:focus-visible:ring-destructive/40",
        destructive:
          "bg-destructive/10 shadow-[var(--custom-shadow-destructive)] text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        // Underline stays rendered but transparent at rest, fading its opacity
        // in on hover — the base `transition-all` animates the decoration color.
        link: "text-foreground underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3 in-data-[slot=button-group]:rounded-full has-[>svg:first-child]:pl-2 has-[>svg:last-child]:pr-2",
        xs: "h-6 gap-[4px] rounded-full px-2.5 text-xs in-data-[slot=button-group]:rounded-full has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-[5px] rounded-full px-3 in-data-[slot=button-group]:rounded-full has-[>svg:first-child]:pl-2 has-[>svg:last-child]:pr-2",
        lg: "h-9 gap-1.5 px-3 has-[>svg:first-child]:pl-2.5 has-[>svg:last-child]:pr-2.5",
        icon: "size-9",
        "icon-xs":
          "size-6 rounded-full in-data-[slot=button-group]:rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-full in-data-[slot=button-group]:rounded-full",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  children,
  nativeButton,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      // When `render` swaps in a non-button element (e.g. a Next.js
      // <Link>/<a>), it isn't a native <button>; tell Base UI so it applies the
      // right a11y semantics instead of warning. An explicit prop always wins.
      nativeButton={nativeButton ?? props.render === undefined}
      {...props}
    >
      {React.Children.map(children, (child) =>
        typeof child === "string" || typeof child === "number" ? (
          <span>{child}</span>
        ) : (
          child
        )
      )}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
