/*
  Adapted from BeamNG vscode-jbeam-editor
  Original work Copyright (c) BeamNG GmbH under MIT License.
  Decoupled from VS Code dependencies for standalone desktop & browser environments.
*/

class SJSONException extends Error {
  constructor(message, range) {
    super(`${message} near ${range[0]}:${range[1]}`);
    this.range = range;
  }
}

// range is [lineStart, colStart, lineEnd, colEnd]
function rangeInRange(range1, range2) {
  return (range1 && range2 &&
    range1[0] >= range2[0] &&
    range1[2] <= range2[2] &&
    range1[1] >= range2[1] &&
    range1[3] <= range2[3]
  );
}

// range is [lineStart, colStart, lineEnd, colEnd]
function cursorInRange(line, position, range) {
  if (line < range[0] || line > range[2]) {
    return false;
  }
  if (line === range[0] && position < range[1]) {
    return false;
  }
  if (line === range[2] && position > range[3]) {
    return false;
  }
  return true;
}

function getMetaForCurBundle(dataBundle, line, position) {
  let lineData = dataBundle.lineData;

  if (!lineData || line < 0 || position < 0) {
    return [];
  }
  if (line >= lineData.length || !lineData[line] || line < 0) {
    return [];
  }
  const metaDataForLine = lineData[line].filter(item =>
    cursorInRange(line, position, item.range)
  );
  metaDataForLine.sort((a, b) => b.depth - a.depth);
  return metaDataForLine;
}

function getPreviousMeta(dataBundle, meta) {
  if (!dataBundle.metaData || !meta || meta.id <= 0 || !dataBundle.metaData[meta.id - 1]) return null;
  return dataBundle.metaData[meta.id - 1];
}

const helperFunctions = {
  rangeInRange,
  cursorInRange,
  getMetaForCurBundle,
  getPreviousMeta,
};

