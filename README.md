# number-range-list-kit

[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Recoveredd/number-range-list-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Recoveredd/number-range-list-kit/actions/workflows/ci.yml)

Parse comma-separated integer range lists such as `1, 3-5, 10..8` into normalized segments, safe expanded values and diagnostics.

`number-range-list-kit` is a small clean-room toolkit for browser forms, config editors, dashboards and import flows that need to explain user-entered range lists instead of returning a surprising array.

Links: [Demo](https://packages.wasta-wocket.fr/number-range-list-kit/) · [GitHub](https://github.com/Recoveredd/number-range-list-kit)

Use `parse-numeric-range` when you only need a mature array expansion helper. Use `number-range-list-kit` when you need typed diagnostics, source spans, duplicate warnings and a guard against accidentally expanding huge ranges.

## Package quality

- TypeScript types are generated from the source.
- ESM-only package with no runtime dependencies.
- Marked as side-effect free for bundlers.
- CI runs `npm ci`, `typecheck`, `build`, and `test`.
- Tested on Node.js 20 and 22 with GitHub Actions.
- Browser-friendly implementation with no Node-only APIs.

## Install

```bash
npm install number-range-list-kit
```

## Quick Start

```ts
import { expandNumberRangeList, isNumberRangeList, parseNumberRangeList } from "number-range-list-kit";

const parsed = parseNumberRangeList("1, 3-5, 10..8");

if (parsed.ok) {
  parsed.values;
  // [1, 3, 4, 5, 10, 9, 8]

  parsed.warnings;
  // [{ code: "descending_range", ... }]
} else {
  parsed.errors;
}

expandNumberRangeList("1, 3-5");
// [1, 3, 4, 5]

expandNumberRangeList("bad");
// null

isNumberRangeList("1, 3-5");
// true
```

## Why not just another numeric range parser?

Most tiny range packages optimize for the happy path:

```ts
"1,3-5" -> [1, 3, 4, 5]
```

That is useful, but it is not enough for UI and config input. `number-range-list-kit` focuses on explainability:

- invalid parts return stable diagnostic codes;
- each segment and diagnostic includes source offsets;
- descending ranges can be accepted, warned about, or rejected;
- duplicate expanded values can be reported and optionally deduped;
- huge expansions are blocked by `maxExpandedValues`;
- parsing can be run without expansion when the caller only needs normalized segments.

## API

### `parseNumberRangeList(input, options?)`

Returns a discriminated result with:

- `input`: original runtime input.
- `segments`: normalized `{ start, end, step, text, startIndex, endIndex }` objects.
- `values`: expanded integers when expansion is enabled.
- `errors`: stable issue codes and source spans on invalid input.
- `warnings`: duplicate values and descending ranges.

```ts
import { parseNumberRangeList } from "number-range-list-kit";

const result = parseNumberRangeList("2, 4-6, 9-7", {
  maxExpandedValues: 20,
  allowDescending: true
});

if (result.ok) {
  console.log(result.values);
  // [2, 4, 5, 6, 9, 8, 7]
} else {
  console.log(result.errors);
}
```

Result shape:

```ts
type NumberRangeListResult =
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
```

Options:

| Option | Default | Description |
| --- | --- | --- |
| `maxExpandedValues` | `1000` | Maximum number of expanded integers before returning a diagnostic. |
| `expand` | `true` | Set to `false` to parse only segments and skip expansion. |
| `allowDescending` | `true` | Set to `false` to reject ranges such as `5-3`. |
| `dedupe` | `false` | Set to `true` to remove duplicate expanded values while keeping duplicate warnings. |

### `expandNumberRangeList(input, options?)`

Returns an array of integers, or `null` when parsing fails.

```ts
import { expandNumberRangeList } from "number-range-list-kit";

expandNumberRangeList("1, 3-5");
// [1, 3, 4, 5]
```

### `isNumberRangeList(input, options?)`

Returns `true` when the input parses without errors under the provided options. It is useful for simple form validation.

```ts
import { isNumberRangeList } from "number-range-list-kit";

isNumberRangeList("1, 3-5");
// true

isNumberRangeList("5-3", { allowDescending: false });
// false
```

### `formatNumberRangeList(segments)`

Formats parsed segments back into compact `1,3-5` form.

```ts
import { formatNumberRangeList, parseNumberRangeList } from "number-range-list-kit";

const result = parseNumberRangeList("1, 3 - 5", { expand: false });

if (result.ok) {
  formatNumberRangeList(result.segments);
  // "1,3-5"
}
```

## Diagnostics

Diagnostics are designed for UI display.

| Code | Meaning |
| --- | --- |
| `not_a_string` | Runtime input was not a string. |
| `empty_part` | A comma-separated part was empty. |
| `invalid_part` | A part was not an integer or supported range. |
| `unsafe_integer` | A bound cannot be represented as a safe JavaScript integer. |
| `descending_range` | A descending range was accepted and will expand high-to-low. |
| `descending_range_disabled` | A descending range was rejected by `allowDescending: false`. |
| `invalid_max_expanded_values` | `maxExpandedValues` was not a finite integer greater than or equal to 0. |
| `max_expanded_values_exceeded` | Expanded output would exceed `maxExpandedValues`. |
| `duplicate_value` | Expansion produced a value that was already present. |

Example:

```ts
const result = parseNumberRangeList("1,,10-8", {
  allowDescending: false
});

if (!result.ok) {
  result.errors.map((error) => error.code);
  // ["empty_part", "descending_range_disabled"]
}
```

## Syntax

- Single integers: `1`, `-4`, `+8`.
- Hyphen ranges: `1-3`, `-3--1`, `1 - -3`.
- Dot ranges: `1..3`, `1...3`.
- Unicode range separators: `1…3`, `1‥3`, `1⋯3`, `1–3`, `1—3`.
- Descending ranges: `5-3`.
- Comma-separated parts with optional whitespace.

## Notes

- This package parses integers only.
- Ranges are inclusive.
- No step syntax is supported, so `1-10/2` is invalid.
- No unbounded ranges are supported.
- The implementation is clean-room and does not copy code from `parse-numeric-range`, `fill-range`, `multi-integer-range` or related packages.

## Browser support

The core has no runtime dependencies and uses only strings, arrays, sets, numbers, regular expressions and plain objects. It does not require `fs`, `path`, `Buffer`, `process`, network access or native modules.

## License

MPL-2.0
