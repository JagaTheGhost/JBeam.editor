/**
 * JBeam Studio - Mechanical Bottom Dock
 * Provides interactive engineering instruments: Dyno & Torque Curves,
 * Transmission Gearing Sawtooth calculator, and Steering Hydro testing.
 */

import React, { useState, useMemo } from 'react';
import {
  calculateEngineTorqueCurve,
  calculateGearShiftDrops,
  calculateSawtoothCurve
} from '../powertrain/powertrainParser.js';
import {
  EngineIcon,
  GearboxIcon,
  ShaftIcon
} from '../../components/Icons.jsx';

export function MechanicalBottomDock({
  overview,
  selectedItem = null,
  onApplyRatioUpdate = null,
  onPreviewHydroTravel = null
}) {
  const [activeTab, setActiveTab] = useState('dyno'); // 'dyno' | 'gearing' | 'hydro'
  const [hydroSliderVal, setHydroSliderVal] = useState(0); // -1.0 to 1.0

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

  // Peak metrics
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

  // 3. Resolve Gearbox Ratios
  const gearboxInfo = useMemo(() => {
    const devices = overview?.devicesList || [];
    const gb = devices.find(d => d.category === 'gearbox');
    const diff = devices.find(d => d.category === 'differential');
    const defaultRatios = [3.82, 2.20, 1.52, 1.22, 1.00, 0.82];
    const defaultDiff = 3.73;

    return {
      name: gb ? gb.name : 'gearbox',
      ratios: defaultRatios,
      finalDrive: defaultDiff,
      maxRpm: engineSpecs?.maxRpm || 6500
    };
  }, [overview, engineSpecs]);

  // 4. Calculate Shift Drops & Sawtooth
  const sawtoothData = useMemo(() => {
    return calculateSawtoothCurve(
      gearboxInfo.ratios,
      gearboxInfo.finalDrive,
      gearboxInfo.maxRpm,
      0.31 // 31cm tire radius standard
    );
  }, [gearboxInfo]);

  const handleHydroChange = (val) => {
    setHydroSliderVal(val);
    if (onPreviewHydroTravel) {
      onPreviewHydroTravel(val);
    }
  };

  return (
    <div className="mechanical-bottom-dock">
      {/* Tab Header Strip */}
      <div className="dock-tabs-bar">
        <div className="dock-tabs-left">
          <button
            type="button"
            className={`dock-tab-btn ${activeTab === 'dyno' ? 'active' : ''}`}
            onClick={() => setActiveTab('dyno')}
          >
            <EngineIcon size={13} />
            <span>Dyno & Torque Curve</span>
          </button>
          <button
            type="button"
            className={`dock-tab-btn ${activeTab === 'gearing' ? 'active' : ''}`}
            onClick={() => setActiveTab('gearing')}
          >
            <GearboxIcon size={13} />
            <span>Gearing & Sawtooth</span>
          </button>
          <button
            type="button"
            className={`dock-tab-btn ${activeTab === 'hydro' ? 'active' : ''}`}
            onClick={() => setActiveTab('hydro')}
          >
            <ShaftIcon size={13} />
            <span>Steering Kinematics</span>
          </button>
        </div>

        {/* Quick Readout Stats */}
        <div className="dock-stats-summary">
          {activeTab === 'dyno' && (
            <>
              <span className="stat-pill highlight">
                Peak: <strong>{peakMetrics.maxHp} HP</strong> @ {peakMetrics.peakHpRpm} RPM
              </span>
              <span className="stat-pill">
                Torque: <strong>{peakMetrics.maxTorque} Nm</strong> @ {peakMetrics.peakTorqueRpm} RPM
              </span>
            </>
          )}
          {activeTab === 'gearing' && (
            <span className="stat-pill">
              Fwd Gears: <strong>{gearboxInfo.ratios.length}</strong> | Final Drive: <strong>{gearboxInfo.finalDrive}:1</strong>
            </span>
          )}
          {activeTab === 'hydro' && (
            <span className="stat-pill">
              Rack Position: <strong>{(hydroSliderVal * 100).toFixed(0)}%</strong>
            </span>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="dock-content-body">
        {/* TAB 1: DYNO & TORQUE */}
        {activeTab === 'dyno' && (
          <div className="dock-dyno-container">
            {dynoCurve.length === 0 ? (
              <div className="dock-empty">No engine torque curve data defined.</div>
            ) : (
              <div className="dyno-svg-wrapper">
                <svg viewBox="0 0 800 130" className="dyno-svg-canvas" preserveAspectRatio="none">
                  {/* Grid lines */}
                  <line x1="50" y1="20" x2="780" y2="20" stroke="#333" strokeDasharray="3 3" />
                  <line x1="50" y1="65" x2="780" y2="65" stroke="#333" strokeDasharray="3 3" />
                  <line x1="50" y1="110" x2="780" y2="110" stroke="#444" />

                  {/* Dyno Curves */}
                  {(() => {
                    const validPoints = (dynoCurve || [])
                      .map(d => ({
                        rpm: Number(d.rpm),
                        torque: Number(d.torque),
                        hp: Number(d.hp)
                      }))
                      .filter(d => Number.isFinite(d.rpm) && Number.isFinite(d.torque) && Number.isFinite(d.hp));

                    if (validPoints.length < 2) {
                      return null;
                    }

                    const rawMaxRpm = Math.max(...validPoints.map(d => d.rpm));
                    const rawMaxT = Math.max(...validPoints.map(d => d.torque));
                    const rawMaxH = Math.max(...validPoints.map(d => d.hp));

                    const maxRpm = Number.isFinite(rawMaxRpm) && rawMaxRpm > 0 ? rawMaxRpm : 7000;
                    const maxT = Number.isFinite(rawMaxT) && rawMaxT > 0 ? rawMaxT : 500;
                    const maxH = Number.isFinite(rawMaxH) && rawMaxH > 0 ? rawMaxH : 400;

                    const getX = (rpm) => {
                      const v = 50 + (Math.max(0, Number(rpm) || 0) / maxRpm) * 730;
                      return Number.isFinite(v) ? v.toFixed(1) : '50';
                    };
                    const getYTorque = (t) => {
                      const v = 110 - (Math.max(0, Number(t) || 0) / maxT) * 90;
                      return Number.isFinite(v) ? v.toFixed(1) : '110';
                    };
                    const getYHp = (hp) => {
                      const v = 110 - (Math.max(0, Number(hp) || 0) / maxH) * 90;
                      return Number.isFinite(v) ? v.toFixed(1) : '110';
                    };

                    let pathTorque = '';
                    let pathHp = '';

                    validPoints.forEach((pt, i) => {
                      const x = getX(pt.rpm);
                      const yT = getYTorque(pt.torque);
                      const yH = getYHp(pt.hp);
                      if (i === 0) {
                        pathTorque += `M ${x} ${yT}`;
                        pathHp += `M ${x} ${yH}`;
                      } else {
                        pathTorque += ` L ${x} ${yT}`;
                        pathHp += ` L ${x} ${yH}`;
                      }
                    });

                    return (
                      <>
                        <path d={pathTorque} fill="none" stroke="#f59e0b" strokeWidth="2.5" />
                        <path d={pathHp} fill="none" stroke="#ef4444" strokeWidth="2.5" />
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
        )}

        {/* TAB 2: GEARING & SAWTOOTH */}
        {activeTab === 'gearing' && (
          <div className="dock-gearing-container">
            <div className="gearing-table-row">
              {gearboxInfo.ratios.map((ratio, idx) => (
                <div key={idx} className="gear-card">
                  <span className="gear-label">Gear {idx + 1}</span>
                  <span className="gear-ratio-val">{ratio.toFixed(2)}:1</span>
                </div>
              ))}
              <div className="gear-card highlight">
                <span className="gear-label">Final Drive</span>
                <span className="gear-ratio-val">{gearboxInfo.finalDrive.toFixed(2)}:1</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: STEERING KINEMATICS */}
        {activeTab === 'hydro' && (
          <div className="dock-hydro-container">
            <div className="hydro-slider-panel">
              <span className="slider-label">Steering Angle Travel (Live 3D Test):</span>
              <div className="slider-controls-row">
                <span className="limit-tag">Full Left (-1.0)</span>
                <input
                  type="range"
                  min="-1.0"
                  max="1.0"
                  step="0.02"
                  value={hydroSliderVal}
                  onChange={(e) => handleHydroChange(parseFloat(e.target.value))}
                  className="hydro-range-input"
                />
                <span className="limit-tag">Full Right (+1.0)</span>
                <button
                  type="button"
                  className="hydro-center-btn"
                  onClick={() => handleHydroChange(0)}
                  title="Center Steering Rack"
                >
                  Center (0)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
