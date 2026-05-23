export const DIALOGUE_VERBS = new Set([
  "said", "says", "asked", "asks", "replied", "replies", "answered", "answers",
  "told", "tells", "responded", "responds", "added", "adds",
  "whispered", "whispers", "murmured", "murmurs", "muttered", "mutters",
  "shouted", "shouts", "yelled", "yells", "called", "calls",
  "hissed", "hisses", "shrieked", "shrieks",
  "groaned", "groans", "sighed", "sighs", "laughed", "laughs", "giggled",
  "snapped", "snaps", "snarled", "snarls", "growled", "growls",
  "exclaimed", "exclaims", "demanded", "demands", "insisted", "insists",
  "protested", "protests", "agreed", "agrees", "admitted", "admits",
  "confessed", "confesses", "explained", "explains", "continued", "continues",
  "began", "begins", "started", "starts", "finished", "finishes",
  "interrupted", "interrupts", "stammered", "stammers",
  "breathed", "breathes", "warned", "warns", "promised", "promises",
  "cried", "cries", "sobbed", "sobs", "moaned", "moans",
  "chuckled", "chuckles", "smirked", "smirks", "scoffed", "scoffs",
  "wondered", "wonders", "mused", "muses", "remarked", "remarks",
  "stated", "states", "announced", "announces", "declared", "declares",
  "offered", "offers", "suggested", "suggests", "noted", "notes",
  "observed", "observes", "ordered", "orders", "commanded", "commands",
  "pleaded", "pleads", "begged", "begs", "argued", "argues",
]);

export const ACTION_TAG_VERBS = new Set([
  "smiled", "frowned", "nodded", "shrugged", "laughed", "sighed",
  "groaned", "winced", "blinked", "grinned",
]);

export const PRONOUN_GENDER: Record<string, "male" | "female" | "unknown"> = {
  he: "male",
  him: "male",
  his: "male",
  she: "female",
  her: "female",
  hers: "female",
  they: "unknown",
  them: "unknown",
};

export const DIALOGUE_VERBS_PATTERN = Array.from(DIALOGUE_VERBS).join("|");
