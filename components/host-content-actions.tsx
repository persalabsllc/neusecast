"use client";

import { Trash2 } from "lucide-react";

export function DeleteHostContentForm({
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
        if (!window.confirm(`Delete “${title}” from this screen? This cannot be undone.`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="contentId" value={contentId} />
      <button className="button button-danger button-small" type="submit"><Trash2 size={14} /> Delete</button>
    </form>
  );
}
