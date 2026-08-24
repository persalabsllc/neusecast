"use client";

import { useFormStatus } from "react-dom";
import { Pause, Play, Plus, Sparkles, Trash2 } from "lucide-react";

export function CreateFillerButton() {
  const { pending } = useFormStatus();
  return <button className="button button-primary" type="submit" disabled={pending}><Plus size={16} />{pending ? "Adding…" : "Add to rotation"}</button>;
}

export function GenerateFillerButton() {
  const { pending } = useFormStatus();
  return <button className="button button-primary" type="submit" disabled={pending}><Sparkles size={16} className={pending ? "is-spinning" : undefined} />{pending ? "Researching live sources…" : "Generate fresh batch"}</button>;
}

export function FillerStatusButton({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  const Icon = active ? Pause : Play;
  return <button className="button button-secondary button-small" type="submit" disabled={pending}><Icon size={14} />{pending ? "Saving…" : active ? "Pause" : "Resume"}</button>;
}

export function DeleteFillerForm({
  action,
  contentId,
  title,
}: {
  action: (formData: FormData) => void | Promise<void>;
  contentId: string;
  title: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Delete “${title}” from the filler library?`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="contentId" value={contentId} />
      <button className="button button-danger button-small" type="submit"><Trash2 size={14} /> Delete</button>
    </form>
  );
}