function decodeWithMeta(s, origin = 'source.jbeam', cyclicDependencies = true) {
  let lineNumber = 0;
  let columnNumber = 0;
  let errors = [];
  let warnings = [];
  let abortExecution = false;
  let metaData = [];

  const escapes = {
    't': '\t',
    'n': '\n',
    'f': '\f',
    'r': '\r',
    'b': '\b',
    '"': '"',
    '\\': '\\',
    '\n': '\n',
    '9': '\t',
    '0': '\r'
  };

  let i = 0;

  function jsonError(msg, startLineNumber = lineNumber, startColumnNumber = columnNumber, endLineNumber = lineNumber, endColumnNumber = columnNumber) {
    errors.push({ message: msg, range: [startLineNumber, startColumnNumber, endLineNumber, endColumnNumber] });
    abortExecution = true;
  }

  function jsonWarning(msg, startLineNumber = lineNumber, startColumnNumber = columnNumber, endLineNumber = lineNumber, endColumnNumber = columnNumber) {
    warnings.push({ message: msg, range: [startLineNumber, startColumnNumber, endLineNumber, endColumnNumber] });
  }

  function addMetadata(data) {
    metaData.push(data);
    data.id = metaData.length - 1;
  }

  let lastNewline = 0;
  function skipWhiteSpace(depth) {
    while (i < s.length && !abortExecution) {
      if (s[i] === '\n') {
        lineNumber++;
        lastNewline = i;
        i++;
        columnNumber = 0;
        continue;
      }
      if (s[i] <= ' ' || s[i] === ',') {
        i++;
        columnNumber++;
        continue;
      }
      if (s[i] === '/') {
        if (s[i + 1] === '/') {
          // Single-line comment
          i += 2;
          columnNumber += 2;
          let commentMeta = { type: 'comment', range: [lineNumber, columnNumber, 0, 0], depth: depth };
          addMetadata(commentMeta);
          let comment = '';
          while (i < s.length && s[i] !== '\n' && !abortExecution) {
            if (s[i] !== '\r') {
              comment += s[i];
            }
            i++;
            columnNumber++;
          }
          commentMeta.range[2] = lineNumber;
          commentMeta.range[3] = columnNumber;
          commentMeta.comment = comment;
          continue;
        } else if (s[i + 1] === '*') {
          // Multi-line comment
          i += 2;
          columnNumber += 2;
          let commentMeta = { type: 'comment', range: [lineNumber, columnNumber, 0, 0], depth: depth };
          addMetadata(commentMeta);
          let comment = '';
          while (i < s.length && !(s[i] === '*' && s[i + 1] === '/') && !abortExecution) {
            if (s[i] !== '\r') {
              comment += s[i];
            }
            if (s[i] === '\n') {
              lineNumber++;
              columnNumber = 0;
              lastNewline = i;
            }
            commentMeta.range[2] = lineNumber;
            commentMeta.range[3] = columnNumber;
            commentMeta.comment = comment;
            i++;
            columnNumber++;
          }
          if (i >= s.length) {
            jsonError('Unterminated comment');
            return;
          }
          i += 2; // Skip '*/'
          columnNumber += 2;
          continue;
        } else {
          jsonError('Invalid comment');
          return;
        }
      }
      break;
    }
  }

  function readString() {
    let result = '';
    i++; // Skip initial quote
    columnNumber++;
    while (i < s.length && s[i] !== '"' && !abortExecution) {
      const ch = s[i];
      if (ch === '\\') {
        const esc = escapes[s[i + 1]];
        if (esc) {
          result += esc;
          i++;
          columnNumber++;
        } else {
          result += '\\';
        }
      } else {
        result += ch;
      }
      i++;
      columnNumber++;
    }
    i++; // Skip ending quote
    columnNumber++;
    return result;
  }

  function readNumber() {
    let numberMatch = s.substring(i).match(/^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/);
    if (!numberMatch) {
      jsonError('Invalid number');
      return;
    }
    let numberStr = numberMatch[0];
    i += numberStr.length;
    columnNumber += numberStr.length;
    return Number(numberStr);
  }

  function parseValue(parentMeta, depth) {
    skipWhiteSpace(depth);
    const ch = s[i];

    if (ch === '"') return readString();
    if (ch === '-' || ch === '+' || (ch >= '0' && ch <= '9')) return readNumber();
    if (ch === 't') { i += 4; columnNumber += 4; return true; }
    if (ch === 'f') { i += 5; columnNumber += 5; return false; }
    if (ch === 'n') { i += 4; columnNumber += 4; return null; }

    if (ch === '{') return parseObject(parentMeta, depth);
    if (ch === '[') return parseArray(parentMeta, depth);

    jsonError('Unexpected character');
  }

  function parseArray(parentMeta, depth) {
    const arr = {};
    let meta = { type: 'array', range: [lineNumber, columnNumber, 0, 0], depth: depth };
    if (cyclicDependencies) {
      meta.parent = parentMeta;
    }
    addMetadata(meta);
    i++; // skip '['
    columnNumber++;
    depth++;
    skipWhiteSpace(depth);
    let idx = 0;
    while (s[i] !== ']' && !abortExecution) {
      let valueMeta = { type: 'value', range: [lineNumber, columnNumber, 0, 0], depth: depth };
      if (cyclicDependencies) {
        valueMeta.parent = meta;
      }
      addMetadata(valueMeta);

      const val = parseValue(meta, depth + 1);
      arr[idx++] = val;
      valueMeta.range[2] = lineNumber;
      valueMeta.range[3] = columnNumber;
      valueMeta.value = val;

      skipWhiteSpace(depth);
      if (s[i] === ',') {
        i++;
        columnNumber++;
        skipWhiteSpace(depth);
      }
    }
    i++; // skip ']'
    columnNumber++;
    meta.range[2] = lineNumber;
    meta.range[3] = columnNumber;
    if (cyclicDependencies) {
      meta.obj = arr;
    }
    arr.__meta = meta;
    return arr;
  }

  function parseObject(parentMeta, depth, isOuterMostObject = false) {
    const obj = {};
    let meta = { type: 'object', range: [lineNumber, columnNumber, 0, 0], depth: depth };
    if (cyclicDependencies) {
      meta.parent = parentMeta;
    }
    addMetadata(meta);

    if (!isOuterMostObject) {
      i++; // skip '{'
    }
    columnNumber++;
    depth++;
    skipWhiteSpace(depth);
    while ((isOuterMostObject && i < s.length) || (!isOuterMostObject && s[i] !== '}' && !abortExecution)) {
      if (s[i] !== '"') {
        jsonError('Expected key');
        return;
      }

      let keyMeta = { type: 'key', range: [lineNumber, columnNumber, 0, 0], depth: depth };
      if (cyclicDependencies) {
        keyMeta.parent = meta;
      }
      const startLineNumber = lineNumber, startColumnNumber = columnNumber;
      const key = readString();
      if (key in obj) {
        jsonWarning('Duplicate key', startLineNumber, startColumnNumber);
      }
      keyMeta.range[2] = lineNumber;
      keyMeta.range[3] = columnNumber;
      keyMeta.value = key;
      addMetadata(keyMeta);

      skipWhiteSpace(depth);

      let metaSep = { type: 'objSeparator', range: [lineNumber, columnNumber, 0, 0], depth: depth };
      if (cyclicDependencies) {
        metaSep.parent = meta;
        metaSep.key = keyMeta;
      }
      addMetadata(metaSep);

      if (s[i] !== ':' && s[i] !== '=') {
        jsonError('Expected ":" or "="');
        return;
      }
      i++;
      columnNumber++;

      metaSep.range[2] = lineNumber;
      metaSep.range[3] = columnNumber;

      let valueMeta = { type: 'value', range: [lineNumber, columnNumber, 0, 0], depth: depth };
      if (cyclicDependencies) {
        valueMeta.parent = meta;
        valueMeta.key = keyMeta;
      }
      const val = parseValue(meta, depth + 1);
      obj[key] = val;
      valueMeta.range[2] = lineNumber;
      valueMeta.range[3] = columnNumber;
      valueMeta.value = val;
      addMetadata(valueMeta);

      skipWhiteSpace(depth);
      if (s[i] === ',') {
        i++;
        columnNumber++;
        skipWhiteSpace(depth);
      }
    }
    i++; // skip '}'
    columnNumber++;
    meta.range[2] = lineNumber;
    meta.range[3] = columnNumber;
    if (cyclicDependencies) {
      meta.obj = obj;
    }
    obj.__meta = meta;
    return obj;
  }

  skipWhiteSpace(0);
  const values = (s[i] === '{' || s[i] === '[') ? parseValue(null, 0) : parseObject(null, 0, true);

  // create line cache
  let lineData = [];
  for (const item of metaData) {
    for (let lineIndex = item.range[0]; lineIndex <= item.range[2]; lineIndex++) {
      if (!lineData[lineIndex]) {
        lineData[lineIndex] = [];
      }
      lineData[lineIndex].push(item);
    }
  }

  if (metaData.length > 0) {
    metaData[0].origin = origin;
  }

  return {
    data: values,
    errors: errors,
    warnings: warnings,
    metaData: metaData,
    lineData: lineData,
    ...helperFunctions
  };
}

