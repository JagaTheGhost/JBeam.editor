import React, { useState, useEffect } from 'react';
import { CloseIcon, FolderIcon, CubeIcon } from '../../components/Icons.jsx';
import { sanitizeVehicleId, generateVehicleModFiles } from './vehicleTemplateGenerator.js';
import { extractSubmeshesFromDae, generateScaffoldingFromDae } from './daeScaffoldingGenerator.js';

export function NewVehicleModal({
  isOpen,
  onClose,
  currentWorkspacePath,
  discoveredDaeFiles = [],
  onVehicleCreated
}) {
  const [vehicleName, setVehicleName] = useState('Apex GT');
  const [vehicleId, setVehicleId] = useState('apex_gt');
  const [idTouched, setIdTouched] = useState(false);
  const [author, setAuthor] = useState('BeamModder');
  const [archetype, setArchetype] = useState('unibody'); // 'unibody' | 'truck' | 'dae'
  const [customFolder, setCustomFolder] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // DAE-to-JBeam Scaffolding State
  const [daeFileName, setDaeFileName] = useState('');
  const [daeContent, setDaeContent] = useState('');
  const [detectedSubmeshes, setDetectedSubmeshes] = useState([]);
  const [selectedSubmeshNames, setSelectedSubmeshNames] = useState(new Set());
  const [rootMeshName, setRootMeshName] = useState('');
  const [consolidateGeneric, setConsolidateGeneric] = useState(true);
  const [folderStructure, setFolderStructure] = useState('categorized'); // 'categorized' | 'parts' | 'flat'

  if (!isOpen) return null;

  const cleanId = sanitizeVehicleId(vehicleId);

  const handleNameChange = (e) => {
    const val = e.target.value;
    setVehicleName(val);
    if (!idTouched) {
      setVehicleId(sanitizeVehicleId(val));
    }
  };

  const handleIdChange = (e) => {
    setIdTouched(true);
    setVehicleId(sanitizeVehicleId(e.target.value));
  };

  const handleSelectFolder = async () => {
    if (window.jbeamAPI?.openFolderDialog) {
      try {
        const res = await window.jbeamAPI.openFolderDialog();
        if (!res.canceled && res.folderPath) {
          setCustomFolder(res.folderPath);
        }
      } catch (err) {
        console.error('Error selecting target folder:', err);
      }
    }
  };

  // Handler for parsing DAE content and extracting submeshes
  const processDaeFile = (content, fileName) => {
    try {
      const submeshes = extractSubmeshesFromDae(content);
      if (submeshes.length === 0) {
        setErrorMsg('No 3D submeshes found in the selected .DAE file.');
        return;
      }

      setDaeContent(content);
      setDaeFileName(fileName);
      setDetectedSubmeshes(submeshes);
      setSelectedSubmeshNames(new Set(submeshes.map(s => s.name)));

      // Auto-pick root mesh
      const rootCandidate = submeshes.find(s => s.isRootCandidate) || submeshes[0];
      setRootMeshName(rootCandidate.name);

      // Suggest name based on filename if untouched
      if (!idTouched) {
        const baseName = fileName.replace(/\.dae$/i, '').replace(/[-_]/g, ' ');
        const cleanTitle = baseName.charAt(0).toUpperCase() + baseName.slice(1);
        setVehicleName(cleanTitle);
        setVehicleId(sanitizeVehicleId(cleanTitle));
      }

      setErrorMsg('');
    } catch (err) {
      console.error('Error parsing DAE file:', err);
      setErrorMsg(`Failed to parse .dae file: ${err.message}`);
    }
  };

  const handleBrowseDaeFile = async () => {
    if (window.jbeamAPI?.openDaeDialog) {
      try {
        const res = await window.jbeamAPI.openDaeDialog();
        if (!res.canceled && res.content) {
          processDaeFile(res.content, res.fileName || 'model.dae');
        }
      } catch (err) {
        console.error('Error opening DAE dialog:', err);
      }
    }
  };

  const handleBrowserDaeInput = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        processDaeFile(text, file.name);
      }
    };
    reader.readAsText(file);
  };

  const handleSelectDiscoveredDae = async (e) => {
    const filePath = e.target.value;
    if (!filePath) return;

    const matched = (discoveredDaeFiles || []).find(d => 
      (typeof d === 'string' ? d === filePath : d?.path === filePath)
    );
    const fileName = (typeof matched === 'object' && matched?.name)
      ? matched.name
      : (typeof filePath === 'string' ? filePath.split(/[\\/]/).pop() || 'model.dae' : 'model.dae');

    if (matched?.content) {
      processDaeFile(matched.content, fileName);
      return;
    }

    if (matched?.browserFile) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (typeof ev.target?.result === 'string') {
          processDaeFile(ev.target.result, fileName);
        }
      };
      reader.readAsText(matched.browserFile);
      return;
    }

    if (window.jbeamAPI?.readFile) {
      try {
        const res = await window.jbeamAPI.readFile(filePath);
        if (res.success && res.content) {
          processDaeFile(res.content, fileName);
        }
      } catch (err) {
        console.error('Error reading workspace DAE:', err);
      }
    }
  };

  const handleToggleSubmesh = (name) => {
    setSelectedSubmeshNames(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleToggleAllSubmeshes = (selectAll) => {
    if (selectAll) {
      setSelectedSubmeshNames(new Set(detectedSubmeshes.map(s => s.name)));
    } else {
      setSelectedSubmeshNames(new Set([rootMeshName]));
    }
  };

  const handleCreate = async () => {
    const cleanId = sanitizeVehicleId(vehicleId);
    if (!cleanId) {
      setErrorMsg('Vehicle ID must not be empty.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      let files = {};

      if (archetype === 'dae') {
        if (!daeContent) {
          setErrorMsg('Please select a 3D .DAE Collada model to generate scaffolding.');
          setIsSubmitting(false);
          return;
        }

        const selectedList = Array.from(selectedSubmeshNames);
        if (selectedList.length === 0) {
          setErrorMsg('Please select at least one submesh part to scaffold.');
          setIsSubmitting(false);
          return;
        }

        // Generate scaffolding mapped to exact flexbodies
        const scaffoldResult = generateScaffoldingFromDae({
          daeContent,
          daeFileName: daeFileName || `${cleanId}.dae`,
          vehicleId: cleanId,
          vehicleName,
          author,
          rootMeshName,
          selectedSubmeshes: selectedList,
          consolidateGenericMeshes: consolidateGeneric,
          folderStructure
        });

        files = {
          ...scaffoldResult.files,
          [daeFileName || `${cleanId}.dae`]: daeContent
        };
      } else {
        files = generateVehicleModFiles({
          vehicleId: cleanId,
          vehicleName,
          author,
          archetype
        });
      }

      // Destination directory:
      let targetDir = customFolder;
      if (!targetDir && currentWorkspacePath) {
        targetDir = `${currentWorkspacePath}/${cleanId}`;
      }
      if (!targetDir) {
        targetDir = cleanId;
      }

      if (window.jbeamAPI?.createVehicleProject) {
        const res = await window.jbeamAPI.createVehicleProject({ targetDir, files });
        if (res.success) {
          onVehicleCreated({
            folderPath: res.folderPath,
            files: res.files,
            vehicleId: cleanId,
            mainJBeamContent: files[`${cleanId}.jbeam`],
            mainJBeamPath: `${res.folderPath}/${cleanId}.jbeam`,
            daeContent: archetype === 'dae' ? daeContent : null,
            daeFileName: archetype === 'dae' ? (daeFileName || `${cleanId}.dae`) : null
          });
          onClose();
        } else {
          setErrorMsg(res.error || 'Failed to create vehicle files.');
        }
      } else {
        // Browser fallback: notify parent with simulated files
        onVehicleCreated({
          folderPath: targetDir,
          files: Object.keys(files).map(name => ({
            name,
            path: `${targetDir}/${name}`,
            isDirectory: false,
            isJBeam: name.endsWith('.jbeam'),
            isJson: name.endsWith('.json') || name.endsWith('.pc'),
            content: files[name]
          })),
          vehicleId: cleanId,
          mainJBeamContent: files[`${cleanId}.jbeam`],
          mainJBeamPath: `${cleanId}.jbeam`,
          daeContent: archetype === 'dae' ? daeContent : null,
          daeFileName: archetype === 'dae' ? (daeFileName || `${cleanId}.dae`) : null
        });
        onClose();
      }
    } catch (err) {
      console.error('Error creating vehicle project:', err);
      setErrorMsg(err.message || 'An error occurred while creating the vehicle.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container vehicle-wizard-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <div className="modal-title-row">
            <CubeIcon size={18} className="modal-icon" />
            <h3 className="modal-title">New Vehicle Mod Project</h3>
          </div>
          <button onClick={onClose} className="modal-close-btn" title="Close">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {errorMsg && (
            <div className="modal-error-banner">
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="wizard-form-group">
            <label>Vehicle Display Name:</label>
            <input
              type="text"
              value={vehicleName}
              onChange={handleNameChange}
              placeholder="e.g. Apex GT, Thunder 4x4"
              className="wizard-input"
            />
            <span className="field-hint">The in-game name shown in the BeamNG vehicle selector.</span>
          </div>

          <div className="wizard-form-group">
            <label>Internal Vehicle ID (Folder Name):</label>
            <input
              type="text"
              value={vehicleId}
              onChange={handleIdChange}
              placeholder="e.g. apex_gt"
              className="wizard-input"
            />
            <span className="field-hint">Unique lowercase identifier used for JBeam slot types, parts, and folders.</span>
          </div>

          <div className="wizard-form-group">
            <label>Author / Modder Name:</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Your modding moniker"
              className="wizard-input"
            />
          </div>

          <div className="wizard-form-group">
            <label>Scaffolding Archetype:</label>
            <div className="archetype-selector">
              <label className={`archetype-card ${archetype === 'unibody' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="archetype"
                  value="unibody"
                  checked={archetype === 'unibody'}
                  onChange={() => setArchetype('unibody')}
                />
                <div className="archetype-info">
                  <strong>Unibody Car (Sports / Sedan)</strong>
                  <span>Standard 2.6m wheelbase, fully triangulated rigid body shell and independent suspension.</span>
                </div>
              </label>

              <label className={`archetype-card ${archetype === 'truck' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="archetype"
                  value="truck"
                  checked={archetype === 'truck'}
                  onChange={() => setArchetype('truck')}
                />
                <div className="archetype-info">
                  <strong>Body-on-Frame (Truck / Offroad)</strong>
                  <span>Heavy-duty ladder frame rails with solid chassis mounts and high ground clearance.</span>
                </div>
              </label>

              <label className={`archetype-card ${archetype === 'dae' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="archetype"
                  value="dae"
                  checked={archetype === 'dae'}
                  onChange={() => setArchetype('dae')}
                />
                <div className="archetype-info">
                  <strong>From 3D Model (.DAE Collada)</strong>
                  <span>Map named submeshes (hood, doors, cab) directly into modular JBeam flexbody files.</span>
                </div>
              </label>
            </div>
          </div>

          {/* DAE Model Scaffolding Configuration Section */}
          {archetype === 'dae' && (
            <div className="dae-scaffolding-box" style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '6px',
              padding: '12px',
              marginTop: '10px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ fontSize: '13px', color: '#93c5fd' }}>3D Collada Model (.DAE) Source</strong>
                {daeFileName && <span style={{ fontSize: '11px', color: '#10b981' }}>Loaded: {daeFileName}</span>}
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={handleBrowseDaeFile}
                  className="folder-picker-btn"
                  style={{ background: '#2563eb', borderColor: '#3b82f6' }}
                >
                  <FolderIcon size={14} />
                  <span>Choose .DAE File...</span>
                </button>

                <label className="folder-picker-btn" style={{ cursor: 'pointer' }}>
                  <span>Upload .DAE</span>
                  <input
                    type="file"
                    accept=".dae"
                    onChange={handleBrowserDaeInput}
                    style={{ display: 'none' }}
                  />
                </label>

                {discoveredDaeFiles && discoveredDaeFiles.length > 0 && (
                  <select
                    className="wizard-input"
                    style={{ flex: 1, padding: '6px 8px', fontSize: '12px' }}
                    onChange={handleSelectDiscoveredDae}
                    defaultValue=""
                  >
                    <option value="" disabled>Workspace .dae files...</option>
                    {discoveredDaeFiles.map((item, idx) => {
                      const filePath = typeof item === 'string' ? item : item?.path || '';
                      const fileName = typeof item === 'string'
                        ? (item.split(/[\\/]/).pop() || item)
                        : (item?.name || (filePath ? filePath.split(/[\\/]/).pop() : `Model ${idx + 1}`));
                      return (
                        <option key={filePath || idx} value={filePath}>
                          {fileName}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              {detectedSubmeshes.length > 0 && (
                <div className="detected-submeshes-area" style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>
                      Detected Submeshes ({selectedSubmeshNames.size} of {detectedSubmeshes.length} selected):
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleAllSubmeshes(true)}
                        style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '11px' }}
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleAllSubmeshes(false)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '11px' }}
                      >
                        Root Only
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>
                      Root Body / Chassis Mesh (declares slots for other parts):
                    </label>
                    <select
                      value={rootMeshName}
                      onChange={(e) => setRootMeshName(e.target.value)}
                      className="wizard-input"
                      style={{ width: '100%', padding: '6px 8px', fontSize: '12px' }}
                    >
                      {detectedSubmeshes.map(s => (
                        <option key={s.name} value={s.name}>
                          {s.name} ({s.label}) {s.isRootCandidate ? '[Root Candidate]' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{
                    maxHeight: '140px',
                    overflowY: 'auto',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    padding: '6px 8px'
                  }}>
                    {detectedSubmeshes.map(s => {
                      const isRoot = s.name === rootMeshName;
                      const isChecked = isRoot || selectedSubmeshNames.has(s.name);
                      return (
                        <label
                          key={s.name}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '4px 6px',
                            cursor: isRoot ? 'default' : 'pointer',
                            borderRadius: '3px',
                            background: isChecked ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                            fontSize: '11px',
                            marginBottom: '2px'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isRoot}
                            onChange={() => handleToggleSubmesh(s.name)}
                          />
                          <span style={{ fontWeight: 600, color: isRoot ? '#93c5fd' : '#f1f5f9' }}>
                            {s.name}
                          </span>
                          <span style={{
                            padding: '1px 5px',
                            background: isRoot ? '#1e3a8a' : 'rgba(255, 255, 255, 0.08)',
                            color: isRoot ? '#bfdbfe' : '#94a3b8',
                            borderRadius: '3px',
                            fontSize: '10px'
                          }}>
                            {isRoot ? 'ROOT CHASSIS' : s.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#cbd5e1', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={consolidateGeneric}
                        onChange={(e) => setConsolidateGeneric(e.target.checked)}
                      />
                      <span>Auto-consolidate generic mesh fragments (Mesh_xxx, Cylinder_xxx) into Body Shell flexbody</span>
                    </label>
                    <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: '#cbd5e1' }}>
                      <span style={{ fontWeight: 600, color: '#94a3b8' }}>Directory Layout:</span>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="folderStructure"
                            value="categorized"
                            checked={folderStructure === 'categorized'}
                            onChange={() => setFolderStructure('categorized')}
                          />
                          <span>Categorized Subfolders (<code>bumpers/front</code>, <code>doors</code>, <code>suspension</code>, etc.)</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="folderStructure"
                            value="parts"
                            checked={folderStructure === 'parts'}
                            onChange={() => setFolderStructure('parts')}
                          />
                          <span>Single <code>parts/</code> subfolder</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="folderStructure"
                            value="flat"
                            checked={folderStructure === 'flat'}
                            onChange={() => setFolderStructure('flat')}
                          />
                          <span>Flat Root</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="wizard-form-group" style={{ marginTop: '14px' }}>
            <label>Destination Directory:</label>
            <div className="folder-picker-row">
              <input
                type="text"
                readOnly
                value={customFolder || (currentWorkspacePath ? `${currentWorkspacePath}\\${vehicleId}` : vehicleId)}
                className="wizard-input folder-path-input"
              />
              <button
                type="button"
                onClick={handleSelectFolder}
                className="folder-picker-btn"
                title="Browse Destination Folder"
              >
                <FolderIcon size={14} />
                <span>Browse...</span>
              </button>
            </div>
            <span className="field-hint">
              {archetype === 'dae'
                ? `Will scaffold ${selectedSubmeshNames.size || 'modular'} .jbeam files with exact flexbody bindings, ${cleanId || 'vehicle'}.dae, info.json, and default.pc.`
                : 'Generates info.json, main.materials.json, default.pc, and modular chassis/body/engine JBeam files.'
              }
            </span>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="modal-btn secondary" disabled={isSubmitting}>
            Cancel
          </button>
          <button onClick={handleCreate} className="modal-btn primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating Project...' : (archetype === 'dae' ? 'Scaffold DAE Vehicle' : 'Create Vehicle Project')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewVehicleModal;
