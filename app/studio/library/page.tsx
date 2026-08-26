import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { loadStudioDashboard } from "@/lib/broadcast/studio-data";

export const dynamic = "force-dynamic";

type StudioPageProps = {
  searchParams?: Promise<{ log?: string | string[] }>;
};

export default async function LibraryPage({ searchParams }: StudioPageProps) {
  const params = await searchParams;
  const requestedLog = Array.isArray(params?.log) ? params.log[0] : params?.log;
  const data = await loadStudioDashboard(requestedLog, "library");

  return <StudioWorkspace data={data} view="library" />;
}
