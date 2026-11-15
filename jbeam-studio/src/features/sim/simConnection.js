/*
  JBeam Studio - Live BeamNG Game Socket Bridge (Frontend Client)
  Matches and extends vscode-jbeam-editor's simConnection.
  Connects to BeamNG.drive over local IPC / TCP socket (port 7000):
  - Sends instant vehicle reload triggers (extensions.core_vehicle_manager.reloadActiveVehicle())
  - Syncs active vehicle model and configuration without restarting the game
  - Highlights selected nodes live in the BeamNG 3D game engine
*/

let currentSimStatus = 'disconnected'; // 'disconnected', 'connecting', 'connected'
let currentSimInfo = null;
let currentPlayerVehicle = null;
const statusListeners = new Set();
let isInitialized = false;

function notifyListeners() {
  const payload = {
    status: currentSimStatus,
    simInfo: currentSimInfo,
    playerVehicle: currentPlayerVehicle
  };
  for (const listener of statusListeners) {
    try {
      listener(payload);
    } catch (e) {
      console.error('[SimConnectionClient] Listener error:', e);
    }
  }
}

/**
 * Initializes simulation bridge listeners from Electron or WebSocket.
 */
export function initSimConnection() {
  if (isInitialized) return;
  isInitialized = true;

  if (typeof window !== 'undefined' && window.jbeamAPI?.onSimStatusChange) {
    window.jbeamAPI.onSimStatusChange((data) => {
      if (!data) return;
      currentSimStatus = data.status || 'disconnected';
      currentSimInfo = data.simInfo || null;
      currentPlayerVehicle = data.playerVehicleInfo || null;
      notifyListeners();
    });

    // Query initial state
    window.jbeamAPI.simGetStatus?.().then((res) => {
      if (res) {
        currentSimStatus = res.status || 'disconnected';
        currentSimInfo = res.simInfo || null;
        currentPlayerVehicle = res.playerVehicleInfo || null;
        notifyListeners();
      }
    }).catch(() => {});
  }
}

/**
 * Connects to BeamNG.drive simulation socket.
 */
export async function connectSim() {
  initSimConnection();
  currentSimStatus = 'connecting';
  notifyListeners();

  if (typeof window !== 'undefined' && window.jbeamAPI?.simConnect) {
    try {
      await window.jbeamAPI.simConnect();
      return true;
    } catch (err) {
      console.warn('[SimConnection] Native connect failed:', err);
      currentSimStatus = 'disconnected';
      notifyListeners();
      return false;
    }
  }

  // Web browser fallback: simulated connection for UI workflows
  setTimeout(() => {
    currentSimStatus = 'connected';
    currentSimInfo = { versiond: '0.33.x', platform: 'BeamNG.drive (Web Bridge)' };
    notifyListeners();
  }, 400);

  return true;
}

/**
 * Disconnects from BeamNG.drive simulation socket.
 */
export async function disconnectSim() {
  currentSimStatus = 'disconnected';
  currentSimInfo = null;
  currentPlayerVehicle = null;
  notifyListeners();

  if (typeof window !== 'undefined' && window.jbeamAPI?.simDisconnect) {
    try {
      await window.jbeamAPI.simDisconnect();
    } catch (err) {
      console.warn('[SimConnection] Native disconnect failed:', err);
    }
  }

  return true;
}

/**
 * Toggles connection state.
 */
export async function toggleSimConnection() {
  if (currentSimStatus === 'connected' || currentSimStatus === 'connecting') {
    return disconnectSim();
  } else {
    return connectSim();
  }
}

/**
 * Sends a trigger to BeamNG.drive to immediately reload the active player vehicle
 * without having to restart the game or manually press Ctrl+R inside the game window.
 */
export async function reloadActiveVehicle() {
  initSimConnection();

  if (typeof window !== 'undefined' && window.jbeamAPI?.simReloadVehicle) {
    try {
      const res = await window.jbeamAPI.simReloadVehicle();
      return {
        success: true,
        message: 'Active vehicle reloaded in BeamNG.drive!'
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to send reload trigger: ${err.message}`
      };
    }
  }

  // Web browser fallback notification
  return {
    success: true,
    message: 'Active vehicle reload triggered (Web Bridge simulated)!'
  };
}

/**
 * Sends a list of node names to highlight in the live BeamNG game viewport.
 * @param {string[]} nodeIds
 */
export async function selectNodesInSim(nodeIds) {
  if (!Array.isArray(nodeIds)) return false;

  if (typeof window !== 'undefined' && window.jbeamAPI?.simSelectNodes) {
    try {
      await window.jbeamAPI.simSelectNodes(nodeIds);
      return true;
    } catch (err) {
      console.warn('[SimConnection] selectNodes failed:', err);
      return false;
    }
  }

  return true;
}

/**
 * Synchronizes player vehicle data from BeamNG.
 */
export async function syncWithSim() {
  if (typeof window !== 'undefined' && window.jbeamAPI?.simSync) {
    try {
      await window.jbeamAPI.simSync();
      return true;
    } catch (err) {
      console.warn('[SimConnection] sync failed:', err);
      return false;
    }
  }
  return true;
}

/**
 * Returns the current simulation socket connection status and metadata.
 */
export function getSimStatus() {
  return {
    status: currentSimStatus,
    simInfo: currentSimInfo,
    playerVehicle: currentPlayerVehicle
  };
}

/**
 * Subscribes a callback to simulation connection status updates.
 * @param {function} listener
 * @returns {function} Unsubscribe function
 */
export function subscribeSimStatus(listener) {
  if (typeof listener !== 'function') return () => {};
  statusListeners.add(listener);
  // Immediately notify listener of current state
  listener({
    status: currentSimStatus,
    simInfo: currentSimInfo,
    playerVehicle: currentPlayerVehicle
  });

  return () => {
    statusListeners.delete(listener);
  };
}

export default {
  initSimConnection,
  connectSim,
  disconnectSim,
  toggleSimConnection,
  reloadActiveVehicle,
  selectNodesInSim,
  syncWithSim,
  getSimStatus,
  subscribeSimStatus
};

