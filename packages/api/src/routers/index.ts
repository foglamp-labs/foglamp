import { publicProcedure, router } from "../index";
import { agentsRouter } from "./agents";
import { alertsRouter } from "./alerts";
import { customersRouter } from "./customers";
import { evalsRouter } from "./evals";
import { instrumentationPlansRouter } from "./instrumentationPlans";
import { metricsRouter } from "./metrics";
import { notificationsRouter } from "./notifications";
import { orgsRouter } from "./orgs";
import { platformRouter } from "./platform";
import { providerKeysRouter } from "./providerKeys";
import { pricingRouter } from "./pricing";
import { projectsRouter } from "./projects";
import { sessionsRouter } from "./sessions";
import { testEmailsRouter } from "./testEmails";
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
  customers: customersRouter,
  sessions: sessionsRouter,
  metrics: metricsRouter,
  alerts: alertsRouter,
  evals: evalsRouter,
  instrumentationPlans: instrumentationPlansRouter,
  orgs: orgsRouter,
  notifications: notificationsRouter,
  providerKeys: providerKeysRouter,
  pricing: pricingRouter,
  platform: platformRouter,
  testEmails: testEmailsRouter,
});
export type AppRouter = typeof appRouter;
