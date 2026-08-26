export type NewsroomCronResult = {
  published: boolean;
  error: string | null;
};

export function newsroomCronOutcome<T extends NewsroomCronResult>(results: T[]) {
  const failures = results.filter((result) => result.error || !result.published);
  return {
    ok: failures.length === 0,
    failures,
    status: failures.length ? 502 : 200,
  } as const;
}
