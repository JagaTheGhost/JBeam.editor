import React, { useState, useRef, useEffect } from 'react';
import {
  FolderIcon,
  FileIcon,
  FilePlusIcon,
  FolderPlusIcon,
  NewVehicleIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CloseIcon
} from '../../components/Icons.jsx';

export function ProjectExplorer({
  workspacePath,
  files = [],
  activeFilePath,
  onOpenFile,
  onOpenFolderDialog,
  onOpenFileDialog,
  onCloseFolder,
  onNewVehicle,
  onCreateFile,
  onCreateFolder
}) {
  const [expandedFolders, setExpandedFolders] = useState({});
  const [inlineCreateType, setInlineCreateType] = useState(null); // 'file' | 'folder' | null
  const [newItemName, setNewItemName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (inlineCreateType && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [inlineCreateType]);

  const toggleFolder = (path) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleStartCreateFile = (e) => {
    e?.stopPropagation();
    setInlineCreateType('file');
    setNewItemName('');
  };

  const handleStartCreateFolder = (e) => {
    e?.stopPropagation();
    setInlineCreateType('folder');
    setNewItemName('');
  };

  const handleCancelCreate = () => {
    setInlineCreateType(null);
    setNewItemName('');
  };

  const handleCommitCreate = () => {
    const val = newItemName.trim();
    if (!val) {
      handleCancelCreate();
      return;
    }
    if (inlineCreateType === 'file' && onCreateFile) {
      onCreateFile(val);
    } else if (inlineCreateType === 'folder' && onCreateFolder) {
      onCreateFolder(val);
    }
    handleCancelCreate();
  };

  const renderTree = (items) => {
    if (!items || items.length === 0) return null;

    return items.map((item) => {
      if (item.isDirectory) {
        const isExpanded = expandedFolders[item.path] !== false; // default expanded
        return (
          <div key={item.path} className="explorer-folder">
            <div
              className="explorer-row explorer-folder-row"
              onClick={() => toggleFolder(item.path)}
            >
              <span className="arrow">
                {isExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
              </span>
              <FolderIcon size={14} className="folder-icon" />
              <span className="item-name">{item.name}</span>
            </div>
            {isExpanded && (
              <div className="explorer-subfolder">
                {renderTree(item.children || [])}
              </div>
            )}
          </div>
        );
      } else {
        const isJBeam = item.name.endsWith('.jbeam');
        const isActive = activeFilePath === item.path;
        return (
          <div
            key={item.path}
            className={`explorer-row explorer-file-row ${isActive ? 'active' : ''}`}
            onClick={() => onOpenFile(item.path)}
            title={item.path}
          >
            <FileIcon size={13} className={`file-icon ${isJBeam ? 'jbeam-file' : ''}`} />
            <span className={`item-name ${isJBeam ? 'jbeam-name' : ''}`}>{item.name}</span>
          </div>
        );
      }
    });
  };

  const folderName = workspacePath ? workspacePath.split(/[\\/]/).filter(Boolean).pop() : null;

  return (
    <div className="project-explorer">
      {/* Explorer Header */}
      <div className="explorer-header">
        <span className="explorer-title" title={workspacePath || 'No Folder Opened'}>
          {folderName ? folderName.toUpperCase() : 'NO FOLDER OPENED'}
        </span>
        <div className="explorer-actions">
          {workspacePath ? (
            <>
              <button
                type="button"
                onClick={handleStartCreateFile}
                className="action-btn"
                title="New File in Current Workspace"
              >
                <FilePlusIcon size={16} />
              </button>
              <button
                type="button"
                onClick={handleStartCreateFolder}
                className="action-btn"
                title="New Folder in Current Workspace"
              >
                <FolderPlusIcon size={16} />
              </button>
              {onCloseFolder && (
                <button
                  type="button"
                  onClick={onCloseFolder}
                  className="action-btn close-folder-btn"
                  title="Close Workspace Folder"
                >
                  <CloseIcon size={14} />
                </button>
              )}
            </>
          ) : (
            <>
              {onNewVehicle && (
                <button
                  type="button"
                  onClick={onNewVehicle}
                  className="action-btn"
                  title="Create New Vehicle Mod Project"
                >
                  <NewVehicleIcon size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={onOpenFolderDialog}
                className="action-btn"
                title="Open Workspace Folder..."
              >
                <FolderIcon size={15} />
              </button>
              <button
                type="button"
                onClick={onOpenFileDialog}
                className="action-btn"
                title="Open Individual JBeam File..."
              >
                <FileIcon size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline Create Input Row (New File / New Folder) */}
      {inlineCreateType && (
        <div className="explorer-inline-create-box">
          <div className="explorer-inline-create-row">
            {inlineCreateType === 'folder' ? (
              <FolderIcon size={14} className="folder-icon" />
            ) : (
              <FileIcon size={13} className="file-icon jbeam-file" />
            )}
            <input
              ref={inputRef}
              type="text"
              className="explorer-inline-create-input"
              value={newItemName}
              placeholder={inlineCreateType === 'folder' ? 'folder_name' : 'new_part.jbeam'}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCommitCreate();
                if (e.key === 'Escape') handleCancelCreate();
              }}
              onBlur={handleCommitCreate}
            />
          </div>
          <span className="explorer-inline-hint">Press Enter to create, Esc to cancel</span>
        </div>
      )}

      {/* Explorer Tree or Empty Workspace State */}
      <div className="explorer-tree">
        {files && files.length > 0 ? (
          renderTree(files)
        ) : (
          <div className="empty-workspace-card">
            <div className="empty-workspace-icon-wrap">
              <FolderIcon size={32} />
            </div>
            <h4 className="empty-workspace-heading">No Folder Opened</h4>
            <p className="empty-workspace-sub">
              Open an existing BeamNG mod directory or scaffold a new vehicle project.
            </p>
            <div className="empty-workspace-actions">
              <button
                type="button"
                onClick={onOpenFolderDialog}
                className="bng-explorer-btn primary"
                title="Open a local mod workspace directory"
              >
                <FolderIcon size={14} />
                <span>Open Folder</span>
              </button>
              {onNewVehicle && (
                <button
                  type="button"
                  onClick={onNewVehicle}
                  className="bng-explorer-btn secondary"
                  title="Scaffold a new BeamNG vehicle project from templates or DAE model"
                >
                  <NewVehicleIcon size={14} />
                  <span>New Vehicle Mod...</span>
                </button>
              )}
              <button
                type="button"
                onClick={onOpenFileDialog}
                className="bng-explorer-btn tertiary"
                title="Open a single JBeam file"
              >
                <FileIcon size={14} />
                <span>Open Single File...</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectExplorer;
