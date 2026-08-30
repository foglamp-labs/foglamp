import { describe, expect, it } from "bun:test";

import { unsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe";

describe("unsubscribe token", () => {
	it("round-trips and rejects tampering", () => {
		const token = unsubscribeToken("user_1", "org:with:colons");
		expect(verifyUnsubscribeToken(token)).toEqual({
			userId: "user_1",
			orgId: "org:with:colons",
		});
		expect(verifyUnsubscribeToken(`${token}x`)).toBeNull();
		expect(verifyUnsubscribeToken("garbage")).toBeNull();
	});
});
