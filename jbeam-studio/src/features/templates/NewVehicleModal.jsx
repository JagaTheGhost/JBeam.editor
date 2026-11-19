import React, { useState } from 'react';
import { CloseIcon, FolderIcon, CubeIcon } from '../../components/Icons.jsx';
import { sanitizeVehicleId, generateVehicleModFiles } from './vehicleTemplateGenerator.js';

export function NewVehicleModal({
  isOpen,
  onClose,
  currentWorkspacePath,
  onVehicleCreated
}) {
  const [vehicleName, setVehicleName] = useState('Apex GT');
  const [vehicleId, setVehicleId] = useState('apex_gt');
  const [idTouched, setIdTouched] = useState(false);
  const [author, setAuthor] = useState('BeamModder');
  const [archetype, setArchetype] = useState('unibody'); // 'unibody' | 'truck'
  const [customFolder, setCustomFolder] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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

  const handleCreate = async () => {
    const cleanId = sanitizeVehicleId(vehicleId);
    if (!cleanId) {
      setErrorMsg('Vehicle ID must not be empty.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const files = generateVehicleModFiles({
        vehicleId: cleanId,
        vehicleName,
        author,
        archetype
      });

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
            mainJBeamPath: `${res.folderPath}/${cleanId}.jbeam`
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
          mainJBeamPath: `${cleanId}.jbeam`
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
            </div>
          </div>

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
              Generates info.json, main.materials.json, default.pc, and modular chassis/body/engine JBeam files.
            </span>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="modal-btn secondary" disabled={isSubmitting}>
            Cancel
          </button>
          <button onClick={handleCreate} className="modal-btn primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating Project...' : 'Create Vehicle Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewVehicleModal;
