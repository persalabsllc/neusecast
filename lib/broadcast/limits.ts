// Keeps a complete published-day snapshot comfortably below Vercel's 4.5 MB
// Function payload ceiling after compact item/media serialization.
export const MAX_AGENT_SNAPSHOT_TEST_BYTES = 4_000_000;
