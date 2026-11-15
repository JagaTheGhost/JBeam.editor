/**
 * JBeam Studio - Simulation Connection & BeamNG Live Wire Framing Tests
 */

import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SimConnectionMain } = require('../electron/simConnectionMain.cjs');

export function runSimConnectionTests() {
  console.log('--- Running Live BeamNG Simulation Socket Tests ---');

  // Test 1: Wire framing encoding (BN01 + 4-byte LE length + JSON + \0)
  {
    const sim = new SimConnectionMain();
    const testPayload = { cmd: 'reloadVehicle', options: { force: true } };
    const encoded = sim.encodeMessage(testPayload);

    assert(Buffer.isBuffer(encoded), 'Encoded message should be a Buffer');
    assert.strictEqual(encoded.toString('ascii', 0, 4), 'BN01', 'Magic header must be BN01');

    const expectedJson = JSON.stringify(testPayload);
    const expectedLength = Buffer.byteLength(expectedJson, 'utf8') + 1; // +1 for null
    const headerLength = encoded.readUInt32LE(4);

    assert.strictEqual(headerLength, expectedLength, 'Header length field must match JSON byteLength + 1');
    assert.strictEqual(encoded.length, 8 + expectedLength, 'Total buffer length must be 8 + payload length');
    
    // Check trailing null byte
    assert.strictEqual(encoded[encoded.length - 1], 0, 'Last byte must be null terminator');

    // Check payload
    const decodedPayload = encoded.toString('utf8', 8, encoded.length - 1);
    assert.deepStrictEqual(JSON.parse(decodedPayload), testPayload, 'Decoded JSON payload must match original');

    console.log('✓ Test 1: Wire protocol message encoding (BN01 framing) passed.');
  }

  // Test 2: Message decoding, streaming chunks and reassembly
  {
    const receivedMessages = [];
    let notifyCallCount = 0;

    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, data) => {
          if (channel === 'sim-status-change') {
            notifyCallCount++;
          }
        }
      }
    };

    const sim = new SimConnectionMain(() => mockWindow);
    // Monkey-patch handleMessage to collect messages
    const originalHandle = sim.handleMessage.bind(sim);
    sim.handleMessage = (msg) => {
      receivedMessages.push(msg);
      originalHandle(msg);
    };

    // Frame two messages
    const msg1 = { cmd: 'siminfo', data: { versiond: '0.33.2.0', platform: 'x64' } };
    const msg2 = { cmd: 'playerVehicleInfo', data: { jbeam: 'pickup', config: 'standard' } };

    const buf1 = sim.encodeMessage(msg1);
    const buf2 = sim.encodeMessage(msg2);
    const combined = Buffer.concat([buf1, buf2]);

    // Send in 3 split fragmented chunks
    const chunk1 = combined.slice(0, 10); // Splits inside msg1
    const chunk2 = combined.slice(10, buf1.length + 5); // Completes msg1 and starts msg2
    const chunk3 = combined.slice(buf1.length + 5); // Completes msg2

    sim.onRawData(chunk1);
    assert.strictEqual(receivedMessages.length, 0, 'No complete messages should have been parsed from chunk 1');

    sim.onRawData(chunk2);
    assert.strictEqual(receivedMessages.length, 1, 'First message should be decoded once chunk 2 arrives');
    assert.strictEqual(receivedMessages[0].cmd, 'siminfo');

    sim.onRawData(chunk3);
    assert.strictEqual(receivedMessages.length, 2, 'Second message should be decoded when chunk 3 arrives');
    assert.strictEqual(receivedMessages[1].cmd, 'playerVehicleInfo');

    assert.strictEqual(sim.status, 'connected');
    assert.strictEqual(sim.simInfo.versiond, '0.33.2.0');
    assert.strictEqual(sim.playerVehicleInfo.jbeam, 'pickup');
    assert(notifyCallCount >= 2, 'Renderer should have been notified on status changes');

    console.log('✓ Test 2: TCP streaming chunk reassembly and multiple framed messages passed.');
  }

  // Test 3: Vehicle reload command dispatch
  {
    const sentData = [];
    const mockSocket = {
      write: (buf) => {
        // Decode message from buffer
        const len = buf.readUInt32LE(4);
        const json = buf.toString('utf8', 8, 8 + len - 1);
        sentData.push(JSON.parse(json));
      }
    };

    const sim = new SimConnectionMain();
    sim.client = mockSocket;
    sim.status = 'connected';

    const result = sim.reloadActiveVehicle();
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'connected');

    // Should have sent direct reload command and Lua fallbacks
    assert(sentData.some(d => d.cmd === 'reloadVehicle'), 'Should send reloadVehicle command');
    assert(sentData.some(d => d.cmd === 'exec' && d.code && d.code.includes('extensions.core_vehicle_manager.reloadActiveVehicle')), 'Should send GE Lua reloadActiveVehicle');
    assert(sentData.some(d => d.cmd === 'exec' && d.code && d.code.includes('be:reloadVehicle')), 'Should send be:reloadVehicle fallback');

    console.log('✓ Test 3: Active vehicle reload trigger dispatch passed.');
  }

  // Test 4: Node selection in sim & malformed header protection
  {
    const sentData = [];
    const mockSocket = {
      write: (buf) => {
        const len = buf.readUInt32LE(4);
        const json = buf.toString('utf8', 8, 8 + len - 1);
        sentData.push(JSON.parse(json));
      }
    };

    const sim = new SimConnectionMain();
    sim.client = mockSocket;
    sim.status = 'connected';

    sim.selectNodes(['fl1', 'fr1', 'b1']);
    assert.strictEqual(sentData.length, 1);
    assert.deepStrictEqual(sentData[0], { cmd: 'selectNodes', nodes: ['fl1', 'fr1', 'b1'] });

    // Test malformed header handling
    const corruptBuffer = Buffer.from('XXXX1234567890');
    sim.onRawData(corruptBuffer);
    assert.strictEqual(sim.buffer.length, 0, 'Buffer should reset on invalid header');

    console.log('✓ Test 4: Sim node selection and malformed header safety passed.');
  }

  console.log('All Live BeamNG Simulation Socket tests passed!\n');
}
