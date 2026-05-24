"use client";

import {
  IconAlarm,
  IconBell,
  IconBookmark,
  IconChevronDown,
  IconClipboard,
  IconCopy,
  IconHeart,
  IconInfoCircle,
  IconLogout,
  IconMail,
  IconPlus,
  IconScissors,
  IconSearch,
  IconSettings,
  IconStar,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
} from "recharts";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@watchtower/ui/components/accordion";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@watchtower/ui/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@watchtower/ui/components/alert-dialog";
import { AspectRatio } from "@watchtower/ui/components/aspect-ratio";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
} from "@watchtower/ui/components/avatar";
import { Badge } from "@watchtower/ui/components/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@watchtower/ui/components/breadcrumb";
import { Button } from "@watchtower/ui/components/button";
import { ButtonGroup } from "@watchtower/ui/components/button-group";
import { Calendar } from "@watchtower/ui/components/calendar";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@watchtower/ui/components/carousel";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@watchtower/ui/components/chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@watchtower/ui/components/card";
import { Checkbox } from "@watchtower/ui/components/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@watchtower/ui/components/collapsible";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@watchtower/ui/components/combobox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@watchtower/ui/components/command";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@watchtower/ui/components/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@watchtower/ui/components/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@watchtower/ui/components/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@watchtower/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@watchtower/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@watchtower/ui/components/field";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@watchtower/ui/components/hover-card";
import { Input } from "@watchtower/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@watchtower/ui/components/input-group";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@watchtower/ui/components/input-otp";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@watchtower/ui/components/item";
import { Kbd, KbdGroup } from "@watchtower/ui/components/kbd";
import { Label } from "@watchtower/ui/components/label";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@watchtower/ui/components/menubar";
import {
  NativeSelect,
  NativeSelectOption,
} from "@watchtower/ui/components/native-select";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@watchtower/ui/components/navigation-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@watchtower/ui/components/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@watchtower/ui/components/popover";
import { Progress } from "@watchtower/ui/components/progress";
import {
  RadioGroup,
  RadioGroupItem,
} from "@watchtower/ui/components/radio-group";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@watchtower/ui/components/resizable";
import { ScrollArea } from "@watchtower/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@watchtower/ui/components/select";
import { Separator } from "@watchtower/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@watchtower/ui/components/sheet";
import { Skeleton } from "@watchtower/ui/components/skeleton";
import { Slider } from "@watchtower/ui/components/slider";
import { Spinner } from "@watchtower/ui/components/spinner";
import { Switch } from "@watchtower/ui/components/switch";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@watchtower/ui/components/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@watchtower/ui/components/tabs";
import { Textarea } from "@watchtower/ui/components/textarea";
import { Toggle } from "@watchtower/ui/components/toggle";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@watchtower/ui/components/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@watchtower/ui/components/tooltip";

import { ComponentSection, SizeRow, VariantColumn } from "./showcase-shell";

const buttonVariants = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const;
const buttonSizes = ["xs", "sm", "default", "lg"] as const;
const buttonIconSizes = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const;
const badgeVariants = [
  "default",
  "secondary",
  "destructive",
  "green",
  "blue",
  "amber",
  "emerald",
  "rose",
  "violet",
  "outline",
] as const;
const badgeSizes = ["md", "lg"] as const;

const chartData = [
  { month: "Jan", desktop: 186, mobile: 80 },
  { month: "Feb", desktop: 305, mobile: 200 },
  { month: "Mar", desktop: 237, mobile: 120 },
  { month: "Apr", desktop: 273, mobile: 190 },
  { month: "May", desktop: 209, mobile: 130 },
  { month: "Jun", desktop: 314, mobile: 240 },
];

const chartConfig = {
  desktop: { label: "Desktop", color: "var(--chart-1)" },
  mobile: { label: "Mobile", color: "var(--chart-3)" },
} satisfies ChartConfig;

const pieData = [
  { source: "direct", visitors: 275, fill: "var(--chart-1)" },
  { source: "referral", visitors: 200, fill: "var(--chart-2)" },
  { source: "social", visitors: 187, fill: "var(--chart-3)" },
  { source: "email", visitors: 173, fill: "var(--chart-4)" },
  { source: "other", visitors: 90, fill: "var(--chart-5)" },
];

