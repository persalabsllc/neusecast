"use client";

import { useActionState } from "react";
import { Newspaper, Radio } from "lucide-react";
import {
  generateNewsroomEditionAction,
  type NewsroomGenerationActionState,
} from "@/app/control/newsroom/actions";

const INITIAL_STATE: NewsroomGenerationActionState = {
  status: "idle",
  message: "",
  editionId: null,
};

export function NewsroomGenerateControls() {
  const [state, action, pending] = useActionState(generateNewsroomEditionAction, INITIAL_STATE);

  return (
    <div className="newsroom-generation-control">
      <div className="dashboard-actions newsroom-generate-actions">
        <form action={action}>
          <input type="hidden" name="market" value="Eastern North Carolina" />
          <input type="hidden" name="slot" value="morning" />
          <button className="button button-secondary" type="submit" disabled={pending}>
            <Newspaper size={16} /> {pending ? "Generating newsroom…" : "Generate morning"}
          </button>
        </form>
        <form action={action}>
          <input type="hidden" name="market" value="Eastern North Carolina" />
          <input type="hidden" name="slot" value="afternoon" />
          <button className="button button-primary" type="submit" disabled={pending}>
            <Radio size={16} /> {pending ? "Generating newsroom…" : "Generate update"}
          </button>
        </form>
      </div>
      {pending ? (
        <div className="newsroom-generation-message is-working" role="status">
          <span className="newsroom-generation-spinner" />
          Researching current local sources, verifying citations, and building the television rundown. This can take one to three minutes.
        </div>
      ) : state.status !== "idle" ? (
        <div className={`newsroom-generation-message is-${state.status}`} role="status">
          {state.message}
        </div>
      ) : null}
    </div>
  );
}
