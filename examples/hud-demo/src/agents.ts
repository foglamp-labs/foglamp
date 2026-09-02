export interface AgentMeta {
  id: string;
  name: string;
  provider: string;
  model: string;
  tools: string[];
  blurb: string;
}

// `tools` is each agent's full armory (shown on the card). A given run only fires
// a varied subset of them — see pickTools in server/run.ts.
export const AGENTS: AgentMeta[] = [
  {
    id: "support",
    name: "support-copilot",
    provider: "openai",
    model: "gpt-5.4-pro",
    tools: [
      "lookup_order",
      "check_inventory",
      "issue_refund",
      "apply_credit",
      "send_email",
      "notify_slack",
    ],
    blurb: "Resolves a refund and emails the customer.",
  },
  {
    id: "analyst",
    name: "data-analyst",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    tools: ["list_tables", "run_query", "pivot_table", "make_chart", "export_csv"],
    blurb: "Answers a question over the warehouse.",
  },
  {
    id: "reviewer",
    name: "code-reviewer",
    provider: "google",
    model: "gemini-3.1-pro",
    tools: [
      "list_files",
      "get_diff",
      "run_tests",
      "check_lint",
      "post_comment",
      "suggest_fix",
      "approve_pr",
    ],
    blurb: "Reviews a pull request and comments.",
  },
  {
    id: "researcher",
    name: "research-agent",
    provider: "openai",
    model: "gpt-5.4-mini",
    tools: ["search_web", "fetch_page", "extract_links", "summarize", "translate", "cite_sources"],
    blurb: "Researches a topic across the web.",
  },
  {
    id: "sql",
    name: "sql-bot",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    tools: ["list_tables", "describe_table", "run_query", "explain_plan", "optimize_query"],
    blurb: "Turns a question into SQL.",
  },
  {
    id: "triage",
    name: "triage-agent",
    provider: "google",
    model: "gemini-3.1-flash",
    tools: ["classify", "set_priority", "add_label", "assign_owner", "route", "notify_oncall"],
    blurb: "Triages tickets — occasionally flaky.",
  },
];
