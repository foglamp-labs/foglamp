"use client";

import * as React from "react";
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconBell,
  IconBuilding,
  IconChartBar,
  IconChevronDown,
  IconCreditCard,
  IconDotsVertical,
  IconFileInvoice,
  IconHome,
  IconLogout,
  IconPalette,
  IconPlus,
  IconSearch,
  IconSettings,
  IconUserCircle,
  IconUsers,
  IconWallet,
} from "@tabler/icons-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Avatar, AvatarFallback } from "@watchtower/ui/components/avatar";
import { Badge } from "@watchtower/ui/components/badge";
import { Button } from "@watchtower/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@watchtower/ui/components/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@watchtower/ui/components/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@watchtower/ui/components/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@watchtower/ui/components/input-group";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@watchtower/ui/components/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@watchtower/ui/components/table";

type Org = { id: string; name: string; plan: string };

const orgs: Org[] = [
  { id: "acme", name: "Acme Inc.", plan: "Pro" },
  { id: "globex", name: "Globex", plan: "Business" },
  { id: "initech", name: "Initech", plan: "Free" },
];

const stats = [
  { label: "Revenue", value: "$48,294", change: "+12.4%", trend: "up" },
  { label: "Active customers", value: "2,841", change: "+5.2%", trend: "up" },
  {
    label: "Avg. order value",
    value: "$184.20",
    change: "-1.8%",
    trend: "down",
  },
  { label: "Conversion rate", value: "3.42%", change: "+0.6%", trend: "up" },
] as const;

const chartData = [
  { month: "Jan", current: 18400, previous: 12100 },
  { month: "Feb", current: 22150, previous: 15400 },
  { month: "Mar", current: 19800, previous: 17200 },
  { month: "Apr", current: 28100, previous: 19500 },
  { month: "May", current: 32400, previous: 22300 },
  { month: "Jun", current: 36200, previous: 26800 },
  { month: "Jul", current: 41800, previous: 28100 },
  { month: "Aug", current: 39600, previous: 31200 },
  { month: "Sep", current: 45200, previous: 33400 },
  { month: "Oct", current: 48294, previous: 36200 },
];

const chartConfig = {
  current: { label: "This year", color: "var(--chart-1)" },
  previous: { label: "Last year", color: "var(--chart-3)" },
} satisfies ChartConfig;

type TxnStatus = "Paid" | "Pending" | "Refunded";
const transactions: ReadonlyArray<{
  id: string;
  customer: string;
  email: string;
  amount: string;
  status: TxnStatus;
  date: string;
}> = [
  {
    id: "TXN-7283",
    customer: "Olivia Rhye",
    email: "olivia@untitledui.com",
    amount: "$1,840.00",
    status: "Paid",
    date: "Oct 28",
  },
  {
    id: "TXN-7282",
    customer: "Phoenix Baker",
    email: "phoenix@untitledui.com",
    amount: "$420.50",
    status: "Pending",
    date: "Oct 27",
  },
  {
    id: "TXN-7281",
    customer: "Lana Steiner",
    email: "lana@untitledui.com",
    amount: "$2,310.00",
    status: "Paid",
    date: "Oct 27",
  },
  {
    id: "TXN-7280",
    customer: "Demi Wilkinson",
    email: "demi@untitledui.com",
    amount: "$760.00",
    status: "Refunded",
    date: "Oct 26",
  },
  {
    id: "TXN-7279",
    customer: "Candice Wu",
    email: "candice@untitledui.com",
    amount: "$1,210.50",
    status: "Paid",
    date: "Oct 26",
  },
];

const navMain = [
  { label: "Overview", icon: IconHome, active: true, badge: undefined },
  { label: "Analytics", icon: IconChartBar, active: false, badge: undefined },
  { label: "Customers", icon: IconUsers, active: false, badge: "12" },
  { label: "Invoices", icon: IconFileInvoice, active: false, badge: undefined },
  { label: "Wallet", icon: IconWallet, active: false, badge: undefined },
] as const;

const navSecondary = [
  { label: "Settings", icon: IconSettings, badge: undefined },
  { label: "Notifications", icon: IconBell, badge: "3" },
] as const;

const statusVariant: Record<TxnStatus, "emerald" | "amber" | "rose"> = {
  Paid: "emerald",
  Pending: "amber",
  Refunded: "rose",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function DashboardShowcase() {
  const [activeOrg, setActiveOrg] = React.useState(orgs[0]);

  return (
    <SidebarProvider className="h-svh min-h-0">
      <Sidebar variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                  <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary/10 text-primary shadow-(--custom-shadow)">
                    <IconBuilding className="size-4" />
                  </div>
                  <div className="flex flex-1 flex-col text-left text-sm leading-tight ml-0.5">
                    <span className="truncate font-medium">
                      {activeOrg.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {activeOrg.plan} plan
                    </span>
                  </div>
                  <IconChevronDown className="ml-auto size-4 opacity-30" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={8}
                  className="min-w-(--anchor-width)"
                >
                  <DropdownMenuLabel>Switch organization</DropdownMenuLabel>
                  {orgs.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      onClick={() => setActiveOrg(org)}
                    >
                      <IconBuilding />
                      <div className="flex flex-1 flex-col">
                        <span>{org.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {org.plan} plan
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <IconPlus />
                    Create organization
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navMain.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton isActive={item.active}>
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.badge != null && (
                      <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Account</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navSecondary.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton>
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.badge != null && (
                      <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                  <Avatar size="sm">
                    <AvatarFallback>OR</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-1 flex-col text-left text-sm leading-tight">
                    <span className="truncate font-medium">Olivia Rhye</span>
                    <span className="truncate text-xs text-muted-foreground">
                      olivia@untitledui.com
                    </span>
                  </div>
                  <IconDotsVertical className="ml-auto size-4 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  side="top"
                  sideOffset={8}
                  className="min-w-(--anchor-width)"
                >
                  <DropdownMenuLabel>My account</DropdownMenuLabel>
                  <DropdownMenuItem>
                    <IconUserCircle />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <IconCreditCard />
                    Billing
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <IconPalette />
                    Appearance
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive">
                    <IconLogout />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-0 overflow-hidden">
        <main className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label}>
                <CardHeader>
                  <CardDescription>{stat.label}</CardDescription>
                  <CardTitle className="text-2xl tracking-tight tabular-nums">
                    {stat.value}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-2">
                  <Badge variant={stat.trend === "up" ? "emerald" : "rose"}>
                    {stat.change}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    vs. last month
                  </span>
                </CardContent>
              </Card>
            ))}
          </section>
          <CardTitle>Revenue</CardTitle>
          Monthly revenue compared to the same period last year.
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[280px] w-full"
          >
            <BarChart
              data={chartData}
              margin={{ left: 0, right: 0, top: 8, bottom: 0 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dot" />}
              />
              <Bar dataKey="previous" fill="var(--color-previous)" radius={4} />
              <Bar dataKey="current" fill="var(--color-current)" radius={4} />
            </BarChart>
          </ChartContainer>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle>Recent transactions</CardTitle>
              <CardDescription>
                Last 5 transactions across all stores.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm">
              View all
            </Button>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar size="sm">
                        <AvatarFallback>
                          {initials(txn.customer)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col leading-tight">
                        <span className="font-medium">{txn.customer}</span>
                        <span className="text-xs text-muted-foreground">
                          {txn.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {txn.id}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {txn.date}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[txn.status]}>
                      {txn.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {txn.amount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
