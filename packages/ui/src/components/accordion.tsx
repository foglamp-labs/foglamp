import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";

import { cn } from "@foglamp/ui/lib/utils";
import { IconChevronDown } from "@tabler/icons-react";

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("flex w-full flex-col", className)}
      {...props}
    />
  );
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("not-last:border-b", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group/accordion-trigger relative flex flex-1 items-start justify-between rounded-md border border-transparent py-4 text-left text-sm font-medium outline-none hover:underline focus-visible:border-ring focus-visible:ring-[1.5px] focus-visible:ring-ring/50 focus-visible:after:border-ring aria-disabled:pointer-events-none pr-2 aria-disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground",
          className
        )}
        {...props}
      >
        {children}
        <IconChevronDown
          data-slot="accordion-trigger-icon"
          className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:rotate-180 transition-transform duration-300"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    // Height transitions on Base UI's measured panel height: 0 in the
    // starting/ending styles, the measured value in between. The curve is a
    // fast-out, long-settle ease (same one the landing hero uses) so the panel
    // decelerates into place rather than the default ease-out's flat finish.
    // The content inside fades on the same clock, so it doesn't sit fully
    // opaque in a sliver of panel at either end.
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="group/accordion-content h-(--accordion-panel-height) overflow-hidden text-sm transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-ending-style:h-0 data-starting-style:h-0"
      {...props}
    >
      <div
        className={cn(
          "pt-0 pb-4 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-ending-style/accordion-content:opacity-0 group-data-starting-style/accordion-content:opacity-0 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
