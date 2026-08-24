"use strict";

const crypto = require("crypto");
const {
  analyzeContextAnchoredReplacement,
  applyContextAnchoredReplacement,
  occurrenceMismatch,
} = require("./context-anchored-replace");

const SUPPORTED_ENCODINGS = new Map([
  ["Cn", "gb18030"],
  ["Tw", "big5"],
  ["Utf8", "utf-8"],
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function codedError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function normalizeEncoding(value) {
  const raw = String(value || "").trim().toLowerCase();
  const aliases = new Map([
    ["cn", "Cn"], ["gbk", "Cn"], ["gb18030", "Cn"], ["cp936", "Cn"],
    ["tw", "Tw"], ["big5", "Tw"], ["cp950", "Tw"],
    ["utf8", "Utf8"], ["utf-8", "Utf8"],
  ]);
  const normalized = aliases.get(raw);
  if (!SUPPORTED_ENCODINGS.has(normalized)) {
    throw codedError(
      "EXISTING_NUT_ENCODING_UNSUPPORTED",
      `既有 NUT 原始字节补丁只支持 Cn、Tw 或 Utf8，不能使用 ${value || "空编码"}。`,
      { encoding: value || null },
    );
  }
  return normalized;
}

function decodeRawText(bytes, encoding, trimTrailingNull = true) {
  const normalized = normalizeEncoding(encoding);
  const decoder = new TextDecoder(SUPPORTED_ENCODINGS.get(normalized), { fatal: false });
  const decoded = decoder.decode(bytes);
  return trimTrailingNull ? decoded.replace(/\0+$/gu, "") : decoded;
}

function replacementCharacterCount(value) {
  return [...String(value || "")].filter((character) => character === "\uFFFD").length;
}

function safeAsciiScriptText(value) {
  return typeof value === "string" && /^[\x09\x0a\x0d\x20-\x7e]*$/u.test(value);
}

function findBufferOccurrences(source, needle) {
  const offsets = [];
  let cursor = 0;
  while (cursor <= source.length - needle.length) {
    const offset = source.indexOf(needle, cursor);
    if (offset < 0) break;
    offsets.push(offset);
    cursor = offset + 1;
  }
  return offsets;
}

function streamedAsciiOffsets(sourceBytes, encoding, candidateOffsets) {
  const normalized = normalizeEncoding(encoding);
  const candidates = new Set(candidateOffsets);
  const decoder = new TextDecoder(SUPPORTED_ENCODINGS.get(normalized), { fatal: false });
  const mapped = new Map();
  const chunks = [];
  let decodedLength = 0;
  for (let offset = 0; offset < sourceBytes.length; offset += 1) {
    const byte = sourceBytes[offset];
    const chunk = decoder.decode(Uint8Array.of(byte), { stream: true });
    if (candidates.has(offset) && byte <= 0x7f) {
      const character = String.fromCharCode(byte);
      if (chunk.endsWith(character)) {
        mapped.set(offset, decodedLength + chunk.length - 1);
      }
    }
    chunks.push(chunk);
    decodedLength += chunk.length;
  }
  const tail = decoder.decode();
  chunks.push(tail);
  return {
    decodedText: chunks.join(""),
    textOffsetByRawOffset: mapped,
  };
}

function resolveRawReplacementRanges({
  sourceBytes,
  sourceText,
  previousText,
  occurrenceOffsets,
  encoding,
}) {
  const previousBytes = Buffer.from(previousText, "ascii");
  const rawCandidates = findBufferOccurrences(sourceBytes, previousBytes);
  const streamed = streamedAsciiOffsets(sourceBytes, encoding, rawCandidates);
  const decodedWithNulls = streamed.decodedText;
  if (decodedWithNulls.replace(/\0+$/gu, "") !== sourceText) {
    throw codedError(
      "EXISTING_NUT_RAW_TEXT_BINDING_FAILED",
      "既有 NUT 的原始字节无法与本次审计使用的完整原文精确绑定。",
      {
        encoding: normalizeEncoding(encoding),
        sourceRawSha256: sha256(sourceBytes),
        decodedTextSha256: sha256(Buffer.from(decodedWithNulls.replace(/\0+$/gu, ""), "utf8")),
        plannedSourceTextSha256: sha256(Buffer.from(sourceText, "utf8")),
      },
    );
  }

  const ranges = [];
  for (const textOffset of occurrenceOffsets) {
    const matches = rawCandidates.filter((rawOffset) => {
      if (streamed.textOffsetByRawOffset.get(rawOffset) !== textOffset) return false;
      const rawEnd = rawOffset + previousBytes.length;
      if (!sourceBytes.subarray(rawOffset, rawEnd).equals(previousBytes)) return false;
      const prefix = decodeRawText(sourceBytes.subarray(0, rawOffset), encoding, false);
      const middle = decodeRawText(sourceBytes.subarray(rawOffset, rawEnd), encoding, false);
      const suffix = decodeRawText(sourceBytes.subarray(rawEnd), encoding, false);
      return prefix === decodedWithNulls.slice(0, textOffset) &&
        middle === previousText &&
        suffix === decodedWithNulls.slice(textOffset + previousText.length);
    });
    if (matches.length !== 1) {
      throw codedError(
        matches.length === 0
          ? "EXISTING_NUT_ASCII_BYTE_TARGET_NOT_FOUND"
          : "EXISTING_NUT_ASCII_BYTE_TARGET_AMBIGUOUS",
        matches.length === 0
          ? "已定位的 NUT 原文没有唯一对应的原始 ASCII 字节区间。"
          : "已定位的 NUT 原文对应多个原始 ASCII 字节区间，已停止写入。",
        {
          encoding: normalizeEncoding(encoding),
          textOffset,
          previousTextSha256: sha256(Buffer.from(previousText, "ascii")),
          rawCandidateCount: rawCandidates.length,
          mappedCandidateCount: matches.length,
        },
      );
    }
    ranges.push({
      textOffset,
      sourceStart: matches[0],
      sourceEnd: matches[0] + previousBytes.length,
    });
  }
  ranges.sort((left, right) => left.sourceStart - right.sourceStart);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index].sourceStart < ranges[index - 1].sourceEnd) {
      throw codedError("EXISTING_NUT_ASCII_BYTE_RANGE_OVERLAP", "既有 NUT 的原始字节替换区间发生重叠。", { ranges });
    }
  }
  return ranges;
}

