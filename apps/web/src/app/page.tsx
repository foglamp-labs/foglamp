"use client";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";
import Header from "@/components/header";
import { Item } from "@watchtower/ui/components/item";
import { Card, CardContent } from "@watchtower/ui/components/card";

export default function Home() {
  const healthCheck = useQuery(trpc.healthCheck.queryOptions());

  return (
    <div className="px-8">
      <Header />
      <div className="flex flex-col max-w-3xl mx-auto">
        <p className="overflow-x-auto font-medium mt-48">Boilerplate</p>
        <p className="text-muted-foreground text-sm mt-1.5">
          This is a boilerplate project to speed up development.
        </p>
        <div className="grid gap-6 mt-5">
          <Card size="sm">
            <CardContent className="group-data-[size=sm]/card:px-4.5">
              <h2 className="mb-2 font-medium">API Status</h2>
              <div className="flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${
                    healthCheck.data ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span className="text-sm text-muted-foreground">
                  {healthCheck.isLoading
                    ? "Checking..."
                    : healthCheck.data
                    ? "Connected"
                    : "Disconnected"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
