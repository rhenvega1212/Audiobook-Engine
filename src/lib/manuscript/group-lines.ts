export type SpeakerBlock<T extends ManuscriptBlockLine> = {
  key: string;
  speaker_label: string;
  lines: T[];
  line_ids: string[];
  first_line_order: number;
  last_line_order: number;
  combined_text: string;
};

export type ManuscriptBlockLine = {
  id: string;
  line_order: number;
  speaker_label: string;
  line_text: string;
};

/** Merge consecutive lines with the same speaker into reading blocks. */
export function groupConsecutiveSpeakerBlocks<T extends ManuscriptBlockLine>(
  lines: T[]
): SpeakerBlock<T>[] {
  const blocks: SpeakerBlock<T>[] = [];

  for (const line of lines) {
    const last = blocks[blocks.length - 1];
    if (last && last.speaker_label === line.speaker_label) {
      last.lines.push(line);
      last.line_ids.push(line.id);
      last.last_line_order = line.line_order;
      last.combined_text = `${last.combined_text}\n${line.line_text}`;
    } else {
      blocks.push({
        key: line.id,
        speaker_label: line.speaker_label,
        lines: [line],
        line_ids: [line.id],
        first_line_order: line.line_order,
        last_line_order: line.line_order,
        combined_text: line.line_text,
      });
    }
  }

  return blocks;
}
