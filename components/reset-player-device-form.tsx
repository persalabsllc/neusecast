"use client";

import { useFormStatus } from "react-dom";
import { RotateCcw } from "lucide-react";

function ResetButton() {
  const { pending } = useFormStatus();
  return <button className="button button-secondary" type="submit" disabled={pending}><RotateCcw size={16} /> {pending ? "Resetting…" : "Reset device pairing"}</button>;
}

export function ResetPlayerDeviceForm({ screenId, action }: { screenId: string; action: (formData: FormData) => void | Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Reset this device pairing? The venue player will need a new one-time pairing link.")) event.preventDefault();
      }}
    >
      <input type="hidden" name="screenId" value={screenId} />
      <ResetButton />
    </form>
  );
}
