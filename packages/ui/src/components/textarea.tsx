import * as React from "react";

import { cn } from "@foglamp/ui/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-2xl corner-squircle shadow-(--custom-shadow) dark:shadow-none dark:border dark:border-border/50 hover:dark:border-border/70 bg-transparent px-2.5 py-2 text-base transition-[color,box-shadow] outline-none placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-[1.5px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[1.5px] aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
