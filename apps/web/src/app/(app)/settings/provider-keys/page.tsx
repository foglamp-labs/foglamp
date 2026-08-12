import { redirect } from "next/navigation";

// Provider keys moved into the Settings page as a tab; keep old links working.
export default function ProviderKeysPage() {
	redirect("/settings/org?tab=provider-keys");
}