const pieConfig = {
  visitors: { label: "Visitors" },
  direct: { label: "Direct", color: "var(--chart-1)" },
  referral: { label: "Referral", color: "var(--chart-2)" },
  social: { label: "Social", color: "var(--chart-3)" },
  email: { label: "Email", color: "var(--chart-4)" },
  other: { label: "Other", color: "var(--chart-5)" },
} satisfies ChartConfig;

const fruitOptions = [
  "Apple",
  "Banana",
  "Blueberry",
  "Grapes",
  "Pineapple",
  "Strawberry",
] as const;

export function ComponentsShowcase() {
  return (
    <TooltipProvider>
      <div className="flex flex-col">
        <ComponentSection name="Button" description="Variants × sizes">
          {buttonVariants.map((variant) => (
            <VariantColumn key={variant} label={variant}>
              {buttonSizes.map((size) => (
                <SizeRow key={size} label={size}>
                  <Button variant={variant} size={size}>
                    Button
                  </Button>
                </SizeRow>
              ))}
              {buttonIconSizes.map((size) => (
                <SizeRow key={size} label={size}>
                  <Button variant={variant} size={size}>
                    <IconPlus />
                  </Button>
                </SizeRow>
              ))}
            </VariantColumn>
          ))}
        </ComponentSection>

        <ComponentSection name="Badge" description="Variants × sizes">
          {badgeVariants.map((variant) => (
            <VariantColumn key={variant} label={variant}>
              {badgeSizes.map((size) => (
                <SizeRow key={size} label={size}>
                  <Badge variant={variant} size={size}>
                    Badge
                  </Badge>
                </SizeRow>
              ))}
              <SizeRow label="with icon">
                <Badge variant={variant}>
                  <IconAlarm className="stroke-[2.5] mb-px" /> Badge
                </Badge>
              </SizeRow>
            </VariantColumn>
          ))}
        </ComponentSection>

        <ComponentSection name="Alert">
          <VariantColumn label="default">
            <Alert>
              <IconInfoCircle />
              <AlertTitle>Heads up!</AlertTitle>
              <AlertDescription>
                You can configure alerts in settings.
              </AlertDescription>
            </Alert>
          </VariantColumn>
          <VariantColumn label="destructive">
            <Alert variant="destructive">
              <IconInfoCircle />
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>Please try submitting again.</AlertDescription>
            </Alert>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Avatar">
          <VariantColumn label="default">
            <SizeRow label="sm">
              <Avatar size="sm">
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
            </SizeRow>
            <SizeRow label="default">
              <Avatar>
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
            </SizeRow>
            <SizeRow label="lg">
              <Avatar size="lg">
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
            </SizeRow>
          </VariantColumn>
          <VariantColumn label="with badge">
            <Avatar>
              <AvatarFallback>JD</AvatarFallback>
              <AvatarBadge />
            </Avatar>
          </VariantColumn>
          <VariantColumn label="group">
            <AvatarGroup>
              <Avatar>
                <AvatarFallback>A</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>B</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>C</AvatarFallback>
              </Avatar>
            </AvatarGroup>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Input">
          <VariantColumn label="default">
            <Input placeholder="email@example.com" />
            <Input placeholder="Fisabled" disabled />
            <Input placeholder="Invalid" aria-invalid />
          </VariantColumn>
          <VariantColumn label="textarea">
            <Textarea
              placeholder="Type your message here."
              className="w-[220px]"
            />
          </VariantColumn>
          <VariantColumn label="input group">
            <InputGroup>
              <InputGroupAddon>
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput placeholder="Search…" />
            </InputGroup>
          </VariantColumn>
          <VariantColumn label="OTP">
            <InputOTP maxLength={6}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Select">
          <VariantColumn label="default size">
            <Select defaultValue="apple">
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Pick fruit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="apple">Apple</SelectItem>
                <SelectItem value="banana">Banana</SelectItem>
                <SelectItem value="orange">Orange</SelectItem>
              </SelectContent>
            </Select>
          </VariantColumn>
          <VariantColumn label="sm size">
            <Select defaultValue="apple">
              <SelectTrigger size="sm" className="w-[180px]">
                <SelectValue placeholder="Pick fruit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="apple">Apple</SelectItem>
                <SelectItem value="banana">Banana</SelectItem>
                <SelectItem value="orange">Orange</SelectItem>
              </SelectContent>
            </Select>
          </VariantColumn>
          <VariantColumn label="native">
            <NativeSelect defaultValue="apple">
              <NativeSelectOption value="apple">Apple</NativeSelectOption>
              <NativeSelectOption value="banana">Banana</NativeSelectOption>
              <NativeSelectOption value="orange">Orange</NativeSelectOption>
            </NativeSelect>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Toggle">
          <VariantColumn label="default">
            <SizeRow label="sm">
              <Toggle size="sm">Bold</Toggle>
            </SizeRow>
            <SizeRow label="default">
              <Toggle>Bold</Toggle>
            </SizeRow>
            <SizeRow label="lg">
              <Toggle size="lg">Bold</Toggle>
            </SizeRow>
          </VariantColumn>
          <VariantColumn label="outline">
            <SizeRow label="sm">
              <Toggle variant="outline" size="sm">
                Bold
              </Toggle>
            </SizeRow>
            <SizeRow label="default">
              <Toggle variant="outline">Bold</Toggle>
            </SizeRow>
            <SizeRow label="lg">
              <Toggle variant="outline" size="lg">
                Bold
              </Toggle>
            </SizeRow>
          </VariantColumn>
          <VariantColumn label="toggle group">
            <ToggleGroup defaultValue={["b"]}>
              <ToggleGroupItem value="a">A</ToggleGroupItem>
              <ToggleGroupItem value="b">B</ToggleGroupItem>
              <ToggleGroupItem value="c">C</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup defaultValue={["b"]} variant="outline">
              <ToggleGroupItem value="a">A</ToggleGroupItem>
              <ToggleGroupItem value="b">B</ToggleGroupItem>
              <ToggleGroupItem value="c">C</ToggleGroupItem>
            </ToggleGroup>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Checkbox / Radio / Switch">
          <VariantColumn label="checkbox">
            <div className="flex items-center gap-2">
              <Checkbox id="a" defaultChecked />
              <Label htmlFor="a">Default</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="b" />
              <Label htmlFor="b">Unchecked</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="c" disabled />
              <Label htmlFor="c">Disabled</Label>
            </div>
          </VariantColumn>
          <VariantColumn label="radio group">
            <RadioGroup defaultValue="one" className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="one" id="r1" />
                <Label htmlFor="r1">Option one</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="two" id="r2" />
                <Label htmlFor="r2">Option two</Label>
              </div>
            </RadioGroup>
          </VariantColumn>
          <VariantColumn label="switch">
            <div className="flex items-center gap-2">
              <Switch id="s1" defaultChecked />
              <Label htmlFor="s1">Notifications</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="s2" />
              <Label htmlFor="s2">Off</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="s3" size="sm" defaultChecked />
              <Label htmlFor="s3">Compact on</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="s4" size="sm" />
              <Label htmlFor="s4">Compact off</Label>
            </div>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Slider / Progress">
          <VariantColumn label="slider" className="min-w-[260px]">
            <Slider
              defaultValue={[33]}
              max={100}
              step={1}
              className="w-[220px]"
            />
            <Slider
              defaultValue={[20, 70]}
              max={100}
              step={1}
              className="w-[220px]"
            />
          </VariantColumn>
          <VariantColumn label="progress" className="min-w-[260px]">
            <Progress value={25} className="w-[220px]" />
            <Progress value={60} className="w-[220px]" />
            <Progress value={92} className="w-[220px]" />
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Card">
          <VariantColumn label="default" className="min-w-[280px]">
            <Card className="w-[260px]">
              <CardHeader>
                <CardTitle>Card title</CardTitle>
                <CardDescription>Card description goes here.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Body content with details.
              </CardContent>
            </Card>
          </VariantColumn>
          <VariantColumn label="sm" className="min-w-[260px]">
            <Card size="sm" className="w-[240px]">
              <CardHeader>
                <CardTitle>Compact</CardTitle>
                <CardDescription>Smaller padding.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Tight layout.
              </CardContent>
            </Card>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Tabs">
          <VariantColumn label="default">
            <Tabs defaultValue="overview" className="w-[260px]">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="usage">Usage</TabsTrigger>
              </TabsList>
              <TabsContent
                value="overview"
                className="pt-2 text-sm text-muted-foreground"
              >
                Overview panel
              </TabsContent>
              <TabsContent
                value="usage"
                className="pt-2 text-sm text-muted-foreground"
              >
                Usage panel
              </TabsContent>
            </Tabs>
          </VariantColumn>
          <VariantColumn label="line">
            <Tabs defaultValue="overview" className="w-[260px]">
              <TabsList variant="line">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="usage">Usage</TabsTrigger>
              </TabsList>
              <TabsContent
                value="overview"
                className="pt-2 text-sm text-muted-foreground"
              >
                Overview panel
              </TabsContent>
              <TabsContent
                value="usage"
                className="pt-2 text-sm text-muted-foreground"
              >
                Usage panel
              </TabsContent>
            </Tabs>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Accordion">
          <VariantColumn label="single" className="min-w-[300px]">
            <Accordion className="w-[280px]">
              <AccordionItem value="a">
                <AccordionTrigger>What is this?</AccordionTrigger>
                <AccordionContent>A design system showcase.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="b">
                <AccordionTrigger>How do I use it?</AccordionTrigger>
                <AccordionContent>
                  Compose components from the UI package.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Collapsible">
          <VariantColumn label="default">
            <Collapsible className="w-[240px]">
              <CollapsibleTrigger render={<Button variant="outline" />}>
                Toggle <IconChevronDown className="ml-1" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 rounded-md shadow-(--custom-shadow) bg-muted/40 p-3 text-sm">
                Hidden content revealed.
              </CollapsibleContent>
            </Collapsible>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Breadcrumb / Pagination">
          <VariantColumn label="breadcrumb">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">Home</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">Components</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Button</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </VariantColumn>
          <VariantColumn label="pagination">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious href="#" />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#">1</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#" isActive>
                    2
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#">3</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext href="#" />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection
          name="Overlays"
          description="Triggers — click to open"
        >
          <VariantColumn label="dialog">
            <Dialog>
              <DialogTrigger render={<Button variant="outline" />}>
                Open dialog
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit profile</DialogTitle>
                  <DialogDescription>
                    Make changes to your profile here. Click save when you're
                    done.
                  </DialogDescription>
                </DialogHeader>
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <Input defaultValue="Jane Doe" />
                </Field>
                <DialogFooter>
                  <Button>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </VariantColumn>
          <VariantColumn label="alert dialog">
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="destructive" />}>
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction>Continue</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </VariantColumn>
          <VariantColumn label="sheet">
            <Sheet>
              <SheetTrigger render={<Button variant="outline" />}>
                Open sheet
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Settings</SheetTitle>
                  <SheetDescription>Configure preferences.</SheetDescription>
                </SheetHeader>
              </SheetContent>
            </Sheet>
          </VariantColumn>
          <VariantColumn label="popover">
            <Popover>
              <PopoverTrigger render={<Button variant="outline" />}>
                Open popover
              </PopoverTrigger>
              <PopoverContent className="w-60">
                <p className="text-sm">Popover content with anything inside.</p>
              </PopoverContent>
            </Popover>
          </VariantColumn>
          <VariantColumn label="tooltip">
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" />}>
                Hover me
              </TooltipTrigger>
              <TooltipContent>Helpful tip</TooltipContent>
            </Tooltip>
          </VariantColumn>
          <VariantColumn label="hover card">
            <HoverCard>
              <HoverCardTrigger render={<Button variant="link" />}>
                @username
              </HoverCardTrigger>
              <HoverCardContent className="w-60 text-sm">
                The React framework for the web.
              </HoverCardContent>
            </HoverCard>
          </VariantColumn>
          <VariantColumn label="dropdown">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                Menu <IconChevronDown className="ml-1" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <IconUser /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <IconBell /> Notifications
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <IconTrash /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Button group">
          <VariantColumn label="horizontal">
            <ButtonGroup>
              <Button variant="outline">
                <IconHeart />
              </Button>
              <Button variant="outline">
                <IconStar />
              </Button>
              <Button variant="outline">
                <IconBookmark />
              </Button>
            </ButtonGroup>
          </VariantColumn>
          <VariantColumn label="vertical">
            <ButtonGroup orientation="vertical">
              <Button variant="outline">Top</Button>
              <Button variant="outline">Mid</Button>
              <Button variant="outline">End</Button>
            </ButtonGroup>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Item">
          <VariantColumn label="default" className="min-w-[300px]">
            <Item className="w-[280px]">
              <ItemMedia variant="icon">
                <IconMail />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Inbox</ItemTitle>
                <ItemDescription>12 unread messages</ItemDescription>
              </ItemContent>
            </Item>
          </VariantColumn>
          <VariantColumn label="outline" className="min-w-[300px]">
            <Item variant="outline" className="w-[280px]">
              <ItemMedia variant="icon">
                <IconUser />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Account</ItemTitle>
                <ItemDescription>Manage profile</ItemDescription>
              </ItemContent>
            </Item>
          </VariantColumn>
          <VariantColumn label="muted" className="min-w-[300px]">
            <Item variant="muted" size="sm" className="w-[280px]">
              <ItemMedia variant="icon">
                <IconBell />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Notifications</ItemTitle>
              </ItemContent>
            </Item>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Empty">
          <VariantColumn label="default" className="min-w-[320px]">
            <Empty className="w-[300px]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconSearch />
                </EmptyMedia>
                <EmptyContent>
                  <EmptyTitle>No results</EmptyTitle>
                  <EmptyDescription>Try a different search.</EmptyDescription>
                </EmptyContent>
              </EmptyHeader>
            </Empty>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Skeleton / Spinner">
          <VariantColumn label="skeleton" className="min-w-[260px]">
            <Skeleton className="h-4 w-[220px]" />
            <Skeleton className="h-4 w-[180px]" />
            <Skeleton className="h-10 w-[220px]" />
          </VariantColumn>
          <VariantColumn label="spinner">
            <SizeRow label="sm">
              <Spinner className="size-3" />
            </SizeRow>
            <SizeRow label="default">
              <Spinner />
            </SizeRow>
            <SizeRow label="lg">
              <Spinner className="size-6" />
            </SizeRow>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Calendar">
          <VariantColumn label="default" className="min-w-[280px]">
            <Calendar
              mode="single"
              className="rounded-md shadow-(--custom-shadow)"
            />
          </VariantColumn>
          <VariantColumn label="range" className="min-w-[560px]">
            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={new Date()}
              selected={{
                from: new Date(),
                to: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
              }}
              className="rounded-md shadow-(--custom-shadow)"
            />
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Table">
          <VariantColumn label="default" className="min-w-[400px]">
            <Table className="w-[400px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Jane</TableCell>
                  <TableCell>jane@example.com</TableCell>
                  <TableCell>Admin</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>John</TableCell>
                  <TableCell>john@example.com</TableCell>
                  <TableCell>Member</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </VariantColumn>
          <VariantColumn
            label="with caption & footer"
            className="min-w-[400px]"
          >
            <Table className="w-[400px]">
              <TableCaption>Recent invoices for Q1.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>INV-001</TableCell>
                  <TableCell>Paid</TableCell>
                  <TableCell className="text-right">$250.00</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>INV-002</TableCell>
                  <TableCell>Pending</TableCell>
                  <TableCell className="text-right">$150.00</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>INV-003</TableCell>
                  <TableCell>Paid</TableCell>
                  <TableCell className="text-right">$320.00</TableCell>
                </TableRow>
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right">$720.00</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Scroll area / Aspect ratio / Separator">
          <VariantColumn label="scroll area" className="min-w-[260px]">
            <ScrollArea className="h-[120px] w-[220px] rounded-md shadow-(--custom-shadow) p-3 text-sm">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="py-1 text-muted-foreground">
                  Row {i + 1}
                </div>
              ))}
            </ScrollArea>
          </VariantColumn>
          <VariantColumn label="aspect ratio" className="min-w-[260px]">
            <div className="w-[220px]">
              <AspectRatio ratio={16 / 9} className="rounded-md bg-muted" />
            </div>
          </VariantColumn>
          <VariantColumn label="separator">
            <div className="flex w-[220px] flex-col gap-2 text-sm">
              <span>Above</span>
              <Separator />
              <span>Below</span>
            </div>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Kbd">
          <VariantColumn label="single">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </VariantColumn>
          <VariantColumn label="group">
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Field">
          <VariantColumn label="vertical" className="min-w-[260px]">
            <Field className="w-[240px]">
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" placeholder="you@example.com" />
              <FieldDescription>We'll never share your email.</FieldDescription>
            </Field>
          </VariantColumn>
          <VariantColumn label="horizontal" className="min-w-[260px]">
            <Field orientation="horizontal" className="w-[240px]">
              <Switch id="airplane" />
              <FieldLabel htmlFor="airplane">Airplane mode</FieldLabel>
            </Field>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Chart" description="Recharts wrapper">
          <VariantColumn label="bar chart" className="min-w-[420px]">
            <ChartContainer
              config={chartConfig}
              className="h-[200px] w-[400px]"
            >
              <BarChart accessibilityLayer data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                />
                <ChartTooltip
                  content={<ChartTooltipContent indicator="dot" />}
                />
                <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
                <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
              </BarChart>
            </ChartContainer>
          </VariantColumn>
          <VariantColumn label="line chart" className="min-w-[420px]">
            <ChartContainer
              config={chartConfig}
              className="h-[200px] w-[400px]"
            >
              <LineChart
                accessibilityLayer
                data={chartData}
                margin={{ left: 12, right: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                />
                <ChartTooltip
                  content={<ChartTooltipContent indicator="line" />}
                />
                <Line
                  dataKey="desktop"
                  type="monotone"
                  stroke="var(--color-desktop)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  dataKey="mobile"
                  type="monotone"
                  stroke="var(--color-mobile)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </VariantColumn>
          <VariantColumn label="pie chart" className="min-w-[260px]">
            <ChartContainer
              config={pieConfig}
              className="mx-auto aspect-square h-[220px]"
            >
              <PieChart>
                <ChartTooltip
                  content={<ChartTooltipContent nameKey="source" hideLabel />}
                />
                <Pie
                  data={pieData}
                  dataKey="visitors"
                  nameKey="source"
                  innerRadius={50}
                  strokeWidth={2}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.source} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Combobox" description="Filterable select">
          <VariantColumn label="default" className="min-w-[260px]">
            <Combobox items={fruitOptions as readonly string[]}>
              <ComboboxInput
                placeholder="Search fruit…"
                className="w-[220px]"
              />
              <ComboboxContent>
                <ComboboxList>
                  {(item: string) => (
                    <ComboboxItem key={item} value={item}>
                      {item}
                    </ComboboxItem>
                  )}
                </ComboboxList>
                <ComboboxEmpty>No fruit found.</ComboboxEmpty>
              </ComboboxContent>
            </Combobox>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Command" description="Inline command palette">
          <VariantColumn label="default" className="min-w-[300px]">
            <Command className="w-[280px] shadow-(--custom-shadow)">
              <CommandInput placeholder="Type a command…" />
              <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup heading="Suggestions">
                  <CommandItem>
                    <IconUser /> Profile
                    <CommandShortcut>⌘P</CommandShortcut>
                  </CommandItem>
                  <CommandItem>
                    <IconSettings /> Settings
                    <CommandShortcut>⌘,</CommandShortcut>
                  </CommandItem>
                  <CommandItem>
                    <IconBell /> Notifications
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Actions">
                  <CommandItem>
                    <IconLogout /> Sign out
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Context menu" description="Right-click target">
          <VariantColumn label="default" className="min-w-[260px]">
            <ContextMenu>
              <ContextMenuTrigger
                render={
                  <div className="flex h-[120px] w-[240px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                    Right-click me
                  </div>
                }
              />
              <ContextMenuContent>
                <ContextMenuItem>
                  <IconCopy /> Copy
                  <ContextMenuShortcut>⌘C</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem>
                  <IconScissors /> Cut
                  <ContextMenuShortcut>⌘X</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem>
                  <IconClipboard /> Paste
                  <ContextMenuShortcut>⌘V</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive">
                  <IconTrash /> Delete
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Drawer" description="Bottom sheet (vaul)">
          <VariantColumn label="default">
            <Drawer>
              <DrawerTrigger asChild>
                <Button variant="outline">Open drawer</Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Move goal</DrawerTitle>
                  <DrawerDescription>
                    Set your daily activity target.
                  </DrawerDescription>
                </DrawerHeader>
                <div className="px-4">
                  <Slider defaultValue={[60]} max={100} step={1} />
                </div>
                <DrawerFooter>
                  <Button>Save</Button>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Menubar" description="Application-style bar">
          <VariantColumn label="default" className="min-w-[320px]">
            <Menubar>
              <MenubarMenu>
                <MenubarTrigger>File</MenubarTrigger>
                <MenubarContent>
                  <MenubarItem>
                    New tab <MenubarShortcut>⌘T</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem>
                    New window <MenubarShortcut>⌘N</MenubarShortcut>
                  </MenubarItem>
                  <MenubarSeparator />
                  <MenubarItem>
                    Print… <MenubarShortcut>⌘P</MenubarShortcut>
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>
              <MenubarMenu>
                <MenubarTrigger>Edit</MenubarTrigger>
                <MenubarContent>
                  <MenubarItem>
                    Undo <MenubarShortcut>⌘Z</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem>
                    Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut>
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>
              <MenubarMenu>
                <MenubarTrigger>View</MenubarTrigger>
                <MenubarContent>
                  <MenubarItem>Reload</MenubarItem>
                  <MenubarItem>Toggle full screen</MenubarItem>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection
          name="Navigation menu"
          description="Top-level nav with content"
        >
          <VariantColumn label="default" className="min-w-[420px]">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger>Products</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="grid w-[320px] gap-2 p-2">
                      <NavigationMenuLink href="#">
                        <div>
                          <div className="text-sm font-medium">Analytics</div>
                          <div className="text-xs text-muted-foreground">
                            Realtime dashboards
                          </div>
                        </div>
                      </NavigationMenuLink>
                      <NavigationMenuLink href="#">
                        <div>
                          <div className="text-sm font-medium">Billing</div>
                          <div className="text-xs text-muted-foreground">
                            Invoices and plans
                          </div>
                        </div>
                      </NavigationMenuLink>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuTrigger>Resources</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="grid w-[260px] gap-2 p-2">
                      <NavigationMenuLink href="#">Docs</NavigationMenuLink>
                      <NavigationMenuLink href="#">Guides</NavigationMenuLink>
                      <NavigationMenuLink href="#">
                        Changelog
                      </NavigationMenuLink>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink href="#">Pricing</NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Carousel">
          <VariantColumn label="default" className="min-w-[260px]">
            <Carousel className="w-[200px]">
              <CarouselContent>
                {Array.from({ length: 4 }).map((_, i) => (
                  <CarouselItem key={i}>
                    <Card>
                      <CardContent className="flex aspect-square items-center justify-center text-3xl font-medium">
                        {i + 1}
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Resizable" description="Draggable panels">
          <VariantColumn label="horizontal" className="min-w-[340px]">
            <ResizablePanelGroup
              orientation="horizontal"
              className="h-[140px] w-[320px] rounded-md shadow-(--custom-shadow)"
            >
              <ResizablePanel defaultSize={40}>
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sidebar
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={60}>
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Content
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </VariantColumn>
        </ComponentSection>

        <ComponentSection name="Sonner" description="Toast notifications">
          <VariantColumn label="default">
            <Button
              variant="outline"
              onClick={() =>
                toast("Event scheduled", {
                  description: "Friday, Feb 9 at 2:00 PM",
                })
              }
            >
              Show toast
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.success("Profile updated")}
            >
              Success
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.error("Something went wrong")}
            >
              Error
            </Button>
          </VariantColumn>
        </ComponentSection>
      </div>
    </TooltipProvider>
  );
}
