import type { Character } from "@/lib/types/database";

export type MatchStatus =
  | "cast"
  | "needs_voice"
  | "new"
  | "possible_alias";

export interface DetectedCharacter {
  name: string;
  line_count: number;
  sample_lines: string[];
  match_status: MatchStatus;
  matched_character_id: string | null;
  matched_character_name: string | null;
  suggested_alias_of: string | null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return 1;
  const maxLen = Math.max(al.length, bl.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(al, bl) / maxLen;
}

export function resolveMatchStatus(
  detectedName: string,
  roster: Character[]
): {
  status: MatchStatus;
  character: Character | null;
  suggestedAliasOf: string | null;
} {
  const exact = roster.find(
    (c) =>
      c.canonical_name.toLowerCase() === detectedName.toLowerCase() ||
      c.aliases?.some((a) => a.toLowerCase() === detectedName.toLowerCase())
  );

  if (exact) {
    const status: MatchStatus = exact.elevenlabs_voice_id
      ? "cast"
      : "needs_voice";
    return { status, character: exact, suggestedAliasOf: null };
  }

  let best: Character | null = null;
  let bestScore = 0;
  for (const c of roster) {
    const scores = [
      similarity(detectedName, c.canonical_name),
      ...(c.aliases ?? []).map((a) => similarity(detectedName, a)),
    ];
    const score = Math.max(...scores);
    if (score > bestScore && score >= 0.65) {
      bestScore = score;
      best = c;
    }
  }

  if (best && bestScore < 1) {
    return {
      status: "possible_alias",
      character: best,
      suggestedAliasOf: best.canonical_name,
    };
  }

  return { status: "new", character: null, suggestedAliasOf: null };
}