function applyRawReplacementRanges(sourceBytes, ranges, newBytes) {
  const parts = [];
  const unchangedRanges = [];
  const replacementRanges = [];
  let sourceCursor = 0;
  let outputCursor = 0;
  for (const range of ranges) {
    const unchanged = sourceBytes.subarray(sourceCursor, range.sourceStart);
    parts.push(unchanged);
    if (unchanged.length > 0) {
      unchangedRanges.push({
        sourceStart: sourceCursor,
        outputStart: outputCursor,
        length: unchanged.length,
        sha256: sha256(unchanged),
      });
    }
    outputCursor += unchanged.length;
    const oldBytes = sourceBytes.subarray(range.sourceStart, range.sourceEnd);
    parts.push(newBytes);
    replacementRanges.push({
      sourceStart: range.sourceStart,
      sourceEnd: range.sourceEnd,
      outputStart: outputCursor,
      outputEnd: outputCursor + newBytes.length,
      previousBytesSha256: sha256(oldBytes),
      newBytesSha256: sha256(newBytes),
    });
    outputCursor += newBytes.length;
    sourceCursor = range.sourceEnd;
  }
  const tail = sourceBytes.subarray(sourceCursor);
  parts.push(tail);
  if (tail.length > 0) {
    unchangedRanges.push({
      sourceStart: sourceCursor,
      outputStart: outputCursor,
      length: tail.length,
      sha256: sha256(tail),
    });
  }
  const outputBytes = Buffer.concat(parts);
  const preservedSourceParts = [];
  const preservedOutputParts = [];
  for (const range of unchangedRanges) {
    const sourcePart = sourceBytes.subarray(range.sourceStart, range.sourceStart + range.length);
    const outputPart = outputBytes.subarray(range.outputStart, range.outputStart + range.length);
    preservedSourceParts.push(sourcePart);
    preservedOutputParts.push(outputPart);
    if (!sourcePart.equals(outputPart) || sha256(outputPart) !== range.sha256) {
      throw codedError("EXISTING_NUT_NON_TARGET_BYTES_CHANGED", "既有 NUT 的非目标原始字节发生变化，已停止写入。", { range });
    }
  }
  const preservedSource = Buffer.concat(preservedSourceParts);
  const preservedOutput = Buffer.concat(preservedOutputParts);
  if (!preservedSource.equals(preservedOutput)) {
    throw codedError("EXISTING_NUT_NON_TARGET_BYTES_CHANGED", "既有 NUT 的非目标原始字节总校验不一致，已停止写入。");
  }
  return {
    outputBytes,
    proof: {
      nonTargetRawBytesPreserved: true,
      preservedRawByteCount: preservedSource.length,
      removedRawByteCount: replacementRanges.reduce((total, range) => total + range.sourceEnd - range.sourceStart, 0),
      insertedRawByteCount: replacementRanges.reduce((total, range) => total + range.outputEnd - range.outputStart, 0),
      preservedRawBytesSha256: sha256(preservedSource),
      unchangedRangeCount: unchangedRanges.length,
      replacementRangeCount: replacementRanges.length,
      unchangedRangesSha256: sha256(Buffer.from(JSON.stringify(unchangedRanges), "utf8")),
      replacementRangesSha256: sha256(Buffer.from(JSON.stringify(replacementRanges), "utf8")),
      replacementRanges,
    },
  };
}

