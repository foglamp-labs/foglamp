"use client";

import * as React from "react";
import {
  IconCash,
  IconCoffee,
  IconCreditCard,
  IconHome,
  IconPlus,
  IconShoppingCart,
  IconTrendingUp,
  IconX,
} from "@tabler/icons-react";

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
  Field,
  FieldDescription,
  FieldLabel,
} from "@watchtower/ui/components/field";
import { Input } from "@watchtower/ui/components/input";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@watchtower/ui/components/item";
import { Progress } from "@watchtower/ui/components/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@watchtower/ui/components/select";
import { Separator } from "@watchtower/ui/components/separator";
import { Slider } from "@watchtower/ui/components/slider";
import { Textarea } from "@watchtower/ui/components/textarea";

const months = [
  { label: "Dec", value: 60 },
  { label: "Jan", value: 95 },
  { label: "Feb", value: 70 },
  { label: "Mar", value: 110 },
  { label: "Apr", value: 50 },
  { label: "May", value: 130 },
];

const transactions = [
  {
    name: "Blue Bottle Coffee",
    category: "Food & Drink",
    amount: -6.5,
    icon: IconCoffee,
  },
  {
    name: "Whole Foods",
    category: "Groceries",
    amount: -82.41,
    icon: IconShoppingCart,
  },
  { name: "Direct deposit", category: "Income", amount: 2400, icon: IconCash },
  { name: "Mortgage", category: "Housing", amount: -1850, icon: IconHome },
];

export function ExamplesShowcase() {
  const [threshold, setThreshold] = React.useState<number[]>([2500]);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Contribution History</CardTitle>
            <CardDescription>Last 6 months of activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-[160px] items-end gap-3">
              {months.map((m) => (
                <div
                  key={m.label}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <div
                    className="w-full rounded-md bg-primary"
                    style={{ height: `${m.value}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-3">
              {months.map((m) => (
                <div
                  key={m.label}
                  className="flex-1 text-center text-xs text-muted-foreground"
                >
                  {m.label}
                </div>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted shadow-(--custom-shadow) p-3">
                <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  Upcoming
                </div>
                <div className="mt-1 font-medium">May 25, 2024</div>
                <div className="text-xs text-muted-foreground">
                  $1,000 scheduled
                </div>
              </div>
              <div className="rounded-lg bg-muted shadow-(--custom-shadow) p-3">
                <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  Auto-save plan
                </div>
                <div className="mt-1 font-medium">Accelerated</div>
                <div className="text-xs text-muted-foreground">
                  Recurring weekly
                </div>
              </div>
            </div>
            <Button className="mt-6 w-full">View Full Report</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Payout Threshold</CardTitle>
                <CardDescription>
                  Set the minimum balance required before a payout is triggered.
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon-sm">
                <IconX />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <Field>
              <FieldLabel>Preferred Currency</FieldLabel>
              <Select defaultValue="usd">
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usd">
                    USD — United States Dollar
                  </SelectItem>
                  <SelectItem value="eur">EUR — Euro</SelectItem>
                  <SelectItem value="gbp">GBP — Pound Sterling</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel>Minimum Payout Amount</FieldLabel>
                <span className="font-heading text-xl font-medium tabular-nums">
                  ${threshold[0]?.toFixed(2)}
                </span>
              </div>
              <Slider
                value={threshold}
                onValueChange={(v) => setThreshold(Array.isArray(v) ? v : [v])}
                min={50}
                max={10000}
                step={50}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>$50 (MIN)</span>
                <span>$10,000 (MAX)</span>
              </div>
            </Field>
            <Field>
              <FieldLabel>Notes</FieldLabel>
              <Textarea placeholder="Add any notes for this payout configuration…" />
            </Field>
            <Button>Save Threshold</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Savings Targets</CardTitle>
                <CardDescription>Active milestones for 2024</CardDescription>
              </div>
              <Button variant="outline" size="sm">
                New Goal
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-lg shadow-(--custom-shadow) bg-muted/60 p-4">
              <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                Retirement
              </div>
              <div className="mt-1 font-heading text-3xl font-medium tabular-nums">
                $420,000
              </div>
              <Progress value={65} className="mt-3" />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>65% achieved</span>
                <span>$273,000</span>
              </div>
            </div>
            <div className="rounded-lg shadow-(--custom-shadow) bg-muted/60 p-4">
              <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                Real estate
              </div>
              <div className="mt-1 font-heading text-3xl font-medium tabular-nums">
                $85,000
              </div>
              <Progress value={32} className="mt-3" />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>32% achieved</span>
                <span>$27,200</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              You have not met your targets for this year.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Recent Transactions</CardTitle>
                <CardDescription>Your latest account activity.</CardDescription>
              </div>
              <Badge variant="secondary">Live</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {transactions.map((t) => {
              const Icon = t.icon;
              const positive = t.amount > 0;
              return (
                <Item key={t.name} variant="muted">
                  <ItemMedia variant="icon">
                    <Icon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t.name}</ItemTitle>
                    <ItemDescription>{t.category}</ItemDescription>
                  </ItemContent>
                  <span
                    className={`font-medium tabular-nums ${
                      positive ? "text-green-600" : "text-foreground"
                    }`}
                  >
                    {positive ? "+" : ""}${Math.abs(t.amount).toFixed(2)}
                  </span>
                </Item>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common things you can do now.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button variant="outline" className="w-full justify-start">
              <IconPlus /> Add new account
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <IconCreditCard /> Manage cards
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <IconTrendingUp /> View insights
            </Button>
            <Separator className="my-1" />
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="text-sm font-medium">Jane Doe</div>
                <div className="text-xs text-muted-foreground">
                  jane@example.com
                </div>
              </div>
              <Button size="sm" variant="ghost">
                Profile
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Get in touch</CardTitle>
            <CardDescription>
              We'll respond within one business day.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ex-name">Name</FieldLabel>
                <Input id="ex-name" placeholder="Your full name" />
              </Field>
              <Field>
                <FieldLabel htmlFor="ex-email">Email</FieldLabel>
                <Input
                  id="ex-email"
                  type="email"
                  placeholder="you@example.com"
                />
                <FieldDescription>
                  We'll never share your email.
                </FieldDescription>
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="ex-msg">Message</FieldLabel>
                <Textarea
                  id="ex-msg"
                  placeholder="Tell us what you're working on…"
                  rows={4}
                />
              </Field>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="ghost">Cancel</Button>
              <Button>Send message</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
