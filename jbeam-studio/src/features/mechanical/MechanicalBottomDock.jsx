/**
 * JBeam Studio - Mechanical Bottom Dock
 * Provides interactive engineering instruments: Powertrain Flow & Integrity,
 * Dyno & Gearing Sawtooth, Live 3D Kinematics Tester (Steering + Suspension Travel),
 * and Vehicle Weight/Brake/Ride-Frequency Balance.
 */

import React, { useState, useMemo } from 'react';
import {
  calculateEngineTorqueCurve,
  calculateSawtoothCurve
} from '../powertrain/powertrainParser.js';
import {
  EngineIcon,
  GearboxIcon,
  ShaftIcon,
  PowertrainIcon,
  SlidersIcon,
  WarningIcon
} from '../../components/Icons.jsx';

export function MechanicalBottomDock({
  overview,
  selectedItem = null,
  onSelectDevice = null,
  kinematicsPreview = { steering: 0, compression: 0 },
  onPreviewKinematics = null,
  onPreviewHydroTravel = null
}) {
  const [activeTab, setActiveTab] = useState('flow'); // 'flow' | 'dyno' | 'kinematics' | 'balance'

  const steeringVal = kinematicsPreview?.steering || 0;
  const compressionVal = kinematicsPreview?.compression || 0;

  // 1. Resolve active engine specs
  const engineSpecs = useMemo(() => {
    return overview?.graph?.engineSpecs || {
      name: 'combustionEngine',
      idleRpm: 800,
      maxRpm: 6500,
      torqueCurve: [
        [0, 0],
        [1000, 180],
        [2000, 310],
        [3000, 390],
        [4000, 450],
        [5000, 460],
        [6000, 410],
        [6500, 340]
      ]
    };
  }, [overview]);

  // 2. Calculate Dyno Curve Points
  const dynoCurve = useMemo(() => {
    if (!engineSpecs?.torqueCurve) return [];
    return calculateEngineTorqueCurve(engineSpecs.torqueCurve, engineSpecs.maxRpm);
  }, [engineSpecs]);

  const peakMetrics = useMemo(() => {
    if (!dynoCurve || dynoCurve.length === 0) return { maxTorque: 0, maxHp: 0, peakTorqueRpm: 0, peakHpRpm: 0 };
    let maxT = 0;
    let tRpm = 0;
    let maxH = 0;
    let hRpm = 0;
    for (const pt of dynoCurve) {
      if (pt.torque > maxT) {
        maxT = Math.round(pt.torque);
        tRpm = pt.rpm;
      }
      if (pt.hp > maxH) {
        maxH = Math.round(pt.hp);
        hRpm = pt.rpm;
      }
    }
    return { maxTorque: maxT, peakTorqueRpm: tRpm, maxHp: maxH, peakHpRpm: hRpm };
  }, [dynoCurve]);

  // 3. Resolve Real Gearbox Ratios & Differential Final Drive
  const gearboxInfo = useMemo(() => {
    const realRatios = overview?.gearboxSpecs?.ratios;
    const realDiff = (overview?.diffSpecs || []).find(d => d.gearRatio > 0)?.gearRatio;
    const realTireR = (overview?.brakesList || []).find(b => b.radius > 0)?.radius;

    const ratios = (Array.isArray(realRatios) && realRatios.length > 0)
      ? realRatios
      : [3.82, 2.20, 1.52, 1.22, 1.00, 0.82];
    const finalDrive = realDiff || 3.73;
    const tireRadius = realTireR || 0.33;

    return {
      name: overview?.gearboxSpecs?.name || 'gearbox',
      isFallback: !(Array.isArray(realRatios) && realRatios.length > 0),
      ratios,
      finalDrive,
      tireRadius,
      maxRpm: engineSpecs?.maxRpm || 6500
    };
  }, [overview, engineSpecs]);

  const sawtoothData = useMemo(() => {
    return calculateSawtoothCurve(
      gearboxInfo.ratios,
      gearboxInfo.finalDrive,
      gearboxInfo.maxRpm,
      gearboxInfo.tireRadius
    );
  }, [gearboxInfo]);

  const handleKinematicsChange = (patch) => {
    const next = {
      steering: patch.steering !== undefined ? patch.steering : steeringVal,
      compression: patch.compression !== undefined ? patch.compression : compressionVal
    };
    if (onPreviewKinematics) onPreviewKinematics(next);
    if (patch.steering !== undefined && onPreviewHydroTravel) {
      onPreviewHydroTravel(patch.steering);
    }
  };

  // Group powertrain devices into flow stages
  const flowStages = useMemo(() => {
    const devs = overview?.devicesList || [];
    const order = ['engine', 'coupling', 'gearbox', 'shaft', 'differential', 'accessory'];
    const labels = {
      engine: 'Power Source',
      coupling: 'Clutch / TC',
      gearbox: 'Transmission',
      shaft: 'Shafts & Axles',
      differential: 'Differentials',
      accessory: 'Accessories'
    };
    return order
      .map(cat => ({
        category: cat,
        title: labels[cat],
        devices: devs.filter(d => d.category === cat)
      }))
      .filter(s => s.devices.length > 0);
  }, [overview]);

  const balance = overview?.vehicleBalance || {};
  const issues = overview?.powertrainIssues || [];

  return (
    <div className="mechanical-bottom-dock">
      {/* Tab Header Strip */}
      <div className="dock-tabs-bar">
        <div className="dock-tabs-left">
          <button
            type="button"
            className={`dock-tab-btn ${activeTab === 'flow' ? 'active' : ''}`}
            onClick={() => setActiveTab('flow')}
          >
            <PowertrainIcon size={13} />
            <span>Powertrain Flow</span>
          </button>
          <button
            type="button"
            className={`dock-tab-btn ${activeTab === 'dyno' ? 'active' : ''}`}
            onClick={() => setActiveTab('dyno')}
          >
            <EngineIcon size={13} />
            <span>Dyno & Gearing</span>
          </button>
          <button
            type="button"
            className={`dock-tab-btn ${activeTab === 'kinematics' ? 'active' : ''}`}
            onClick={() => setActiveTab('kinematics')}
          >
            <ShaftIcon size={13} />
            <span>3D Kinematics</span>
          </button>
          <button
            type="button"
            className={`dock-tab-btn ${activeTab === 'balance' ? 'active' : ''}`}
            onClick={() => setActiveTab('balance')}
          >
            <SlidersIcon size={13} />
            <span>Balance & Physics</span>
          </button>
        </div>

        {/* Quick Readout Stats */}
        <div className="dock-stats-summary">
          {activeTab === 'flow' && (
            <span className="stat-pill">
              Layout: <strong>{overview?.drivetrainLayout || 'None'}</strong> · <strong>{overview?.totalDevices || 0}</strong> Devices
            </span>
          )}
          {activeTab === 'dyno' && (
            <>
              <span className="stat-pill highlight">
                Peak: <strong>{peakMetrics.maxHp} HP</strong> @ {peakMetrics.peakHpRpm} RPM
              </span>
              <span className="stat-pill">
                <strong>{peakMetrics.maxTorque} Nm</strong> · {gearboxInfo.ratios.length}G ({gearboxInfo.finalDrive}:1)
              </span>
            </>
          )}
          {activeTab === 'kinematics' && (
            <span className="stat-pill">
              Steer: <strong>{(steeringVal * 100).toFixed(0)}%</strong> · Travel: <strong>{(compressionVal * 100).toFixed(1)} cm</strong>
            </span>
          )}
          {activeTab === 'balance' && (
            <span className="stat-pill">
              Mass: <strong>{balance.totalMassKg || 0} kg</strong> · Split: <strong>{balance.frontWeightPct ?? 50}/{balance.rearWeightPct ?? 50}%</strong>
            </span>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="dock-content-body">
        {/* TAB 1: POWERTRAIN FLOW & INTEGRITY */}
        {activeTab === 'flow' && (
          <div className="dock-flow-container">
            {issues.length > 0 && (
              <div className="dock-flow-issues">
                {issues.map((iss, idx) => (
                  <span key={idx} className={`flow-issue-pill ${iss.severity}`}>
                    <WarningIcon size={11} />
                    <span>{iss.message}</span>
                  </span>
                ))}
              </div>
            )}

            {flowStages.length === 0 ? (
              <div className="dock-empty">No powertrain chain found in current scope. Switch to Assembled or open an engine/drivetrain file.</div>
            ) : (
              <div className="dock-flow-chain">
                {flowStages.map((stage, sIdx) => (
                  <React.Fragment key={stage.category}>
                    <div className="flow-stage-col">
                      <div className="flow-stage-title">{stage.title}</div>
                      <div className="flow-stage-nodes">
                        {stage.devices.map(dev => {
                          const isBroken = dev.inputName && dev.inputName !== 'dummy' && !overview?.graph?.devices?.[dev.inputName];
                          return (
                            <button
                              key={dev.name}
                              type="button"
                              className={`flow-device-chip ${isBroken ? 'broken' : ''} ${selectedItem?.name === dev.name ? 'active' : ''}`}
                              onClick={() => onSelectDevice && onSelectDevice(dev)}
                              title={`${dev.name} (${dev.type})${dev.inputName ? ` ← ${dev.inputName}` : ''}`}
                            >
                              <span className="flow-dev-name">{dev.name}</span>
                              <span className="flow-dev-meta">{dev.inputName ? `← ${dev.inputName}` : 'root'}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {sIdx < flowStages.length - 1 && (
                      <span className="flow-stage-arrow">→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DYNO & GEARING */}
        {activeTab === 'dyno' && (
          <div className="dock-dyno-gearing-grid">
            <div className="dock-dyno-container">
              {dynoCurve.length === 0 ? (
                <div className="dock-empty">No engine torque curve data defined.</div>
              ) : (
                <div className="dyno-svg-wrapper">
                  <svg viewBox="0 0 800 115" className="dyno-svg-canvas" preserveAspectRatio="none">
                    <line x1="50" y1="15" x2="780" y2="15" stroke="#333" strokeDasharray="3 3" />
                    <line x1="50" y1="55" x2="780" y2="55" stroke="#333" strokeDasharray="3 3" />
                    <line x1="50" y1="95" x2="780" y2="95" stroke="#444" />
                    {(() => {
                      const validPoints = (dynoCurve || [])
                        .map(d => ({ rpm: Number(d.rpm), torque: Number(d.torque), hp: Number(d.hp) }))
                        .filter(d => Number.isFinite(d.rpm) && Number.isFinite(d.torque) && Number.isFinite(d.hp));
                      if (validPoints.length < 2) return null;
                      const maxRpm = Math.max(1000, ...validPoints.map(d => d.rpm));
                      const maxT = Math.max(100, ...validPoints.map(d => d.torque));
                      const maxH = Math.max(100, ...validPoints.map(d => d.hp));
                      const getX = (rpm) => (50 + (Math.max(0, rpm) / maxRpm) * 730).toFixed(1);
                      const getYT = (t) => (95 - (Math.max(0, t) / maxT) * 78).toFixed(1);
                      const getYH = (hp) => (95 - (Math.max(0, hp) / maxH) * 78).toFixed(1);
                      const pathT = validPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(pt.rpm)} ${getYT(pt.torque)}`).join(' ');
                      const pathH = validPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(pt.rpm)} ${getYH(pt.hp)}`).join(' ');
                      return (
                        <>
                          <path d={pathT} fill="none" stroke="#f59e0b" strokeWidth="2.5" />
                          <path d={pathH} fill="none" stroke="#ef4444" strokeWidth="2.5" />
                        </>
                      );
                    })()}
                  </svg>
                  <div className="dyno-legend-row">
                    <span className="legend-item"><span className="color-dot torque-dot" /> Torque (Nm)</span>
                    <span className="legend-item"><span className="color-dot hp-dot" /> Horsepower (HP)</span>
                  </div>
                </div>
              )}
            </div>

            <div className="dock-gearing-container">
              <div className="gearing-table-row">
                {gearboxInfo.ratios.map((ratio, idx) => (
                  <div key={idx} className="gear-card">
                    <span className="gear-label">G{idx + 1}</span>
                    <span className="gear-ratio-val">{ratio.toFixed(2)}</span>
                  </div>
                ))}
                <div className="gear-card highlight">
                  <span className="gear-label">Final</span>
                  <span className="gear-ratio-val">{gearboxInfo.finalDrive.toFixed(2)}</span>
                </div>
              </div>
              {Array.isArray(sawtoothData) && sawtoothData.length > 0 && (
                <svg viewBox="0 0 800 80" className="sawtooth-svg-canvas" preserveAspectRatio="none">
                  <line x1="30" y1="66" x2="780" y2="66" stroke="#444" />
                  {(() => {
                    const maxSpeed = Math.max(120, ...sawtoothData.map(g => Number(g.maxSpeedKmh) || 0));
                    const maxRpm = gearboxInfo.maxRpm || 6500;
                    const toX = (spd) => (30 + (Math.max(0, spd) / maxSpeed) * 750).toFixed(1);
                    const toY = (rpm) => (66 - (Math.max(0, rpm) / maxRpm) * 54).toFixed(1);
                    return sawtoothData.map((g, i) => {
                      const startSpd = i === 0 ? 0 : (sawtoothData[i - 1].maxSpeedKmh * (sawtoothData[i].ratio / sawtoothData[i - 1].ratio));
                      const startRpm = i === 0 ? (engineSpecs?.idleRpm || 800) : Math.min(maxRpm, (startSpd / Math.max(1, g.maxSpeedKmh)) * maxRpm);
                      return (
                        <g key={i}>
                          <line x1={toX(i === 0 ? 0 : sawtoothData[i - 1].maxSpeedKmh)} y1={toY(startRpm)} x2={toX(g.maxSpeedKmh)} y2={toY(maxRpm)} stroke="#38bdf8" strokeWidth="2" />
                          <text x={toX(g.maxSpeedKmh)} y="77" fill="#94a3b8" fontSize="9" textAnchor="middle">
                            G{i + 1} ({Math.round(g.maxSpeedKmh)})
                          </text>
                        </g>
                      );
                    });
                  })()}
                </svg>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: LIVE 3D STEERING & SUSPENSION KINEMATICS TESTER */}
        {activeTab === 'kinematics' && (
          <div className="dock-hydro-container">
            <div className="hydro-slider-panel">
              <div className="slider-controls-row">
                <span className="slider-label" style={{ minWidth: 140 }}>Steering Lock (3D):</span>
                <span className="limit-tag">Left (-100%)</span>
                <input
                  type="range"
                  min="-1.0"
                  max="1.0"
                  step="0.02"
                  value={steeringVal}
                  onChange={(e) => handleKinematicsChange({ steering: parseFloat(e.target.value) })}
                  className="hydro-range-input"
                />
                <span className="limit-tag">Right (+100%)</span>
                <button
                  type="button"
                  className="hydro-center-btn"
                  onClick={() => handleKinematicsChange({ steering: 0 })}
                >
                  Center
                </button>
              </div>

              <div className="slider-controls-row" style={{ marginTop: 8 }}>
                <span className="slider-label" style={{ minWidth: 140 }}>Suspension Travel (3D):</span>
                <span className="limit-tag">Droop (-12cm)</span>
                <input
                  type="range"
                  min="-0.12"
                  max="0.12"
                  step="0.005"
                  value={compressionVal}
                  onChange={(e) => handleKinematicsChange({ compression: parseFloat(e.target.value) })}
                  className="hydro-range-input"
                />
                <span className="limit-tag">Bump (+12cm)</span>
                <button
                  type="button"
                  className="hydro-center-btn"
                  onClick={() => handleKinematicsChange({ steering: 0, compression: 0 })}
                >
                  Reset All
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: VEHICLE WEIGHT, BRAKE BIAS & RIDE FREQUENCY BALANCE */}
        {activeTab === 'balance' && (
          <div className="dock-balance-grid">
            <div className="balance-card">
              <div className="balance-card-title">Weight Distribution</div>
              <div className="balance-card-value">
                {balance.frontWeightPct ?? 50}% F / {balance.rearWeightPct ?? 50}% R
              </div>
              <div className="balance-card-sub">Total Node Mass: {balance.totalMassKg || 0} kg</div>
            </div>

            <div className="balance-card">
              <div className="balance-card-title">Brake Bias</div>
              <div className="balance-card-value">
                {balance.frontBrakePct !== null && balance.frontBrakePct !== undefined
                  ? `${balance.frontBrakePct}% F / ${balance.rearBrakePct}% R`
                  : 'No Brake Torque'}
              </div>
              <div className="balance-card-sub">From pressureWheels brakeTorque</div>
            </div>

            <div className="balance-card">
              <div className="balance-card-title">Front Ride Freq / Damping</div>
              <div className="balance-card-value">
                {balance.frontDynamics ? `${balance.frontDynamics.freqHz} Hz · ζ ${balance.frontDynamics.dampingRatio}` : '—'}
              </div>
              <div className="balance-card-sub">
                {balance.frontDynamics ? `Avg K: ${balance.frontDynamics.springRate.toLocaleString()} N/m` : 'No front |BOUNDED springs'}
              </div>
            </div>

            <div className="balance-card">
              <div className="balance-card-title">Rear Ride Freq / Damping</div>
              <div className="balance-card-value">
                {balance.rearDynamics ? `${balance.rearDynamics.freqHz} Hz · ζ ${balance.rearDynamics.dampingRatio}` : '—'}
              </div>
              <div className="balance-card-sub">
                {balance.rearDynamics ? `Avg K: ${balance.rearDynamics.springRate.toLocaleString()} N/m` : 'No rear |BOUNDED springs'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
