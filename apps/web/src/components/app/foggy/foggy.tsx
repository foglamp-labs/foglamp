"use client";

import { useProject } from "@/components/app/project-context";

import { FoggyWidget } from "./foggy-widget";

// Foggy only makes sense scoped to a project. Hide the launcher entirely when
// none is selected; key the widget by projectId so switching projects resets
// the conversation and its transport.
export function Foggy() {
  const { projectId } = useProject();
  if (!projectId) return null;
  return <FoggyWidget key={projectId} projectId={projectId} />;
}
