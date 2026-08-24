/**
 * Compatibility shim for pages introduced before deployment-time migrations.
 * Schema changes are applied once by scripts/migrate.mjs during the Vercel
 * build; request handlers never issue DDL or cleanup production data.
 */
export async function ensureScreenManagementSchema() {
  return;
}
