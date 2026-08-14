-- Backfill: orgs bootstrapped at signup were all named the literal
-- "My Workspace", which made them indistinguishable in the org switcher and
-- (via Foggy's dogfooding telemetry) on our own Customers card. New signups
-- now get "<name>'s Workspace"; rename existing defaults the same way,
-- deriving the name from the org's earliest owner (user.name, falling back to
-- the email local part). Orgs the user already renamed are left untouched.
UPDATE "organization" o
SET "name" = owner.local || '''s Workspace'
FROM (
	SELECT DISTINCT ON (m."organization_id")
		m."organization_id",
		COALESCE(NULLIF(u."name", ''), split_part(u."email", '@', 1)) AS local
	FROM "member" m
	JOIN "user" u ON u."id" = m."user_id"
	WHERE m."role" = 'owner'
	ORDER BY m."organization_id", m."created_at" ASC
) AS owner
WHERE o."id" = owner."organization_id"
	AND o."name" = 'My Workspace'
	AND owner.local <> '';
