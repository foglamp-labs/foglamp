import { publicProcedure, router } from "../index";
import { adminRouter } from "./admin";
import { agentsRouter } from "./agents";
import { alertsRouter } from "./alerts";
import { evalsRouter } from "./evals";
import { metricsRouter } from "./metrics";
import { orgsRouter } from "./orgs";
import { providerKeysRouter } from "./providerKeys";
import { pricingRouter } from "./pricing";
import { projectsRouter } from "./projects";
import { sessionsRouter } from "./sessions";
import { tracesRouter } from "./traces";
import { workflowRunsRouter } from "./workflowRuns";
import { workflowsRouter } from "./workflows";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  projects: projectsRouter,
  traces: tracesRouter,
  workflows: workflowsRouter,
  workflowRuns: workflowRunsRouter,
  agents: agentsRouter,
  sessions: sessionsRouter,
  metrics: metricsRouter,
  alerts: alertsRouter,
  evals: evalsRouter,
  orgs: orgsRouter,
  providerKeys: providerKeysRouter,
  pricing: pricingRouter,
  admin: adminRouter,
});
export type AppRouter = typeof appRouter;
