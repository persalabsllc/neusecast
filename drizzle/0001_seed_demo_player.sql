-- Historical migration slot retained so existing migration journals stay ordered.
-- Launch environments must start empty; NeuseCast no longer inserts sample users,
-- venues, screens, campaigns, creative, host posts, or generated content.
SELECT 1;
