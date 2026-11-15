/*
  JBeam Studio - Inline Lua Expression Parser & Evaluator
  Ported and adapted from BeamNG's official expression parser (lua/common/jbeam/expressionParser.lua)
  and Blender-JBeam-Editor's safe expression evaluator.

  Evaluates inline BeamNG expressions beginning with "$=" (e.g. "$=$toe_FR - $steer_center_F")
  as well as simple variable substitutions ("$brakestrength").
*/

export class ExpressionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExpressionError';
  }
}

const nameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*/;
const numberRegex = /^(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/;
const operators = [
  '..', '==', '~=', '!=', '<=', '>=', '<', '>',
  '+', '-', '*', '/', '%', '^', '(', ')', '[', ']', ',', '.', '#'
];
const escapes = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'" };

const binaryOperators = {
  'or': 1,
  'and': 2,
  '<': 3, '>': 3, '<=': 3, '>=': 3, '~=': 3, '!=': 3, '==': 3,
  '..': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
  '^': 8,
};
const unaryPrecedence = 7;

/**
 * BeamNG / Lua truthiness:
 * In Lua, ONLY `nil` (null/undefined) and `false` are falsy.
 * `0` is TRUTHY! `""` (empty string) is TRUTHY!
 */
export function isLuaTruthy(value) {
  return value !== null && value !== undefined && value !== false;
}

export function clamp(x, min, max) {
  const realMin = Math.min(min, max);
  const realMax = Math.max(min, max);
  return Math.min(Math.max(x, realMin), realMax);
}

/**
 * Deterministic hash string for seeded random generation.
 */
function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash ^ text.charCodeAt(i)) * 16777619) >>> 0;
  }
  return hash;
}

function createRandom(text) {
  let state = hashString(text) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function toLuaString(value) {
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value !== 'number') return String(value);
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(14)));
}

function toNumber(value, operator) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value))) {
    return Number(value);
  }
  throw new ExpressionError(`cannot use ${value === null ? 'nil' : typeof value} in '${operator}'`);
}

function variableValue(value) {
  if (value !== null && typeof value === 'object' && value.val !== undefined) {
    return value.val;
  }
  return value;
}

/**
 * Creates the Lua execution environment with BeamNG specific mathematical
 * and conditional built-ins.
 */
export function createEnvironment(source, vars = {}) {
  const random = createRandom(source);
  return {
    pi: Math.PI,
    huge: Infinity,
    abs: Math.abs,
    ceil: Math.ceil,
    floor: Math.floor,
    sqrt: Math.sqrt,
    exp: Math.exp,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: (y, x) => (x === undefined ? Math.atan(y) : Math.atan2(y, x)),
    atan2: Math.atan2,
    log: Math.log,
    log10: Math.log10,
    pow: Math.pow,
    fmod: (a, b) => a % b,
    deg: a => (a * 180) / Math.PI,
    rad: a => (a * Math.PI) / 180,
    max: (...args) => Math.max(...args),
    min: (...args) => Math.min(...args),
    random: (min, max) => {
      if (min === undefined) return random();
      if (max === undefined) return Math.floor(random() * Math.floor(min)) + 1;
      return Math.floor(random() * (Math.floor(max) - Math.floor(min) + 1)) + Math.floor(min);
    },
    randomseed: () => undefined,
    round: value => Math.floor(value + 0.5),
    square: value => value * value,
    clamp,
    sign: value => (value > 0 ? 1 : value < 0 ? -1 : 0),
    smoothstep: value => {
      const v = clamp(value, 0, 1);
      return v * v * (3 - 2 * v);
    },
    smootherstep: value => {
      const v = clamp(value, 0, 1);
      return v * v * v * (v * (v * 6 - 15) + 10);
    },
    smoothmin: (a, b, k = 0.1) => {
      const h = clamp(0.5 + (b - a) / k, 0, 1);
      return h * a + (1 - h) * (b - h * k * 0.5);
    },
    case: (selector, ...args) => {
      let index = 0;
      if (typeof selector === 'boolean') {
        index = selector ? 1 : 2;
      } else if (typeof selector === 'number') {
        index = Math.floor(selector);
      } else {
        throw new ExpressionError('only booleans and numbers work as case selectors');
      }
      const value = args[index - 1];
      return isLuaTruthy(value) ? value : args[args.length - 1];
    },
    concat: table => {
      if (!table || typeof table !== 'object') return '';
      return Object.keys(table)
        .filter(key => key !== '__meta')
        .map(key => table[key])
        .join('');
    },
    vec3: (x = 0, y = 0, z = 0) => ({ x, y, z }),
    quat: (x = 0, y = 0, z = 0, w = 1) => ({ x, y, z, w }),
    include: () => null,
    var: value => '$' + (value ?? ''),
    var_: value => {
      if (value === undefined || value === null) return '$';
      const key = '$' + value;
      return vars[key] ?? vars[value] ?? null;
    },
    var_var_: '$',
    print: (...args) => args[0]
  };
}

