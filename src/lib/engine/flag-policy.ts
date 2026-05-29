import type { TaggedLine } from "./types";

export type FlagContext = {
  speaker: string;
  confidence: TaggedLine["confidence"];
  rosterResolved: boolean;
  firstNameOnlyMatch: boolean;
  inferenceKind:
    | "none"
    | "back_and_forth"
    | "last_speaker"
    | "no_context"
    | "pronoun";
};

/** Assign always; flag when automation is not fully confident. */
export function flagReasonForLine(ctx: FlagContext): string | null {
  if (ctx.speaker === "UNKNOWN") {
    return "unattributed_dialogue_no_context";
  }
  if (!ctx.rosterResolved && ctx.speaker !== "Narrator") {
    return "speaker_not_in_roster";
  }
  if (ctx.firstNameOnlyMatch) {
    return "first_name_resolved";
  }
  if (ctx.inferenceKind === "back_and_forth") {
    return "unattributed_back_and_forth_inferred";
  }
  if (ctx.inferenceKind === "last_speaker") {
    return "unattributed_dialogue_inferred_from_context";
  }
  if (ctx.inferenceKind === "pronoun" || ctx.confidence === "low") {
    return "pronoun_only_attribution";
  }
  if (ctx.confidence === "medium") {
    return "name_without_dialogue_verb";
  }
  return null;
}
