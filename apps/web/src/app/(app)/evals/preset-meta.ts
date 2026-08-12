import {
	type Icon,
	IconAdjustments,
	IconAdjustmentsFilled,
	IconArrowAutofitWidth,
	IconArrowAutofitWidthFilled,
	IconBiohazard,
	IconBiohazardFilled,
	IconBolt,
	IconBoltFilled,
	IconBook,
	IconBookFilled,
	IconCircleCheck,
	IconCircleCheckFilled,
	IconClipboardCheck,
	IconClipboardCheckFilled,
	IconCurrentLocation,
	IconCurrentLocationFilled,
	IconFileCode,
	IconFileCodeFilled,
	IconFileText,
	IconFileTextFilled,
	IconFilter,
	IconFilterFilled,
	IconForbid,
	IconForbidFilled,
	IconHeart,
	IconHeartFilled,
	IconKey,
	IconKeyFilled,
	IconListCheck,
	IconListCheckFilled,
	IconMoodSmile,
	IconMoodSmileFilled,
	IconPuzzle,
	IconPuzzleFilled,
	IconRosetteDiscountCheck,
	IconRosetteDiscountCheckFilled,
	IconSearch,
	IconSearchFilled,
	IconShieldLock,
	IconShieldLockFilled,
	IconSparkles,
	IconSparklesFilled,
	IconZoom,
	IconZoomFilled,
} from "@tabler/icons-react";

// Checks are grouped into families that share a color, so related checks (e.g.
// Valid JSON / Non-empty) read as siblings at a glance.
export type Family =
	| "safety"
	| "format"
	| "match"
	| "quality"
	| "grounding"
	| "tool";

// Colored icon chips for the check cards, in the same vein as the sidebar nav:
// a tinted square with a filled icon and a matching inset/drop shadow.
export const FAMILY_CHIP: Record<Family, string> = {
	safety:
		"bg-rose-100 dark:bg-rose-950 text-rose-500 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.14),0_2px_6px_-2px_rgba(244,63,94,0.25)] dark:shadow-(--custom-shadow)",
	format:
		"bg-sky-100 dark:bg-sky-950 text-sky-500 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.14),0_2px_6px_-2px_rgba(14,165,233,0.25)] dark:shadow-(--custom-shadow)",
	match:
		"bg-violet-100 dark:bg-violet-950 text-violet-500 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.14),0_2px_6px_-2px_rgba(139,92,246,0.25)] dark:shadow-(--custom-shadow)",
	quality:
		"bg-fuchsia-100 dark:bg-fuchsia-950 text-fuchsia-500 shadow-[inset_0_0_0_1px_rgba(217,70,239,0.14),0_2px_6px_-2px_rgba(217,70,239,0.25)] dark:shadow-(--custom-shadow)",
	grounding:
		"bg-emerald-100 dark:bg-emerald-950 text-emerald-500 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.14),0_2px_6px_-2px_rgba(16,185,129,0.25)] dark:shadow-(--custom-shadow)",
	tool: "bg-amber-100 dark:bg-amber-950 text-amber-500 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.14),0_2px_6px_-2px_rgba(245,158,11,0.25)] dark:shadow-(--custom-shadow)",
};

// Filled icon + color family per preset id (stable). Anything new falls back to
// a generic sparkle in the "quality" color.
export const PRESET_META: Record<
	string,
	{ icon: Icon; outline: Icon; family: Family }
> = {
	// Safety / privacy
	pii: {
		icon: IconShieldLockFilled,
		outline: IconShieldLock,
		family: "safety",
	},
	secret_leak: { icon: IconKeyFilled, outline: IconKey, family: "safety" },
	toxicity: {
		icon: IconBiohazardFilled,
		outline: IconBiohazard,
		family: "safety",
	},
	// Format / structure
	valid_json: {
		icon: IconFileCodeFilled,
		outline: IconFileCode,
		family: "format",
	},
	not_empty: {
		icon: IconFileTextFilled,
		outline: IconFileText,
		family: "format",
	},
	max_length: {
		icon: IconArrowAutofitWidthFilled,
		outline: IconArrowAutofitWidth,
		family: "format",
	},
	tool_args_valid: {
		icon: IconClipboardCheckFilled,
		outline: IconClipboardCheck,
		family: "format",
	},
	// Content match
	contains: { icon: IconSearchFilled, outline: IconSearch, family: "match" },
	not_contains: {
		icon: IconForbidFilled,
		outline: IconForbid,
		family: "match",
	},
	regex_match: { icon: IconFilterFilled, outline: IconFilter, family: "match" },
	// Quality judges
	relevance: {
		icon: IconCurrentLocationFilled,
		outline: IconCurrentLocation,
		family: "quality",
	},
	helpfulness: { icon: IconHeartFilled, outline: IconHeart, family: "quality" },
	coherence: {
		icon: IconAdjustmentsFilled,
		outline: IconAdjustments,
		family: "quality",
	},
	conciseness: { icon: IconBoltFilled, outline: IconBolt, family: "quality" },
	instruction_following: {
		icon: IconListCheckFilled,
		outline: IconListCheck,
		family: "quality",
	},
	completeness: {
		icon: IconRosetteDiscountCheckFilled,
		outline: IconRosetteDiscountCheck,
		family: "quality",
	},
	no_refusal: {
		icon: IconMoodSmileFilled,
		outline: IconMoodSmile,
		family: "quality",
	},
	// Grounding / RAG
	faithfulness: {
		icon: IconBookFilled,
		outline: IconBook,
		family: "grounding",
	},
	context_relevance: {
		icon: IconZoomFilled,
		outline: IconZoom,
		family: "grounding",
	},
	correctness: {
		icon: IconCircleCheckFilled,
		outline: IconCircleCheck,
		family: "grounding",
	},
	// Tool
	tool_selection: {
		icon: IconPuzzleFilled,
		outline: IconPuzzle,
		family: "tool",
	},
};

export const presetMeta = (
	id: string,
): { icon: Icon; outline: Icon; family: Family } =>
	PRESET_META[id] ?? {
		icon: IconSparklesFilled,
		outline: IconSparkles,
		family: "quality",
	};

// Display order for the check cards: group by family so same-colored chips sit
// next to each other in the grid rather than scattered.
export const FAMILY_ORDER: Family[] = [
	"safety",
	"format",
	"match",
	"quality",
	"grounding",
	"tool",
];

export const familyRank = (id: string) =>
	FAMILY_ORDER.indexOf(presetMeta(id).family);
