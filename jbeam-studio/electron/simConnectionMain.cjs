/**
 * JBeam Studio - BeamNG.drive Live Simulation Socket Connection (Main Process)
 * Matches and extends vscode-jbeam-editor's simConnection.
 * Connects via Windows named pipe & TCP socket to BeamNG.drive:
 * - Sends 'beamng:v1/startToolchainServer' wakeup trigger to \\\\.\\pipe\\BEAMNGCOMMANDLISTENER
 * - Connects to TCP 127.0.0.1:7000 using 'BN01' little-endian wire protocol
 * - Sends instant vehicle reload triggers (extensions.core_vehicle_manager.reloadActiveVehicle())
 * - Synchronizes active player vehicle data and node highlights in real-time
 */

const net = require('net');

const BEAMNG_COMMAND_PIPE = '\\\\.\\pipe\\BEAMNGCOMMANDLISTENER';
const WAKEUP_MESSAGE = 'beamng:v1/startToolchainServer';
const TCP_PORT = 7000;
const TCP_HOST = '127.0.0.1';

class SimConnectionMain {
  constructor(getMainWindow) {
    this.getMainWindow = getMainWindow;
    this.client = null;
    this.buffer = Buffer.alloc(0);
    this.status = 'disconnected'; // 'disconnected', 'connecting', 'connected'
    this.simInfo = null;
    this.playerVehicleInfo = null;
    this.connectionEnabled = false;
    this.reconnectTimer = null;
    this.reconnectInterval = 1000;
    this.maxReconnectInterval = 6000;
  }

