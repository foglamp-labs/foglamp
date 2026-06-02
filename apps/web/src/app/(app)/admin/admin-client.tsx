"use client";

import { Button } from "@foglamp/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@foglamp/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@foglamp/ui/components/dialog";
import { Field, FieldLabel } from "@foglamp/ui/components/field";
import { Input } from "@foglamp/ui/components/input";
import { ScrollArea } from "@foglamp/ui/components/scroll-area";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@foglamp/ui/components/table";
import {
	IconBellCheck,
	IconBellRingingFilled,
	IconDatabase,
	IconDatabaseImport,
	type IconFlask,
	IconGaugeFilled,
	IconGhost,
	IconMailFilled,
	IconRefresh,
	IconSend2,
	IconSparkles,
	IconTimeline,
	IconTool,
	IconUserPlus,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
	NoProject,
	PageHeader,
	TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { ModelLogo } from "@/components/model-logo";
import { trpc } from "@/utils/trpc";

const isDev = process.env.NODE_ENV !== "production";

type Kind = "bare" | "agent" | "workflow" | "tool" | "full" | "mega";

const TESTS: {
	kind: Kind;
	label: string;
	description: string;
	icon: typeof IconFlask;
}[] = [
	{
		kind: "bare",
		label: "Named call",
		description:
			"A one-off call named via traceName (no agent) — a single LLM step.",
		icon: IconSparkles,
	},
	{
		kind: "agent",
		label: "Agent (RAG)",
		description:
			"A named agent: retrieval embedding → 2 LLM steps with a tool.",
		icon: IconGhost,
	},
	{
		kind: "workflow",
		label: "Workflow run",
		description:
			"One run grouping 3 agents (one errors) + 2 named one-off traces.",
		icon: IconTimeline,
	},
	{
		kind: "tool",
		label: "Tool-heavy agent",
		description: "An agentic loop: an embedding + 6 tool calls across 3 steps.",
		icon: IconTool,
	},
	{
		kind: "full",
		label: "Full dataset",
		description:
			"~42 traces over 60 min — agents, one-offs, tool loops, embeddings, errors, multiple runs.",
		icon: IconDatabase,
	},
	{
		kind: "mega",
		label: "Mega dataset",
		description:
			"400+ traces over 2 weeks — long multi-turn conversations, many workflow runs/sessions, tool loops, embeddings, evals, and errors.",
		icon: IconDatabaseImport,
	},
];

type EmailKind =
	| "magic-link"
	| "invitation"
	| "quota-warning"
	| "alert-fired"
	| "alert-resolved";

const EMAILS: {
	kind: EmailKind;
	label: string;
	description: string;
	icon: typeof IconFlask;
}[] = [
	{
		kind: "magic-link",
		label: "Magic link",
		description: "The sign-in link sent when logging in by email.",
		icon: IconMailFilled,
	},
	{
		kind: "invitation",
		label: "Org invitation",
		description: "Sent when a teammate is invited to an organization.",
		icon: IconUserPlus,
	},
	{
		kind: "quota-warning",
		label: "Quota warning",
		description: "Sent when an org passes 90% of its monthly span quota.",
		icon: IconGaugeFilled,
	},
	{
		kind: "alert-fired",
		label: "Alert firing",
		description: "Sent when an alert rule starts firing.",
		icon: IconBellRingingFilled,
	},
	{
		kind: "alert-resolved",
		label: "Alert resolved",
		description: "Sent when a firing alert recovers.",
		icon: IconBellCheck,
	},
];

// Per-token Decimal string → "$/1M tokens"; null prices show as an em dash.
function per1M(p: string | null): string {
	if (p == null) return "—";
	const v = Number(p) * 1_000_000;
	if (!Number.isFinite(v)) return "—";
	return `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`;
}

function perReq(p: string | null): string {
	if (p == null || Number(p) === 0) return "—";
	return `$${Number(p).toFixed(4)}`;
}

export function AdminClient() {
	const { projectId } = useProject();
	const qc = useQueryClient();
	const [filter, setFilter] = useState("");
	const [running, setRunning] = useState<Kind | null>(null);
	// The email currently queued for the "send to…" dialog, plus the recipient.
	const [emailTarget, setEmailTarget] = useState<EmailKind | null>(null);
	const [recipient, setRecipient] = useState("");

	const pricing = useQuery({
		...trpc.admin.pricing.queryOptions(),
		staleTime: 60_000,
	});

	const ingestTest = useMutation(
		trpc.admin.ingestTest.mutationOptions({
			onMutate: (vars) => setRunning(vars.kind),
			onSuccess: (res) => {
				// Refresh every dashboard query so the new spans show up immediately.
				void qc.invalidateQueries();
				toast.success(
					`Inserted ${res.spans} spans across ${res.traces} trace${res.traces === 1 ? "" : "s"} (${res.kind}).`,
				);
			},
			onError: (e) => toast.error(e.message),
			onSettled: () => setRunning(null),
		}),
	);

	const sendEmail = useMutation(
		trpc.admin.sendTestEmail.mutationOptions({
			onSuccess: (res) => {
				setEmailTarget(null);
				if (res.delivered) {
					toast.success(`Sent ${res.kind} email to ${res.to}.`);
				} else {
					toast.warning(
						"Email skipped — no RESEND_API_KEY set. The send was logged server-side.",
					);
				}
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	const activeEmail = EMAILS.find((e) => e.kind === emailTarget);

	const models = useMemo(() => {
		const all = pricing.data?.models ?? [];
		const q = filter.trim().toLowerCase();
		return q ? all.filter((m) => m.id.toLowerCase().includes(q)) : all;
	}, [pricing.data, filter]);

	if (!isDev) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Admin tools</CardTitle>
					<CardDescription>
						These developer tools are only available in development builds.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<>
			<PageHeader
				title="Admin"
				description="Synthetic ingestion and the live pricing table."
			/>

			<div>
				<CardHeader className="px-0 mb-4">
					<CardTitle>Generate test data</CardTitle>
				</CardHeader>
				{!projectId ? (
					<NoProject />
				) : (
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{TESTS.map((t) => (
							<div
								key={t.kind}
								className="flex flex-col gap-3 rounded-lg border border-border/50 p-4 bg-card"
							>
								<div className="flex items-center gap-2">
									<t.icon className="size-4 text-muted-foreground" />
									<span className="text-sm font-medium">{t.label}</span>
								</div>
								<p className="flex-1 text-xs text-muted-foreground">
									{t.description}
								</p>
								<Button
									size="sm"
									variant="secondary"
									disabled={ingestTest.isPending}
									onClick={() => ingestTest.mutate({ projectId, kind: t.kind })}
								>
									{running === t.kind ? "Running…" : "Run"}
								</Button>
							</div>
						))}
					</div>
				)}
			</div>

			<div className="mt-8">
				<CardHeader className="px-0 mb-4">
					<CardTitle>Test emails</CardTitle>
					<CardDescription>
						Send any of the platform's transactional emails, populated with
						mocked data, to an address you choose.
					</CardDescription>
				</CardHeader>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{EMAILS.map((e) => (
						<div
							key={e.kind}
							className="flex flex-col gap-3 rounded-lg border border-border/50 p-4 bg-card"
						>
							<div className="flex items-center gap-2">
								<e.icon className="size-4 text-muted-foreground" />
								<span className="text-sm font-medium">{e.label}</span>
							</div>
							<p className="flex-1 text-xs text-muted-foreground">
								{e.description}
							</p>
							<Button
								size="sm"
								variant="secondary"
								disabled={sendEmail.isPending}
								onClick={() => {
									setEmailTarget(e.kind);
									setRecipient("");
								}}
							>
								Send…
							</Button>
						</div>
					))}
				</div>
			</div>

			<div className="mt-8">
				<CardHeader className="flex flex-row items-center justify-between gap-4 px-0">
					<div className="flex flex-col gap-1">
						<CardTitle>Models &amp; pricing</CardTitle>
						<CardDescription>
							OpenRouter pricing currently cached in the server (per 1M tokens;
							request priced per call). {pricing.data?.count ?? 0} models.
						</CardDescription>
					</div>
					<Button
						size="icon-sm"
						variant="ghost"
						disabled={pricing.isFetching}
						onClick={() =>
							qc.invalidateQueries({ queryKey: trpc.admin.pricing.queryKey() })
						}
					>
						<IconRefresh />
					</Button>
				</CardHeader>
				<Input
					placeholder="Filter models… (e.g. gpt-4o, claude, gemini)"
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					className="max-w-sm mt-4 mb-4"
				/>
				{pricing.isLoading ? (
					<TableSkeleton />
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Model</TableHead>
								<TableHead className="text-right">Input</TableHead>
								<TableHead className="text-right">Output</TableHead>
								<TableHead className="text-right">Cache read</TableHead>
								<TableHead className="text-right">Cache write</TableHead>
								<TableHead className="text-right">Reasoning</TableHead>
								<TableHead className="text-right">Request</TableHead>
								<TableHead className="text-right">Image</TableHead>
								<TableHead className="text-right">Web search</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{models.map((m) => (
								<TableRow key={m.id}>
									<TableCell className="font-medium">
										<span className="flex items-center gap-2">
											<ModelLogo modelId={m.id} className="size-4 shrink-0" />
											<span className="font-mono text-xs">{m.id}</span>
										</span>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{per1M(m.prompt)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{per1M(m.completion)}
									</TableCell>
									<TableCell className="text-right tabular-nums text-muted-foreground">
										{per1M(m.cacheRead)}
									</TableCell>
									<TableCell className="text-right tabular-nums text-muted-foreground">
										{per1M(m.cacheWrite)}
									</TableCell>
									<TableCell className="text-right tabular-nums text-muted-foreground">
										{per1M(m.internalReasoning)}
									</TableCell>
									<TableCell className="text-right tabular-nums text-muted-foreground">
										{perReq(m.request)}
									</TableCell>
									<TableCell className="text-right tabular-nums text-muted-foreground">
										{perReq(m.image)}
									</TableCell>
									<TableCell className="text-right tabular-nums text-muted-foreground">
										{perReq(m.webSearch)}
									</TableCell>
								</TableRow>
							))}
							{models.length === 0 && (
								<TableRow>
									<TableCell
										colSpan={9}
										className="text-center text-sm text-muted-foreground"
									>
										{pricing.data?.count
											? "No models match your filter."
											: "No pricing loaded. Set OPENROUTER_MODELS_URL or a pricing file."}
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				)}
			</div>

			<Dialog
				open={emailTarget !== null}
				onOpenChange={(o) => !o && setEmailTarget(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Send {activeEmail?.label} email</DialogTitle>
						<DialogDescription>
							{activeEmail?.description} It will be sent with mocked data.
						</DialogDescription>
					</DialogHeader>
					<form
						onSubmit={(ev) => {
							ev.preventDefault();
							const to = recipient.trim();
							if (!to || !emailTarget) return;
							sendEmail.mutate({ kind: emailTarget, to });
						}}
					>
						<Field>
							<FieldLabel htmlFor="test-email-recipient">Send to</FieldLabel>
							<Input
								id="test-email-recipient"
								type="email"
								placeholder="you@example.com"
								value={recipient}
								onChange={(ev) => setRecipient(ev.target.value)}
								autoComplete="off"
								autoFocus
							/>
						</Field>
						<DialogFooter className="mt-4">
							<Button
								type="submit"
								disabled={!recipient.trim() || sendEmail.isPending}
							>
								<IconSend2 className="size-4" />
								{sendEmail.isPending ? "Sending…" : "Send email"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
