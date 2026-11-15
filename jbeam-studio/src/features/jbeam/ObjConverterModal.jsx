import React, { useState } from 'react';
import { CloseIcon, FileIcon } from '../../components/Icons.jsx';
import { convertObjToJBeam, convertJBeamToObj, AXIS_PRESETS } from './objConverter.js';
import { BEAM_PRESETS } from '../viewport/JBeamViewport.jsx';

export function ObjConverterModal({
  isOpen,
  onClose,
  activePartData,
  onImportJBeamText
}) {
  const [activeTab, setActiveTab] = useState('import'); // 'import' | 'export'

  // Import options
  const [objFileText, setObjFileText] = useState('');
  const [objFileName, setObjFileName] = useState('');
  const [partName, setPartName] = useState('imported_skeleton');
  const [nodePrefix, setNodePrefix] = useState('n');
  const [nodeWeight, setNodeWeight] = useState(5.0);
  const [axisPreset, setAxisPreset] = useState('direct');
  const [scale, setScale] = useState(1.0);
  const [weldDistance, setWeldDistance] = useState(0.002);
  const [beamPreset, setBeamPreset] = useState('standard');
  const [importStatus, setImportStatus] = useState(null);

  // Export options
  const [copiedObj, setCopiedObj] = useState(false);

  if (!isOpen) return null;

  const handleFileLoad = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setObjFileName(file.name);
    const baseName = file.name.replace(/\.obj$/i, '').replace(/[^a-zA-Z0-9_]/g, '_');
    setPartName(baseName || 'imported_part');

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setObjFileText(text);
        try {
          const preview = convertObjToJBeam(text, {
            partName: baseName || 'imported_part',
            nodePrefix,
            nodeWeight,
            axisPreset,
            scale,
            weldDistance
          });
          setImportStatus(`Parsed ${preview.nodeCount} nodes, ${preview.beamCount} beams, ${preview.triangleCount} triangles`);
        } catch (err) {
          setImportStatus(`Error: ${err.message}`);
        }
      }
    };
    reader.readAsText(file);
  };

  const handlePerformImport = (asNewFile = true) => {
    if (!objFileText) return;
    try {
      const preset = BEAM_PRESETS[beamPreset]?.properties || {};
      const res = convertObjToJBeam(objFileText, {
        partName,
        nodePrefix,
        nodeWeight: Number(nodeWeight) || 5.0,
        axisPreset,
        scale: Number(scale) || 1.0,
        weldDistance: Number(weldDistance) || 0.002,
        beamProperties: preset
      });

      if (onImportJBeamText) {
        onImportJBeamText(res.jbeamText, `${partName}.jbeam`, asNewFile);
      }
      onClose();
    } catch (err) {
      alert(`Import error: ${err.message}`);
    }
  };

  const handleExportObj = () => {
    if (!activePartData) return '';
    return convertJBeamToObj(activePartData);
  };

  const handleDownloadObj = () => {
    const text = handleExportObj();
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${partName || 'skeleton'}.obj`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyObj = () => {
    const text = handleExportObj();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedObj(true);
      setTimeout(() => setCopiedObj(false), 2000);
    });
  };

  return (
    <div className="blueprint-modal-backdrop" onClick={onClose}>
      <div className="blueprint-modal-window" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div className="blueprint-modal-header">
          <div className="blueprint-modal-title">
            <FileIcon size={16} />
            <span>Wavefront OBJ ⇄ JBeam Skeleton Converter</span>
          </div>
          <button className="blueprint-close-btn" onClick={onClose} title="Close">
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Tabs: Import vs Export */}
        <div className="blueprint-plane-tabs">
          <button
            className={`blueprint-plane-tab ${activeTab === 'import' ? 'active' : ''}`}
            onClick={() => setActiveTab('import')}
          >
            <span>Import (.obj → JBeam)</span>
          </button>
          <button
            className={`blueprint-plane-tab ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveTab('export')}
          >
            <span>Export (JBeam → .obj)</span>
          </button>
        </div>

        <div className="obj-modal-body" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {activeTab === 'import' ? (
            <>
              <div className="obj-upload-card" style={{ border: '1px dashed var(--border-color)', borderRadius: 8, padding: 18, textAlign: 'center', backgroundColor: 'var(--bg-panel-alt)' }}>
                <p style={{ margin: '0 0 10px 0', fontSize: 13, color: 'var(--text-muted)' }}>
                  {objFileName ? `Loaded: ${objFileName}` : 'Select a Wavefront .OBJ file to convert into nodes & beams'}
                </p>
                <label className="blueprint-file-upload-btn">
                  Choose .OBJ File...
                  <input type="file" accept=".obj" style={{ display: 'none' }} onChange={handleFileLoad} />
                </label>
                {importStatus && (
                  <p style={{ margin: '10px 0 0 0', fontSize: 12, color: 'var(--accent-blue)', fontWeight: 500 }}>{importStatus}</p>
                )}
              </div>

              {/* Import Options Form */}
              <div className="obj-options-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Part Identifier</label>
                  <input
                    type="text"
                    value={partName}
                    onChange={e => setPartName(e.target.value)}
                    className="blueprint-num-input"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Node Prefix</label>
                  <input
                    type="text"
                    value={nodePrefix}
                    onChange={e => setNodePrefix(e.target.value)}
                    className="blueprint-num-input"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Coordinate Mapping</label>
                  <select
                    value={axisPreset}
                    onChange={e => setAxisPreset(e.target.value)}
                    className="blueprint-num-input"
                    style={{ width: '100%' }}
                  >
                    {Object.values(AXIS_PRESETS).map(ax => (
                      <option key={ax.id} value={ax.id}>{ax.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Beam Preset</label>
                  <select
                    value={beamPreset}
                    onChange={e => setBeamPreset(e.target.value)}
                    className="blueprint-num-input"
                    style={{ width: '100%' }}
                  >
                    {Object.entries(BEAM_PRESETS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Default Node Weight (kg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={nodeWeight}
                    onChange={e => setNodeWeight(parseFloat(e.target.value) || 5.0)}
                    className="blueprint-num-input"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Vertex Weld Tolerance (m)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={weldDistance}
                    onChange={e => setWeldDistance(parseFloat(e.target.value) || 0.002)}
                    className="blueprint-num-input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  className="blueprint-action-btn"
                  disabled={!objFileText}
                  onClick={() => handlePerformImport(true)}
                  style={{ width: 'auto', padding: '9px 20px' }}
                >
                  Import as New JBeam Tab
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Export Tab */}
              <div style={{ backgroundColor: 'var(--bg-panel-alt)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
                <p style={{ margin: '0 0 8px 0', fontSize: 13, color: 'var(--text-main)', fontWeight: 500 }}>
                  Export active JBeam skeleton as a 3D Wavefront .OBJ wireframe.
                </p>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Vertices are exported as <code>v</code> coordinates, beams as <code>l</code> edge elements, and triangles/quads as <code>f</code> polygon faces. You can open and model around this exact physics geometry in Blender.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  className="blueprint-file-upload-btn small"
                  onClick={handleCopyObj}
                  style={{ padding: '8px 16px', fontSize: 12 }}
                >
                  {copiedObj ? 'Copied!' : 'Copy OBJ to Clipboard'}
                </button>
                <button
                  type="button"
                  className="blueprint-action-btn"
                  onClick={handleDownloadObj}
                  style={{ width: 'auto', padding: '8px 18px' }}
                >
                  Download .OBJ File
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ObjConverterModal;

