import React, { useState, useRef, useEffect } from 'react';
import { CloseIcon, LayersIcon } from '../../components/Icons.jsx';
import { calibrateBlueprintScale } from './blueprintManager.js';

export function BlueprintOverlayModal({
  isOpen,
  onClose,
  blueprintConfig,
  onChangeBlueprintConfig,
  activeViewPreset = 'side'
}) {
  const [selectedPlane, setSelectedPlane] = useState('side');
  const [calibrating, setCalibrating] = useState(false);
  const [calibPoints, setCalibPoints] = useState([]);
  const [calibDistance, setCalibDistance] = useState(2.85); // Default wheelbase 2.85m
  const imagePreviewRef = useRef(null);

  // Sync with current viewport camera preset if applicable
  useEffect(() => {
    if (activeViewPreset === 'front' || activeViewPreset === 'top' || activeViewPreset === 'side') {
      setSelectedPlane(activeViewPreset);
    }
  }, [activeViewPreset]);

  if (!isOpen) return null;

  const currentCfg = blueprintConfig[selectedPlane] || {};

  const handleUpdate = (updates) => {
    onChangeBlueprintConfig({
      ...blueprintConfig,
      [selectedPlane]: {
        ...currentCfg,
        ...updates
      }
    });
  };

  const handleImageFileLoad = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (!dataUrl) return;

      const img = new Image();
      img.onload = () => {
        const ar = img.width / img.height;
        handleUpdate({
          imageUrl: dataUrl,
          enabled: true,
          aspectRatio: ar,
          imageWidth: img.width,
          imageHeight: img.height
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handlePreviewClick = (e) => {
    if (!calibrating || !imagePreviewRef.current) return;
    const rect = imagePreviewRef.current.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (calibPoints.length === 0) {
      setCalibPoints([{ u, v }]);
    } else if (calibPoints.length === 1) {
      const p1 = calibPoints[0];
      const p2 = { u, v };
      setCalibPoints([p1, p2]);

      try {
        const imgW = currentCfg.imageWidth || 1000;
        const imgH = currentCfg.imageHeight || Math.round(1000 / (currentCfg.aspectRatio || 1));
        const res = calibrateBlueprintScale(p1, p2, Number(calibDistance) || 2.85, imgW, imgH, selectedPlane);

        handleUpdate({
          scale: res.scale,
          aspectRatio: res.aspectRatio,
          offset: {
            x: currentCfg.offset?.x || 0,
            y: res.centerOffset.y,
            z: res.centerOffset.z
          }
        });
        setCalibrating(false);
      } catch (err) {
        alert(err.message || 'Calibration failed');
        setCalibPoints([]);
      }
    }
  };

  return (
    <div className="blueprint-modal-backdrop" onClick={onClose}>
      <div className="blueprint-modal-window" onClick={e => e.stopPropagation()}>
        <div className="blueprint-modal-header">
          <div className="blueprint-modal-title">
            <LayersIcon size={16} />
            <span>Blueprint & Reference Tracing Studio</span>
          </div>
          <button className="blueprint-close-btn" onClick={onClose} title="Close">
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Plane Selector Tabs */}
        <div className="blueprint-plane-tabs">
          {['side', 'front', 'top'].map(plane => (
            <button
              key={plane}
              className={`blueprint-plane-tab ${selectedPlane === plane ? 'active' : ''}`}
              onClick={() => {
                setSelectedPlane(plane);
                setCalibrating(false);
                setCalibPoints([]);
              }}
            >
              <span>{plane.toUpperCase()} VIEW</span>
              {blueprintConfig[plane]?.enabled && <span className="tab-active-dot" />}
            </button>
          ))}
        </div>

        <div className="blueprint-modal-body">
          {/* Left Column: Image Preview & 2-Point Calibration Canvas */}
          <div className="blueprint-preview-pane">
            {currentCfg.imageUrl ? (
              <div
                className={`blueprint-canvas-wrapper ${calibrating ? 'calibrating' : ''}`}
                onClick={handlePreviewClick}
              >
                <img
                  ref={imagePreviewRef}
                  src={currentCfg.imageUrl}
                  alt={`${selectedPlane} blueprint`}
                  className="blueprint-preview-img"
                  style={{
                    opacity: currentCfg.opacity ?? 0.65,
                    transform: `scaleX(${currentCfg.flipX ? -1 : 1}) scaleY(${currentCfg.flipY ? -1 : 1})`
                  }}
                />
                {/* Calibration markers */}
                {calibPoints.map((pt, idx) => (
                  <div
                    key={idx}
                    className="blueprint-calib-marker"
                    style={{ left: `${pt.u * 100}%`, top: `${pt.v * 100}%` }}
                  >
                    <span className="calib-pin" />
                    <span className="calib-label">{idx === 0 ? 'Point 1' : 'Point 2'}</span>
                  </div>
                ))}
                {calibrating && (
                  <div className="blueprint-calib-hint">
                    {calibPoints.length === 0 ? 'Click Point 1 (e.g. Front Axle Hub)' : 'Click Point 2 (e.g. Rear Axle Hub)'}
                  </div>
                )}
              </div>
            ) : (
              <div className="blueprint-empty-placeholder">
                <LayersIcon size={36} style={{ opacity: 0.35, color: 'var(--text-muted)' }} />
                <p style={{ margin: '4px 0 8px 0', fontSize: 13, color: 'var(--text-muted)' }}>
                  No reference image loaded for {selectedPlane.toUpperCase()} view.
                </p>
                <label className="blueprint-file-upload-btn">
                  Choose Reference Image...
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleImageFileLoad}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Right Column: Settings, Scale, Offset, and 2-Point Calibration */}
          <div className="blueprint-controls-pane">
            <div className="blueprint-control-row toggle-row" style={{ padding: '0 2px' }}>
              <label className="blueprint-checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(currentCfg.enabled)}
                  onChange={e => handleUpdate({ enabled: e.target.checked })}
                />
                <span>Enable {selectedPlane.toUpperCase()} Blueprint</span>
              </label>

              {currentCfg.imageUrl && (
                <label className="blueprint-file-upload-btn small">
                  Replace...
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleImageFileLoad}
                  />
                </label>
              )}
            </div>

            {/* Opacity Slider */}
            <div className="blueprint-control-group" style={{ padding: '0 2px' }}>
              <div className="control-label-row">
                <span>Opacity</span>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{Math.round((currentCfg.opacity ?? 0.65) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={currentCfg.opacity ?? 0.65}
                onChange={e => handleUpdate({ opacity: parseFloat(e.target.value) })}
                className="blueprint-range-slider"
              />
            </div>

            {/* 2-Point Real-World Wheelbase Calibration */}
            <div className="blueprint-section-card">
              <div className="card-header">
                <b>2-Point Scale Calibration</b>
                <span className="sub">Real-world Metric Tracing</span>
              </div>
              <div className="control-label-row" style={{ marginTop: 10 }}>
                <span>Known Distance:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input
                    type="number"
                    step="0.05"
                    value={calibDistance}
                    onChange={e => setCalibDistance(parseFloat(e.target.value) || 2.85)}
                    className="blueprint-num-input"
                    style={{ width: 80 }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>m</span>
                </div>
              </div>
              <button
                type="button"
                className={`blueprint-action-btn ${calibrating ? 'active' : ''}`}
                style={{ marginTop: 10 }}
                onClick={() => {
                  setCalibrating(!calibrating);
                  setCalibPoints([]);
                }}
              >
                {calibrating ? 'Cancel Calibration' : 'Start 2-Point Calibration'}
              </button>
            </div>

            {/* Fine Tuning: Scale & Offsets */}
            <div className="blueprint-section-card">
              <div className="card-header">
                <b>Dimensions & Alignment</b>
              </div>
              <div className="control-label-row" style={{ marginTop: 10 }}>
                <span>Plane Width / Span:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input
                    type="number"
                    step="0.1"
                    value={Number(currentCfg.scale || 5.0).toFixed(2)}
                    onChange={e => handleUpdate({ scale: Math.max(0.1, parseFloat(e.target.value) || 5.0) })}
                    className="blueprint-num-input"
                    style={{ width: 80 }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>m</span>
                </div>
              </div>

              {/* Offset Sliders */}
              <div className="offset-inputs-grid" style={{ marginTop: 10 }}>
                <div className="offset-field">
                  <span>Offset X (m)</span>
                  <input
                    type="number"
                    step="0.05"
                    value={Number(currentCfg.offset?.x || 0).toFixed(2)}
                    onChange={e => handleUpdate({ offset: { ...currentCfg.offset, x: parseFloat(e.target.value) || 0 } })}
                    className="blueprint-num-input"
                  />
                </div>
                <div className="offset-field">
                  <span>Offset Y (m)</span>
                  <input
                    type="number"
                    step="0.05"
                    value={Number(currentCfg.offset?.y || 0).toFixed(2)}
                    onChange={e => handleUpdate({ offset: { ...currentCfg.offset, y: parseFloat(e.target.value) || 0 } })}
                    className="blueprint-num-input"
                  />
                </div>
                <div className="offset-field">
                  <span>Offset Z (m)</span>
                  <input
                    type="number"
                    step="0.05"
                    value={Number(currentCfg.offset?.z || 0).toFixed(2)}
                    onChange={e => handleUpdate({ offset: { ...currentCfg.offset, z: parseFloat(e.target.value) || 0 } })}
                    className="blueprint-num-input"
                  />
                </div>
              </div>

              {/* Flip Toggles */}
              <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                <label className="blueprint-checkbox-label">
                  <input
                    type="checkbox"
                    checked={Boolean(currentCfg.flipX)}
                    onChange={e => handleUpdate({ flipX: e.target.checked })}
                  />
                  <span>Flip Horizontal</span>
                </label>
                <label className="blueprint-checkbox-label">
                  <input
                    type="checkbox"
                    checked={Boolean(currentCfg.flipY)}
                    onChange={e => handleUpdate({ flipY: e.target.checked })}
                  />
                  <span>Flip Vertical</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BlueprintOverlayModal;