function buildBytePreservingAsciiTextPatch(input = {}) {
  if (!Buffer.isBuffer(input.sourceBytes)) {
    throw codedError("EXISTING_NUT_RAW_BYTES_REQUIRED", "既有 NUT 原始字节补丁缺少 sourceBytes。");
  }
  const encoding = normalizeEncoding(input.encoding);
  const initialSourceBytes = Buffer.from(input.sourceBytes);
  const initialSourceText = String(input.sourceText ?? "");
  const decodedSourceText = decodeRawText(initialSourceBytes, encoding);
  if (decodedSourceText !== initialSourceText) {
    throw codedError(
      "EXISTING_NUT_RAW_TEXT_BINDING_FAILED",
      "既有 NUT 的原始字节解码结果与本次审计原文不一致。",
      {
        encoding,
        sourceRawSha256: sha256(initialSourceBytes),
        decodedTextSha256: sha256(Buffer.from(decodedSourceText, "utf8")),
        plannedSourceTextSha256: sha256(Buffer.from(initialSourceText, "utf8")),
      },
    );
  }
  const changes = Array.isArray(input.changes) ? input.changes : [];
  if (changes.length === 0) {
    throw codedError("EXISTING_NUT_CHANGE_PLAN_REQUIRED", "既有 NUT 原始字节补丁至少需要一项替换。 ");
  }
  let currentBytes = Buffer.from(initialSourceBytes);
  let currentText = initialSourceText;
  const steps = [];
  for (const [index, change] of changes.entries()) {
    const previousText = change?.previousText;
    const newText = change?.newText;
    if (!safeAsciiScriptText(previousText) || !safeAsciiScriptText(newText) || previousText.length === 0) {
      throw codedError(
        "EXISTING_NUT_ASCII_BYTES_REQUIRED",
        `既有 NUT change[${index}] 只能替换非空的数字、英文和常见符号原文。`,
        { index },
      );
    }
    const anchored = analyzeContextAnchoredReplacement({
      sourceText: currentText,
      previousText,
      newText,
      contextBefore: change.contextBefore,
      contextAfter: change.contextAfter,
      scope: change.scope,
      occurrenceIndex: change.occurrenceIndex,
      replaceAll: change.replaceAll === true,
      expectedOccurrences: change.expectedOccurrences,
    });
    const mismatch = occurrenceMismatch(anchored);
    if (mismatch) throw mismatch;
    const expectedText = applyContextAnchoredReplacement({
      sourceText: currentText,
      previousText,
      newText,
    }, anchored);
    const rawRanges = resolveRawReplacementRanges({
      sourceBytes: currentBytes,
      sourceText: currentText,
      previousText,
      occurrenceOffsets: anchored.occurrenceOffsets,
      encoding,
    });
    const applied = applyRawReplacementRanges(currentBytes, rawRanges, Buffer.from(newText, "ascii"));
    const decodedOutputText = decodeRawText(applied.outputBytes, encoding);
    if (decodedOutputText !== expectedText) {
      throw codedError(
        "EXISTING_NUT_RAW_PATCH_READBACK_FAILED",
        "既有 NUT 的局部原始字节补丁未能精确读回预期文本。",
        {
          index,
          encoding,
          expectedTextSha256: sha256(Buffer.from(expectedText, "utf8")),
          actualTextSha256: sha256(Buffer.from(decodedOutputText, "utf8")),
        },
      );
    }
    const sourceReplacementCharacters = replacementCharacterCount(currentText);
    const outputReplacementCharacters = replacementCharacterCount(decodedOutputText);
    if (sourceReplacementCharacters !== outputReplacementCharacters) {
      throw codedError(
        "EXISTING_NUT_LEGACY_BYTES_CHANGED",
        "既有 NUT 中不可还原的旧字节在局部补丁后发生变化，已停止写入。",
        { sourceReplacementCharacters, outputReplacementCharacters },
      );
    }
    steps.push({
      id: change.id || null,
      index,
      encoding,
      occurrenceCount: anchored.occurrenceCount,
      expectedOccurrences: anchored.expectedOccurrences,
      contextAnchor: anchored.evidence,
      sourceTextSha256: sha256(Buffer.from(currentText, "utf8")),
      outputTextSha256: sha256(Buffer.from(expectedText, "utf8")),
      sourceRawSha256: sha256(currentBytes),
      outputRawSha256: sha256(applied.outputBytes),
      sourceRawByteLength: currentBytes.length,
      outputRawByteLength: applied.outputBytes.length,
      sourceReplacementCharacterCount: sourceReplacementCharacters,
      outputReplacementCharacterCount: outputReplacementCharacters,
      replacementCharactersPreserved: sourceReplacementCharacters === outputReplacementCharacters,
      ...applied.proof,
    });
    currentBytes = applied.outputBytes;
    currentText = expectedText;
  }
  return {
    outputBytes: currentBytes,
    expectedText: currentText,
    steps,
    proof: {
      mode: "existing-nut-controlled-edit",
      encoding,
      rawBytePreservingPatch: true,
      wholeFileReencodingUsed: false,
      sourceDecodedTextBound: true,
      nonTargetRawBytesPreserved: steps.every((step) => step.nonTargetRawBytesPreserved === true),
      sourceRawSha256: sha256(initialSourceBytes),
      outputRawSha256: sha256(currentBytes),
      sourceTextSha256: sha256(Buffer.from(initialSourceText, "utf8")),
      finalTextSha256: sha256(Buffer.from(currentText, "utf8")),
      sourceRawByteLength: initialSourceBytes.length,
      outputRawByteLength: currentBytes.length,
      sourceReplacementCharacterCount: replacementCharacterCount(initialSourceText),
      outputReplacementCharacterCount: replacementCharacterCount(currentText),
      replacementCharactersPreserved:
        replacementCharacterCount(initialSourceText) === replacementCharacterCount(currentText),
      stepCount: steps.length,
      stepProofsSha256: sha256(Buffer.from(JSON.stringify(steps), "utf8")),
    },
  };
}

