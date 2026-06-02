import { cn } from "@foglamp/ui/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-2xl corner-squircle bg-muted",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
