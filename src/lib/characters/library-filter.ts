import type { Character } from "@/lib/types/database";
import {
  CANONICAL_CAST_NAMES,
  isJunkCharacterName,
} from "@/lib/engine/unknown-speaker";

/** Characters shown in the global Character library (hides engine mis-parses). */
export function shouldShowInCharacterLibrary(c: Character): boolean {
  if (CANONICAL_CAST_NAMES.has(c.canonical_name)) return true;
  if (c.elevenlabs_voice_id) return true;
  if ((c.aliases?.length ?? 0) > 0) return true;
  return !isJunkCharacterName(c.canonical_name);
}