function bytePreservingAsciiTextSelfTest() {
  const checks = [];
  for (const [encoding, invalidBytes] of [
    ["Cn", Buffer.from([0x81, 0x20])],
    ["Tw", Buffer.from([0x81, 0x20])],
    ["Utf8", Buffer.from([0xff])],
  ]) {
    const prefix = Buffer.from("function fixture(obj)\r\n{\r\n\t// legacy:", "ascii");
    const suffix = Buffer.from("\r\n\tlocal value = 10;\r\n\treturn value;\r\n}\r\n", "ascii");
    const sourceBytes = Buffer.concat([prefix, invalidBytes, suffix]);
    const sourceText = decodeRawText(sourceBytes, encoding);
    const patch = buildBytePreservingAsciiTextPatch({
      sourceBytes,
      sourceText,
      encoding,
      changes: [{
        id: `legacy-${encoding}`,
        previousText: "local value = 10;",
        newText: "local value = 100;",
        replaceAll: false,
        expectedOccurrences: 1,
      }],
    });
    const expectedBytes = Buffer.concat([
      sourceBytes.subarray(0, sourceBytes.indexOf(Buffer.from("local value = 10;", "ascii"))),
      Buffer.from("local value = 100;", "ascii"),
      sourceBytes.subarray(sourceBytes.indexOf(Buffer.from("local value = 10;", "ascii")) + "local value = 10;".length),
    ]);
    checks.push({
      id: `byte-preserving-${encoding.toLowerCase()}-legacy-replacement-byte-roundtrip`,
      ok: patch.outputBytes.equals(expectedBytes) &&
        patch.proof.rawBytePreservingPatch === true &&
        patch.proof.wholeFileReencodingUsed === false &&
        patch.proof.nonTargetRawBytesPreserved === true &&
        patch.proof.sourceReplacementCharacterCount > 0 &&
        patch.proof.replacementCharactersPreserved === true &&
        patch.steps[0]?.nonTargetRawBytesPreserved === true,
    });
  }

  let nonAsciiCode = null;
  try {
    buildBytePreservingAsciiTextPatch({
      sourceBytes: Buffer.from("function fixture() { return 1; }", "ascii"),
      sourceText: "function fixture() { return 1; }",
      encoding: "Cn",
      changes: [{ previousText: "return 1;", newText: "return 中文;" }],
    });
  } catch (error) {
    nonAsciiCode = error.code;
  }
  checks.push({
    id: "byte-preserving-non-ascii-replacement-remains-blocked",
    ok: nonAsciiCode === "EXISTING_NUT_ASCII_BYTES_REQUIRED",
    code: nonAsciiCode,
  });

  let bindingCode = null;
  try {
    buildBytePreservingAsciiTextPatch({
      sourceBytes: Buffer.from([0xff, 0x41]),
      sourceText: "wrong",
      encoding: "Utf8",
      changes: [{ previousText: "A", newText: "B" }],
    });
  } catch (error) {
    bindingCode = error.code;
  }
  checks.push({
    id: "byte-preserving-decoded-source-binding-required",
    ok: bindingCode === "EXISTING_NUT_RAW_TEXT_BINDING_FAILED",
    code: bindingCode,
  });

  return { ok: checks.every((check) => check.ok), checks };
}

module.exports = {
  buildBytePreservingAsciiTextPatch,
  bytePreservingAsciiTextSelfTest,
  decodeRawText,
};
