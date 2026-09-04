import { describe, expect, it } from "vitest";
import { formatDuration, numberToWord, relativeTime, shortAddress } from "../format";

describe("shortAddress", () => {
  it("truncates a well-formed address to 0x1234…abcd", () => {
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
  });

  it("never throws on hostile/malformed input — null, undefined, empty, short garbage", () => {
    expect(shortAddress(null)).toBe("—");
    expect(shortAddress(undefined)).toBe("—");
    expect(shortAddress("")).toBe("—");
    expect(shortAddress("0x1")).toBe("—");
    // Long non-address garbage is truncated like any other string rather than
    // thrown on — this helper only formats, validation happens elsewhere.
    expect(() => shortAddress("not-an-address-but-long-enough")).not.toThrow();
  });
});

describe("formatDuration", () => {
  it("formats seconds, minutes, hours, and days at their natural boundaries", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(3661)).toBe("1h 1m");
    expect(formatDuration(90000)).toBe("1d 1h");
  });

  it("never throws on hostile input — negative, NaN, Infinity", () => {
    expect(formatDuration(-5)).toBe("—");
    expect(formatDuration(NaN)).toBe("—");
    expect(formatDuration(Infinity)).toBe("—");
  });
});

describe("relativeTime", () => {
  const nowMs = 1_000_000_000_000;

  it("buckets into NOW / seconds / minutes / hours ago", () => {
    expect(relativeTime(nowMs / 1000, nowMs)).toBe("NOW");
    expect(relativeTime(nowMs / 1000 - 30, nowMs)).toBe("30s AGO");
    expect(relativeTime(nowMs / 1000 - 120, nowMs)).toBe("2m AGO");
    expect(relativeTime(nowMs / 1000 - 7200, nowMs)).toBe("2h AGO");
  });

  it("clamps a future/clock-skewed timestamp to NOW instead of a negative duration", () => {
    expect(relativeTime(nowMs / 1000 + 500, nowMs)).toBe("NOW");
  });
});

describe("numberToWord — the identity card's whole-second quote line", () => {
  it("spells the full reachable range correctly at representative points", () => {
    expect(numberToWord(0)).toBe("zero");
    expect(numberToWord(1)).toBe("one");
    expect(numberToWord(7)).toBe("seven");
    expect(numberToWord(13)).toBe("thirteen");
    expect(numberToWord(20)).toBe("twenty");
    expect(numberToWord(21)).toBe("twenty-one");
    expect(numberToWord(34)).toBe("thirty-four");
    expect(numberToWord(59)).toBe("fifty-nine");
    expect(numberToWord(60)).toBe("sixty");
  });

  it("every value 0-60 produces a non-numeric word, never falling through to String(n)", () => {
    for (let n = 0; n <= 60; n++) {
      expect(numberToWord(n)).not.toMatch(/^\d+$/);
    }
  });

  it("falls back to the raw number outside the reachable range rather than guessing", () => {
    expect(numberToWord(61)).toBe("61");
    expect(numberToWord(-1)).toBe("-1");
    expect(numberToWord(1.5)).toBe("1.5");
  });
});