  notifyRenderer() {
    const win = this.getMainWindow && this.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('sim-status-change', {
        status: this.status,
        simInfo: this.simInfo,
        playerVehicleInfo: this.playerVehicleInfo
      });
    }
  }

  encodeMessage(data) {
    const jsonData = JSON.stringify(data);
    const messageLength = Buffer.byteLength(jsonData, 'utf8') + 1; // +1 for null char
    const messageIdentifier = 'BN01';

    const buf = Buffer.alloc(8 + messageLength);
    buf.write(messageIdentifier, 0, 'ascii');
    buf.writeUInt32LE(messageLength, 4);
    buf.write(jsonData, 8, 'utf8');
    buf.write('\0', 8 + messageLength - 1);
    return buf;
  }

  sendData(data) {
    if (!this.client || this.status !== 'connected') {
      return false;
    }
    try {
      const buffer = this.encodeMessage(data);
      this.client.write(buffer);
      return true;
    } catch (err) {
      console.error('[SimConnection] Error writing to BeamNG socket:', err);
      return false;
    }
  }

  onRawData(data) {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.buffer = Buffer.concat([this.buffer, dataBuffer]);

    while (this.buffer.length >= 8) {
      const messageIdentifier = this.buffer.toString('ascii', 0, 4);
      if (messageIdentifier !== 'BN01') {
        console.error('[SimConnection] Invalid message identifier:', messageIdentifier);
        this.buffer = Buffer.alloc(0);
        return;
      }

      const messageLength = this.buffer.readUInt32LE(4);
      if (this.buffer.length < 8 + messageLength) break;

      const message = this.buffer.toString('utf8', 8, 8 + messageLength - 1);
      this.buffer = this.buffer.slice(8 + messageLength);

      try {
        const parsed = JSON.parse(message);
        this.handleMessage(parsed);
      } catch (err) {
        console.error('[SimConnection] Exception parsing JSON message:', err);
      }
    }
  }

  handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;

    if (msg.cmd === 'siminfo') {
      this.simInfo = msg.data;
      console.log('[SimConnection] Connected to BeamNG.drive version:', this.simInfo?.versiond || 'Unknown');
      this.status = 'connected';
      this.notifyRenderer();
      this.sendData({ cmd: 'getPlayerVehicleInfo' });
    } else if (msg.cmd === 'playerVehicleInfo') {
      this.playerVehicleInfo = msg.data;
      console.log('[SimConnection] Active player vehicle:', this.playerVehicleInfo?.jbeam || 'None');
      this.notifyRenderer();
    } else if (msg.cmd === 'noPlayerVehicle') {
      this.playerVehicleInfo = null;
      this.notifyRenderer();
    }
  }

  tryWakeUpBeamNG() {
    if (!this.connectionEnabled) return;
    try {
      const pipe = net.createConnection(BEAMNG_COMMAND_PIPE);
      pipe.on('connect', () => {
        pipe.write(WAKEUP_MESSAGE);
        pipe.destroy();
      });
      pipe.on('error', () => {
        pipe.destroy();
      });
    } catch (e) {
      // Pipe not present if game is not running
    }

    if (this.connectionEnabled) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connectTcp(), 500);
    }
  }

  connectTcp() {
    if (this.client) {
      return;
    }

    this.status = 'connecting';
    this.notifyRenderer();

    const socket = new net.Socket();
    this.client = socket;
    this.buffer = Buffer.alloc(0);

    socket.connect(TCP_PORT, TCP_HOST, () => {
      this.reconnectInterval = 1000;
      this.status = 'connected';
      console.log('[SimConnection] TCP connected to BeamNG at ' + TCP_HOST + ':' + TCP_PORT);
      this.notifyRenderer();
      this.sendData({ cmd: 'ping' });
      this.sendData({ cmd: 'init' });
      this.sendData({ cmd: 'getPlayerVehicleInfo' });
    });

    socket.on('data', (raw) => {
      this.onRawData(raw);
    });

    socket.on('close', () => {
      if (this.client === socket) {
        this.client = null;
        this.buffer = Buffer.alloc(0);
        this.simInfo = null;
        this.playerVehicleInfo = null;
        this.status = this.connectionEnabled ? 'connecting' : 'disconnected';
        this.notifyRenderer();
        if (this.connectionEnabled) {
          this.attemptReconnect();
        }
      }
    });

    socket.on('error', (err) => {
      if (err.code !== 'ECONNREFUSED') {
        console.warn('[SimConnection] Socket error:', err.message);
      }
    });
  }

  attemptReconnect() {
    if (!this.connectionEnabled) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.tryWakeUpBeamNG();
    }, this.reconnectInterval);
    this.reconnectInterval = Math.min(this.reconnectInterval * 2, this.maxReconnectInterval);
  }

  connect() {
    if (this.connectionEnabled && this.status === 'connected') return true;
    this.connectionEnabled = true;
    this.reconnectInterval = 1000;
    this.status = 'connecting';
    this.notifyRenderer();
    this.tryWakeUpBeamNG();
    return true;
  }

  disconnect() {
    this.connectionEnabled = false;
    clearTimeout(this.reconnectTimer);
    if (this.client) {
      const s = this.client;
      this.client = null;
      this.buffer = Buffer.alloc(0);
      s.destroy();
    }
    this.simInfo = null;
    this.playerVehicleInfo = null;
    this.status = 'disconnected';
    this.notifyRenderer();
    return true;
  }

  reloadActiveVehicle() {
    if (this.status !== 'connected') {
      // If not connected, attempt quick connect and trigger
      this.connect();
    }

    // Send direct vehicle reload commands (covers all BeamNG versions)
    const success1 = this.sendData({ cmd: 'reloadVehicle' });
    const success2 = this.sendData({
      cmd: 'exec',
      code: 'if extensions.core_vehicle_manager then extensions.core_vehicle_manager.reloadActiveVehicle() end'
    });
    const success3 = this.sendData({
      cmd: 'exec',
      code: 'if be then be:reloadVehicle(0) end'
    });

    return {
      success: success1 || success2 || success3,
      status: this.status
    };
  }

  selectNodes(nodes) {
    if (!Array.isArray(nodes)) return false;
    return this.sendData({ cmd: 'selectNodes', nodes });
  }

  sync() {
    return this.sendData({ cmd: 'getPlayerVehicleInfo' });
  }

  getStatus() {
    return {
      status: this.status,
      simInfo: this.simInfo,
      playerVehicleInfo: this.playerVehicleInfo
    };
  }
}

function registerSimIpc(ipcMain, getMainWindow) {
  const sim = new SimConnectionMain(getMainWindow);

  ipcMain.handle('sim-connect', () => sim.connect());
  ipcMain.handle('sim-disconnect', () => sim.disconnect());
  ipcMain.handle('sim-reload-vehicle', () => sim.reloadActiveVehicle());
  ipcMain.handle('sim-select-nodes', (event, nodes) => sim.selectNodes(nodes));
  ipcMain.handle('sim-get-status', () => sim.getStatus());
  ipcMain.handle('sim-sync', () => sim.sync());

  return sim;
}

module.exports = {
  SimConnectionMain,
  registerSimIpc
};

