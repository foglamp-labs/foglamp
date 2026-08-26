"use client";

import {
  type Icon,
  IconChefHatFilled,
  IconCherryFilled,
  IconCloudFilled,
  IconDropletFilled,
  IconFlameFilled,
  IconFlask2Filled,
  IconFlowerFilled,
  IconMeteorFilled,
  IconTriangleFilled,
} from "@tabler/icons-react";

import { getGoogleFavicon } from "@/lib/favicon";
import Image from "next/image";

// Placeholder icons used when a project has no favicon. One is picked
// deterministically from the project name, so the same project always shows
// the same icon while different projects get some visual variety.
const placeholderIcons: Icon[] = [
  IconCloudFilled,
  IconFlask2Filled,
  IconFlowerFilled,
  IconCherryFilled,
  IconMeteorFilled,
  IconFlameFilled,
  IconDropletFilled,
  IconChefHatFilled,
  IconTriangleFilled,
];

function placeholderIcon(name: string | null | undefined): Icon {
  const letter = name?.trim().charAt(0).toLowerCase() ?? "";
  const code = letter.charCodeAt(0);
  const index = Number.isNaN(code) ? 0 : code % placeholderIcons.length;
  return placeholderIcons[index];
}

// A project's favicon (from its URL) or a per-project placeholder icon, in a
// rounded box.
export function ProjectIcon({
  url,
  name,
  size = "md",
}: {
  url: string | null | undefined;
  name?: string | null | undefined;
  size?: "xs" | "sm" | "md";
}) {
  const box =
    size === "md"
      ? "size-5 rounded-lg corner-squircle shadow-(--custom-shadow)"
      : size === "sm"
        ? "size-5 rounded-lg corner-squircle"
        : "size-3.25 rounded-md corner-squircle";
  if (url) {
    return (
      <Image
        src={getGoogleFavicon(url)}
        alt=""
        width={1080}
        height={1080}
        className={`${box} bg-background object-cover`}
      />
    );
  }
  const PlaceholderIcon = placeholderIcon(name);
  return (
    <div
      className={`flex aspect-square items-center justify-center bg-primary/10 text-primary ${box}`}
    >
      <PlaceholderIcon
        className={
          size === "md" ? "size-4" : size === "sm" ? "size-3" : "size-2.5"
        }
      />
    </div>
  );
}
