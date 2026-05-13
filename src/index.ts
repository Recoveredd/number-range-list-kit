export interface NumberRangeListOptions {
  maxExpandedValues?: number;
  expand?: boolean;
  allowDescending?: boolean;
  dedupe?: boolean;
}

export type NumberRangeIssueCode =
  | "not_a_string"
  | "empty_part"
  | "invalid_part"
  | "descending_range"
  | "descending_range_disabled"
  | "invalid_max_expanded_values"
  | "max_expanded_values_exceeded"
  | "duplicate_value";

export interface NumberRangeSegment {
  start: number;
  end: number;
  step: 1 | -1;
  text: string;
  startIndex: number;
  endIndex: number;
}

export interface NumberRangeIssue {
  code: NumberRangeIssueCode;
  message: string;
  startIndex: number;
  endIndex: number;
}

export type NumberRangeListResult =
  | {
      ok: true;
      input: string;
      segments: NumberRangeSegment[];
      values: number[] | null;
      errors: [];
      warnings: NumberRangeIssue[];
    }
  | {
      ok: false;
      input: unknown;
      segments: NumberRangeSegment[];
      values: null;
      errors: NumberRangeIssue[];
      warnings: NumberRangeIssue[];
    };

const PART_PATTERN = /^([+-]?\d+)(?:\s*(?:-{1}|\.{2,3}|…|‥|⋯)\s*([+-]?\d+))?$/u;
const DEFAULT_MAX_EXPANDED_VALUES = 1000;

export function parseNumberRangeList(input: unknown, options: NumberRangeListOptions = {}): NumberRangeListResult {
  const segments: NumberRangeSegment[] = [];
  const errors: NumberRangeIssue[] = [];
  const warnings: NumberRangeIssue[] = [];

  if (typeof input !== "string") {
    return {
      ok: false,
      input,
      segments,
      values: null,
      errors: [issue("not_a_string", "Range list input must be a string.", 0, 0)],
      warnings
    };
  }

  const maxExpandedValues = normalizeMaxExpandedValues(options.maxExpandedValues, errors, input.length);
  const shouldExpand = options.expand ?? true;
  const allowDescending = options.allowDescending ?? true;
  const dedupe = options.dedupe ?? false;

  for (const part of splitParts(input)) {
    const trimmed = trimPart(part);
    if (trimmed.text.length === 0) {
      errors.push(issue("empty_part", "Expected an integer or range.", part.startIndex, part.endIndex));
      continue;
    }

    const match = PART_PATTERN.exec(trimmed.text);
    if (!match) {
      errors.push(issue("invalid_part", `Invalid range part "${trimmed.text}".`, trimmed.startIndex, trimmed.endIndex));
      continue;
    }

    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    const step = start <= end ? 1 : -1;

    if (step === -1 && !allowDescending) {
      errors.push(issue("descending_range_disabled", "Descending ranges are disabled.", trimmed.startIndex, trimmed.endIndex));
      continue;
    }

    if (step === -1) {
      warnings.push(issue("descending_range", "Descending range will expand from high to low.", trimmed.startIndex, trimmed.endIndex));
    }

    segments.push({
      start,
      end,
      step,
      text: trimmed.text,
      startIndex: trimmed.startIndex,
      endIndex: trimmed.endIndex
    });
  }

  const values = shouldExpand ? expandSegments(segments, maxExpandedValues, dedupe, warnings) : null;
  if (values === null && shouldExpand) {
    errors.push(
      issue(
        "max_expanded_values_exceeded",
        `Expanded range list exceeds maxExpandedValues (${maxExpandedValues}).`,
        0,
        input.length
      )
    );
  }

  if (errors.length > 0) {
    return { ok: false, input, segments, values: null, errors, warnings };
  }

  return { ok: true, input, segments, values, errors: [], warnings };
}

export function expandNumberRangeList(input: unknown, options: NumberRangeListOptions = {}): number[] | null {
  const result = parseNumberRangeList(input, { ...options, expand: true });
  return result.ok ? result.values : null;
}

export function formatNumberRangeList(segments: readonly NumberRangeSegment[]): string {
  return segments
    .map((segment) => (segment.start === segment.end ? String(segment.start) : `${segment.start}-${segment.end}`))
    .join(",");
}

function splitParts(input: string): Array<{ text: string; startIndex: number; endIndex: number }> {
  const parts: Array<{ text: string; startIndex: number; endIndex: number }> = [];
  let startIndex = 0;

  for (let index = 0; index <= input.length; index += 1) {
    if (index === input.length || input[index] === ",") {
      parts.push({ text: input.slice(startIndex, index), startIndex, endIndex: index });
      startIndex = index + 1;
    }
  }

  return parts;
}

function trimPart(part: { text: string; startIndex: number; endIndex: number }): {
  text: string;
  startIndex: number;
  endIndex: number;
} {
  const leadingWhitespace = /^\s*/u.exec(part.text)?.[0].length ?? 0;
  const trailingWhitespace = /\s*$/u.exec(part.text)?.[0].length ?? 0;
  const startIndex = part.startIndex + leadingWhitespace;
  const endIndex = Math.max(startIndex, part.endIndex - trailingWhitespace);

  return {
    text: part.text.slice(leadingWhitespace, part.text.length - trailingWhitespace),
    startIndex,
    endIndex
  };
}

function normalizeMaxExpandedValues(
  value: number | undefined,
  errors: NumberRangeIssue[],
  inputLength: number
): number {
  if (value === undefined) {
    return DEFAULT_MAX_EXPANDED_VALUES;
  }

  if (!Number.isInteger(value) || value < 0) {
    errors.push(
      issue(
        "invalid_max_expanded_values",
        "maxExpandedValues must be a finite integer greater than or equal to 0.",
        0,
        inputLength
      )
    );
    return DEFAULT_MAX_EXPANDED_VALUES;
  }

  return value;
}

function expandSegments(
  segments: readonly NumberRangeSegment[],
  maxExpandedValues: number,
  dedupe: boolean,
  warnings: NumberRangeIssue[]
): number[] | null {
  const values: number[] = [];
  const seen = new Set<number>();

  for (const segment of segments) {
    for (let value = segment.start; segment.step === 1 ? value <= segment.end : value >= segment.end; value += segment.step) {
      if (seen.has(value)) {
        warnings.push(issue("duplicate_value", `Duplicate value ${value}.`, segment.startIndex, segment.endIndex));
        if (dedupe) {
          continue;
        }
      }

      values.push(value);
      seen.add(value);

      if (values.length > maxExpandedValues) {
        return null;
      }
    }
  }

  return values;
}

function issue(code: NumberRangeIssue["code"], message: string, startIndex: number, endIndex: number): NumberRangeIssue {
  return { code, message, startIndex, endIndex };
}
