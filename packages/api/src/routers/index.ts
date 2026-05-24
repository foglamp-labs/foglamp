import { publicProcedure, router } from "../index";
import { agentsRouter } from "./agents";
import { alertsRouter } from "./alerts";
import { metricsRouter } from "./metrics";
import { pricingRouter } from "./pricing";
import { projectsRouter } from "./projects";
import { tracesRouter } from "./traces";
import { workflowRunsRouter } from "./workflowRuns";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  projects: projectsRouter,
  traces: tracesRouter,
  workflowRuns: workflowRunsRouter,
  agents: agentsRouter,
  metrics: metricsRouter,
  alerts: alertsRouter,
  pricing: pricingRouter,
});
export type AppRouter = typeof appRouter;
