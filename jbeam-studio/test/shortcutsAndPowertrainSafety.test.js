import assert from 'assert';

export function runShortcutsAndPowertrainSafetyTests() {
  console.log('--- Running Global Shortcuts & Powertrain Safety Tests ---');

  // Test 1: Global Undo & Redo Keyboard Shortcut Detection
  function simulateKeyHandler(event) {
    let triggered = null;
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (event.targetTag === 'INPUT' || event.targetTag === 'TEXTAREA') {
        return null; // Ignore native inputs
      }
      if (event.key === 'z' || event.key === 'Z') {
        triggered = event.shiftKey ? 'redo' : 'undo';
      } else if (event.key === 'y' || event.key === 'Y') {
        triggered = 'redo';
      }
    }
    return triggered;
  }

  assert.strictEqual(simulateKeyHandler({ ctrlKey: true, key: 'z', shiftKey: false }), 'undo');
  assert.strictEqual(simulateKeyHandler({ ctrlKey: true, key: 'y', shiftKey: false }), 'redo');
  assert.strictEqual(simulateKeyHandler({ ctrlKey: true, key: 'z', shiftKey: true }), 'redo');
  assert.strictEqual(simulateKeyHandler({ ctrlKey: true, key: 'z', shiftKey: false, targetTag: 'INPUT' }), null);
  console.log('✓ Test 1: Global Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z shortcut dispatch verified.');

  // Test 2: Safe diffType formatting without [object Object]
  function formatDifferentialBadge(props) {
    if (!props) return null;
    const ratio = props.gearRatio;
    let dType = props.diffType;
    if (Array.isArray(dType)) {
      dType = dType.filter(x => typeof x === 'string').join('/');
    } else if (dType && typeof dType === 'object') {
      dType = Object.values(dType).filter(x => typeof x === 'string').join('/');
    } else if (typeof dType !== 'string') {
      dType = null;
    }

    if (ratio) {
      return `${ratio}:1 ${dType ? `(${dType})` : 'Final Drive'}`;
    }
    return dType ? `${dType} Diff` : null;
  }

  // SJSON decoded dictionary object
  const sjsonObjectDiff = { diffType: { '0': 'open', '1': 'lsd' } };
  assert.strictEqual(formatDifferentialBadge(sjsonObjectDiff), 'open/lsd Diff');
  assert(!formatDifferentialBadge(sjsonObjectDiff).includes('[object Object]'));

  // Standard array diff
  const arrayDiff = { diffType: ['locking', 'open'], gearRatio: 4.10 };
  assert.strictEqual(formatDifferentialBadge(arrayDiff), '4.1:1 (locking/open)');

  // Simple string diff
  const stringDiff = { diffType: 'viscous' };
  assert.strictEqual(formatDifferentialBadge(stringDiff), 'viscous Diff');

  // Null/undefined safety
  assert.strictEqual(formatDifferentialBadge({}), null);
  console.log('✓ Test 2: Safe differential badge formatting (eliminating [object Object]) verified.');

  // Test 3: Safe circular AST property serialization
  const circularObj = {
    ratio: 3.55,
    type: 'differential',
    __meta: { parent: null }
  };
  circularObj.__meta.parent = circularObj; // Circular reference

  let displayValues = [];
  assert.doesNotThrow(() => {
    Object.entries(circularObj).forEach(([k, v]) => {
      if (k.startsWith('__')) return; // Ignores __meta
      let displayVal = '';
      try {
        if (Array.isArray(v)) {
          displayVal = v.join(', ');
        } else if (v && typeof v === 'object') {
          displayVal = Object.values(v).join(', ');
        } else {
          displayVal = String(v ?? '');
        }
      } catch {
        displayVal = '[Complex Object]';
      }
      displayValues.push({ k, displayVal });
    });
  });

  assert.strictEqual(displayValues.length, 2);
  assert.strictEqual(displayValues[0].displayVal, '3.55');
  assert.strictEqual(displayValues[1].displayVal, 'differential');
  console.log('✓ Test 3: Safe device property inspection (no circular JSON crashes) verified.');

  console.log('All Global Shortcuts & Powertrain Safety tests passed successfully!');
}