/**
 * Tokenizes a BeamNG Lua expression string.
 */
export function tokenize(src) {
  const tokens = [];
  let i = 0;

  while (i < src.length) {
    const char = src[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (char === '"' || char === "'") {
      let value = '';
      i++;
      while (i < src.length && src[i] !== char) {
        if (src[i] === '\\' && i + 1 < src.length) {
          value += escapes[src[i + 1]] ?? src[i + 1];
          i += 2;
        } else {
          value += src[i++];
        }
      }
      if (i >= src.length) throw new ExpressionError('unterminated string');
      tokens.push({ type: 'value', value });
      i++;
      continue;
    }

    if (/\d/.test(char) || (char === '.' && /\d/.test(src[i + 1]))) {
      const match = numberRegex.exec(src.slice(i));
      if (!match) throw new ExpressionError(`invalid number at position ${i}`);
      tokens.push({ type: 'value', value: Number(match[0]) });
      i += match[0].length;
      continue;
    }

    if (char === '$') {
      if (src[i + 1] === '(') {
        tokens.push({ type: 'name', name: 'var_' });
        i++;
        continue;
      }
      const match = nameRegex.exec(src.slice(i + 1));
      tokens.push(match ? { type: 'variable', name: '$' + match[0] } : { type: 'value', value: '$' });
      i += match ? match[0].length + 1 : 1;
      continue;
    }

    const nameMatch = nameRegex.exec(src.slice(i));
    if (nameMatch) {
      tokens.push({ type: 'name', name: nameMatch[0] });
      i += nameMatch[0].length;
      continue;
    }

    const operator = operators.find(op => src.startsWith(op, i));
    if (!operator) throw new ExpressionError(`unexpected character '${char}' at index ${i}`);
    tokens.push({ type: 'operator', name: operator });
    i += operator.length;
  }

  tokens.push({ type: 'end' });
  return tokens;
}

/**
 * Parses token stream into an Abstract Syntax Tree (AST).
 */
export function parse(source) {
  if (source.length > 8192) throw new ExpressionError('expression is too long');
  const tokens = tokenize(source);
  let pos = 0;
  let depth = 0;
  const peek = () => tokens[pos];

  function expect(name) {
    const token = tokens[pos++];
    if (token.type !== 'operator' || token.name !== name) {
      throw new ExpressionError(`expected '${name}'`);
    }
  }

  function primary() {
    const token = tokens[pos++];
    if (!token) throw new ExpressionError('unexpected end of expression');

    if (token.type === 'value') return { kind: 'const', value: token.value };
    if (token.type === 'variable') return { kind: 'variable', name: token.name };
    if (token.type === 'name') {
      if (token.name === 'nil') return { kind: 'const', value: null };
      if (token.name === 'true') return { kind: 'const', value: true };
      if (token.name === 'false') return { kind: 'const', value: false };
      if (token.name === 'and' || token.name === 'or') {
        throw new ExpressionError(`unexpected '${token.name}'`);
      }
      return { kind: 'name', name: token.name };
    }
    if (token.type === 'operator' && token.name === '[') {
      const values = [];
      if (peek().name !== ']') {
        values.push(expression(0));
        while (peek().name === ',') {
          pos++;
          values.push(expression(0));
        }
      }
      expect(']');
      return { kind: 'array', values };
    }
    if (token.type === 'operator' && token.name === '(') {
      const node = expression(0);
      expect(')');
      return node;
    }
    throw new ExpressionError(`unexpected token '${token.name || token.value}'`);
  }

  function suffixed() {
    let node = primary();
    for (;;) {
      const token = peek();
      if (!token || token.type !== 'operator') return node;
      if (token.name === '.') {
        pos++;
        const key = tokens[pos++];
        if (!key || key.type !== 'name') throw new ExpressionError('expected a field name after .');
        node = { kind: 'index', object: node, key: { kind: 'const', value: key.name } };
      } else if (token.name === '[') {
        pos++;
        const key = expression(0);
        expect(']');
        node = { kind: 'index', object: node, key };
      } else if (token.name === '(') {
        pos++;
        const args = [];
        if (peek().name !== ')') {
          args.push(expression(0));
          while (peek().name === ',') {
            pos++;
            args.push(expression(0));
          }
        }
        expect(')');
        node = { kind: 'call', target: node, args };
      } else {
        return node;
      }
    }
  }

  function expression(limit) {
    if (++depth > 200) throw new ExpressionError('expression is nested too deeply');
    try {
      return expressionInner(limit);
    } finally {
      depth--;
    }
  }

  function expressionInner(limit) {
    const token = peek();
    if (!token) throw new ExpressionError('unexpected end of expression');

    const unary =
      (token.type === 'operator' && (token.name === '-' || token.name === '#')) ||
      (token.type === 'name' && token.name === 'not');
    let left;

    if (unary) {
      pos++;
      // In BeamNG vehicle expressions, 'not' binds looser than comparisons (e.g. "not $var == nil")
      // but tighter than logical 'and'/'or'.
      const opPrecedence = token.name === 'not' ? 2.5 : unaryPrecedence;
      left = { kind: 'unary', operator: token.name, operand: expression(opPrecedence) };
    } else {
      left = suffixed();
    }

    for (;;) {
      const next = peek();
      if (!next) break;
      const name = next.type === 'operator' || next.type === 'name' ? next.name : null;
      const precedence = Object.prototype.hasOwnProperty.call(binaryOperators, name)
        ? binaryOperators[name]
        : undefined;
      if (precedence === undefined || precedence <= limit) break;
      pos++;
      const rightLimit = name === '..' || name === '^' ? precedence - 1 : precedence;
      left = { kind: 'binary', operator: name, left, right: expression(rightLimit) };
    }
    return left;
  }

  const node = expression(0);
  if (peek().type !== 'end') throw new ExpressionError('unexpected trailing input');
  return node;
}

function compare(operator, left, right) {
  if (typeof left === 'string' && typeof right === 'string') {
    if (operator === '<') return left < right;
    if (operator === '>') return left > right;
    if (operator === '<=') return left <= right;
    return left >= right;
  }
  const a = toNumber(left, operator);
  const b = toNumber(right, operator);
  if (operator === '<') return a < b;
  if (operator === '>') return a > b;
  if (operator === '<=') return a <= b;
  return a >= b;
}

/**
 * Recursively evaluates an AST node in the given evaluation context.
 */
function evaluateAstNode(node, ctx) {
  if (node.kind === 'const') return node.value;
  if (node.kind === 'array') return node.values.map(val => evaluateAstNode(val, ctx));

  if (node.kind === 'variable') {
    let value = ctx.vars[node.name];
    if (value === undefined && node.name.startsWith('$')) {
      value = ctx.vars[node.name.slice(1)];
    }
    if (value === undefined) {
      if (!ctx.missing.includes(node.name)) ctx.missing.push(node.name);
      return null;
    }
    return variableValue(value);
  }

  if (node.kind === 'name') {
    return ctx.env[node.name] ?? null;
  }

  if (node.kind === 'index') {
    const object = evaluateAstNode(node.object, ctx);
    if (object === null || typeof object !== 'object') {
      throw new ExpressionError(`cannot read a field of ${object === null ? 'nil' : typeof object}`);
    }
    const key = evaluateAstNode(node.key, ctx);
    return object[key] ?? null;
  }

  if (node.kind === 'call') {
    const target = evaluateAstNode(node.target, ctx);
    if (typeof target !== 'function') {
      const name = node.target.kind === 'name' ? node.target.name : 'value';
      throw new ExpressionError(`'${name}' is not a supported function`);
    }
    return target(...node.args.map(arg => evaluateAstNode(arg, ctx))) ?? null;
  }

  if (node.kind === 'unary') {
    if (node.operator === 'not') return !isLuaTruthy(evaluateAstNode(node.operand, ctx));
    const value = evaluateAstNode(node.operand, ctx);
    if (node.operator === '-') return -toNumber(value, '-');
    if (typeof value === 'string') return value.length;
    if (value !== null && typeof value === 'object') {
      return Object.keys(value).filter(key => key !== '__meta').length;
    }
    throw new ExpressionError("cannot use '#' on this value");
  }

  const operator = node.operator;
  if (operator === 'and') {
    const left = evaluateAstNode(node.left, ctx);
    return isLuaTruthy(left) ? evaluateAstNode(node.right, ctx) : left;
  }
  if (operator === 'or') {
    const left = evaluateAstNode(node.left, ctx);
    return isLuaTruthy(left) ? left : evaluateAstNode(node.right, ctx);
  }

  const left = evaluateAstNode(node.left, ctx);
  const right = evaluateAstNode(node.right, ctx);

  if (operator === '==') return left === right;
  if (operator === '~=' || operator === '!=') return left !== right;
  if (operator === '..') {
    if (left === null || right === null || typeof left === 'boolean' || typeof right === 'boolean') {
      throw new ExpressionError("cannot concatenate this value with '..'");
    }
    return toLuaString(left) + toLuaString(right);
  }
  if (operator === '+') return toNumber(left, '+') + toNumber(right, '+');
  if (operator === '-') return toNumber(left, '-') - toNumber(right, '-');
  if (operator === '*') return toNumber(left, '*') * toNumber(right, '*');
  if (operator === '/') return toNumber(left, '/') / toNumber(right, '/');
  if (operator === '%') {
    const a = toNumber(left, '%');
    const b = toNumber(right, '%');
    // Lua modulo semantics: a - floor(a / b) * b
    return a - Math.floor(a / b) * b;
  }
  if (operator === '^') return Math.pow(toNumber(left, '^'), toNumber(right, '^'));

  return compare(operator, left, right);
}

/**
 * Safely evaluates a BeamNG Lua expression with variable environment.
 *
 * @param {string} source - Expression string (e.g. "$=$toe_FR - $steer_center_F")
 * @param {Object} [vars={}] - Dictionary of variables
 * @returns {{ value: any, missing: string[], error?: string }}
 */
export function evaluateExpression(source, vars = {}) {
  if (typeof source !== 'string') return { value: source, missing: [] };
  const body = source.startsWith('$=') ? source.slice(2) : source;
  const ctx = { vars, missing: [], env: createEnvironment(body, vars) };

  try {
    const ast = parse(body);
    const value = evaluateAstNode(ast, ctx);
    return { value: value === null ? undefined : value, missing: ctx.missing };
  } catch (error) {
    if (error instanceof ExpressionError || error instanceof RangeError) {
      return { value: undefined, missing: ctx.missing, error: error.message };
    }
    throw error;
  }
}

/**
 * Safe expression evaluation conforming to BeamNG / Blender-JBeam-Editor returns:
 * [resCode (0 for success, 1 for error), res (evaluated value or null), missing]
 *
 * @param {string} expr - Expression string
 * @param {Object} vars - Variables dictionary
 * @returns {[number, any, string[]]}
 */
export function parseSafe(expr, vars = {}) {
  const result = evaluateExpression(expr, vars);
  if (result.error !== undefined) {
    return [1, null, result.missing];
  }
  return [0, result.value, result.missing];
}

/**
 * Resolves a JBeam value (expression, variable substitution, number, or object).
 *
 * @param {any} val - JBeam cell value
 * @param {Object} vars - Variables dictionary
 * @returns {any} Evaluated value
 */
export function evaluateJBeamValue(val, vars = {}) {
  if (val === null || val === undefined) return val;

  if (typeof val === 'string') {
    if (val.startsWith('$=')) {
      const [resCode, res] = parseSafe(val, vars);
      return resCode === 0 && res !== undefined ? res : val;
    }
    // Simple variable reference (e.g. "$track", "$spring")
    if (val.length >= 2 && val[0] === '$') {
      const secondChar = val[1];
      if (secondChar !== '+' && secondChar !== '<' && secondChar !== '>') {
        const direct = vars[val] !== undefined ? vars[val] : vars[val.slice(1)];
        if (direct !== undefined) {
          return variableValue(direct);
        }
      }
    }
    return val;
  }

  if (Array.isArray(val)) {
    return val.map(item => evaluateJBeamValue(item, vars));
  }

  return val;
}

export default {
  evaluateExpression,
  parseSafe,
  evaluateJBeamValue,
  parse,
  tokenize,
  isLuaTruthy,
  clamp,
  toLuaString,
  createEnvironment,
  ExpressionError
};