function decodeWithMetaWithDiagnostics(contentTextUtf8, filename = 'source.jbeam', cyclicDependencies = true) {
  let dataBundle;
  let diagnosticsList = [];
  let errorsExist = false;
  try {
    dataBundle = decodeWithMeta(contentTextUtf8, filename, cyclicDependencies);
  } catch (e) {
    diagnosticsList.push({
      range: e.range ? e.range : [0, 0, 0, 0],
      message: `SJSON syntax exception: ${e.message}`,
      severity: 'error'
    });
    errorsExist = true;
  }

  if (dataBundle) {
    if (dataBundle.errors && dataBundle.errors.length > 0) {
      for (let e of dataBundle.errors) {
        diagnosticsList.push({
          range: e.range || [0, 0, 0, 0],
          message: `SJSON error: ${e.message}`,
          severity: 'error'
        });
        errorsExist = true;
      }
    }
    if (dataBundle.warnings && dataBundle.warnings.length > 0) {
      for (let w of dataBundle.warnings) {
        diagnosticsList.push({
          range: w.range || [0, 0, 0, 0],
          message: `SJSON warning: ${w.message}`,
          severity: 'warning'
        });
      }
    }
  }

  if (!dataBundle) {
    dataBundle = { data: null, metaData: [], lineData: [], errors: [], warnings: [] };
  }

  dataBundle.diagnosticsList = diagnosticsList;
  dataBundle.errorsExist = errorsExist;
  return dataBundle;
}

export {
  decodeWithMeta,
  decodeWithMetaWithDiagnostics,
  rangeInRange,
  cursorInRange,
  getMetaForCurBundle,
  getPreviousMeta
};

export default {
  decodeWithMeta,
  decodeWithMetaWithDiagnostics,
  rangeInRange,
  cursorInRange,
  getMetaForCurBundle,
  getPreviousMeta
};

