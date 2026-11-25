import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FolderIcon,
  FileIcon,
  FilePlusIcon,
  FolderPlusIcon,
  NewVehicleIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CloseIcon,
  CubeIcon,
  SlidersIcon,
  CodeIcon,
  SearchIcon
} from '../../components/Icons.jsx';

function getFileVisualMeta(fileName) {
  const lower = String(fileName || '').toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop() : '';

  switch (ext) {
    case 'jbeam':
      return { kind: 'jbeam', badge: 'JB', extLabel: 'jbeam', color: '#38bdf8', nameClass: 'jbeam-name' };
    case 'dae':
      return { kind: 'dae', badge: '3D', extLabel: 'dae', color: '#f59e0b', nameClass: 'dae-name' };
    case 'pc':
      return { kind: 'pc', badge: 'PC', extLabel: 'config', color: '#34d399', nameClass: 'pc-name' };
    case 'json':
      return { kind: 'json', badge: '{}', extLabel: 'json', color: '#fbbf24', nameClass: 'json-name' };
    case 'html':
    case 'htm':
      return { kind: 'html', badge: '</>', extLabel: 'html', color: '#fb7185', nameClass: 'html-name' };
    case 'css':
    case 'scss':
      return { kind: 'css', badge: '#', extLabel: ext, color: '#60a5fa', nameClass: 'css-name' };
    case 'js':
    case 'ts':
    case 'lua':
      return { kind: 'script', badge: ext.toUpperCase(), extLabel: ext, color: '#a78bfa', nameClass: 'script-name' };
    case 'dds':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
      return { kind: 'image', badge: 'IMG', extLabel: ext, color: '#2dd4bf', nameClass: 'image-name' };
    default:
      return { kind: 'other', badge: null, extLabel: ext || '', color: '#94a3b8', nameClass: '' };
  }
}

function getFolderColor(folderName) {
  const lower = String(folderName || '').toLowerCase();
  if (lower.includes('jbeam') || lower === 'vehicles') return '#38bdf8';
  if (lower === 'common') return '#34d399';
  if (lower.includes('input') || lower.includes('config')) return '#fbbf24';
  if (lower.includes('gauge') || lower.includes('ui') || lower.includes('html')) return '#fb7185';
  if (lower.includes('art') || lower.includes('tex') || lower.includes('mat')) return '#a78bfa';
  return '#eab308';
}

function renderFileTypeIcon(meta) {
  if (meta.kind === 'dae') {
    return <CubeIcon size={13} className="file-icon" style={{ color: meta.color }} />;
  }
  if (meta.kind === 'pc') {
    return <SlidersIcon size={13} className="file-icon" style={{ color: meta.color }} />;
  }
  if (meta.kind === 'html' || meta.kind === 'script') {
    return <CodeIcon size={13} className="file-icon" style={{ color: meta.color }} />;
  }
  if (meta.badge) {
    return (
      <span
        className="explorer-ext-badge"
        style={{
          color: meta.color,
          borderColor: `${meta.color}44`,
          backgroundColor: `${meta.color}18`
        }}
      >
        {meta.badge}
      </span>
    );
  }
  return <FileIcon size={13} className="file-icon" style={{ color: meta.color }} />;
}

function FolderGlyph({ isOpen, color }) {
  if (isOpen) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="folder-icon">
        <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
      </svg>
    );
  }
  return <FolderIcon size={14} className="folder-icon" style={{ color }} />;
}

function filterFileTree(items, query) {
  if (!query) return items;
  const q = query.toLowerCase();
  const out = [];
  for (const item of items) {
    if (item.isDirectory) {
      const folderMatch = item.name.toLowerCase().includes(q);
      const children = folderMatch ? (item.children || []) : filterFileTree(item.children || [], query);
      if (folderMatch || children.length > 0) {
        out.push({ ...item, children });
      }
    } else if (item.name.toLowerCase().includes(q)) {
      out.push(item);
    }
  }
  return out;
}

function collectFolderPaths(items, out = []) {
  for (const item of items || []) {
    if (item.isDirectory) {
      out.push(item.path);
      collectFolderPaths(item.children, out);
    }
  }
  return out;
}

export function ProjectExplorer({
  workspacePath,
  files = [],
  activeFilePath,
  openFilePaths = [],
  onOpenFile,
  onOpenFolderDialog,
  onOpenFileDialog,
  onCloseFolder,
  onNewVehicle,
  onCreateFile,
  onCreateFolder
}) {
  const [expandedFolders, setExpandedFolders] = useState({});
  const [stayInFiles, setStayInFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inlineCreateType, setInlineCreateType] = useState(null); // 'file' | 'folder' | null
  const [newItemName, setNewItemName] = useState('');
  const inputRef = useRef(null);

  const openPathSet = useMemo(() => {
    const set = new Set();
    for (const p of openFilePaths || []) {
      if (p) set.add(String(p).replace(/\\/g, '/').toLowerCase());
    }
    return set;
  }, [openFilePaths]);

  const filteredFiles = useMemo(() => {
    return filterFileTree(files || [], searchQuery.trim());
  }, [files, searchQuery]);

  const allFolderPaths = useMemo(() => collectFolderPaths(files || []), [files]);

  useEffect(() => {
    if (inlineCreateType && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [inlineCreateType]);

  const toggleFolder = (path, currentExpanded) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !currentExpanded }));
  };

  const handleCollapseAll = () => {
    const next = {};
    for (const p of allFolderPaths) next[p] = false;
    setExpandedFolders(next);
  };

  const handleExpandAll = () => {
    const next = {};
    for (const p of allFolderPaths) next[p] = true;
    setExpandedFolders(next);
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
        const isExpanded = searchQuery.trim() ? true : expandedFolders[item.path] !== false;
        const folderColor = getFolderColor(item.name);
        const childCount = (item.children || []).length;
        return (
          <div key={item.path} className="explorer-folder">
            <div
              className="explorer-row explorer-folder-row"
              onClick={() => toggleFolder(item.path, isExpanded)}
              data-tooltip={`${item.name} (${childCount} items)`}
            >
              <span className="arrow">
                {isExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
              </span>
              <FolderGlyph isOpen={isExpanded} color={folderColor} />
              <span className="item-name">{item.name}</span>
              <span className="explorer-folder-count">{childCount}</span>
            </div>
            {isExpanded && (
              <div className="explorer-subfolder">
                {renderTree(item.children || [])}
              </div>
            )}
          </div>
        );
      } else {
        const meta = getFileVisualMeta(item.name);
        const normPath = String(item.path || '').replace(/\\/g, '/').toLowerCase();
        const isActive = activeFilePath && String(activeFilePath).replace(/\\/g, '/').toLowerCase() === normPath;
        const isOpenTab = openPathSet.has(normPath);

        return (
          <div
            key={item.path}
            className={`explorer-row explorer-file-row ${isActive ? 'active' : ''}`}
            onClick={(e) => {
              const keepFiles = stayInFiles || e.ctrlKey || e.metaKey;
              onOpenFile(item.path, { stayInFiles: keepFiles });
            }}
            data-tooltip={`${item.name} — Click to open · Ctrl+Click for background tab`}
          >
            {renderFileTypeIcon(meta)}
            <span className={`item-name ${meta.nameClass}`}>{item.name}</span>
            <div className="explorer-file-right">
              {isOpenTab && (
                <span className={`explorer-open-dot ${isActive ? 'active' : ''}`} />
              )}
              <button
                type="button"
                className="explorer-bg-open-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFile(item.path, { stayInFiles: true });
                }}
                data-tooltip="Open in background tab (stay in Files)"
              >
                +
              </button>
            </div>
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
        <span
          className="explorer-title"
          data-tooltip={workspacePath || undefined}
        >
          {folderName ? folderName.toUpperCase() : 'NO FOLDER OPENED'}
        </span>
        <div className="explorer-actions">
          {workspacePath ? (
            <>
              <button
                type="button"
                onClick={() => setStayInFiles(prev => !prev)}
                className={`action-btn stay-files-btn ${stayInFiles ? 'active' : ''}`}
                data-tooltip={stayInFiles ? 'Pin Files: ON (stay here when opening files)' : 'Pin Files: OFF (stay here while opening multiple files)'}
              >
                <span>Pin</span>
              </button>
              <button
                type="button"
                onClick={handleStartCreateFile}
                className="action-btn"
                data-tooltip="New File"
              >
                <FilePlusIcon size={16} />
              </button>
              <button
                type="button"
                onClick={handleStartCreateFolder}
                className="action-btn"
                data-tooltip="New Folder"
              >
                <FolderPlusIcon size={16} />
              </button>
              {onCloseFolder && (
                <button
                  type="button"
                  onClick={onCloseFolder}
                  className="action-btn close-folder-btn"
                  data-tooltip="Close Workspace Folder"
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
                  data-tooltip="New Vehicle Mod Project"
                >
                  <NewVehicleIcon size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={onOpenFolderDialog}
                className="action-btn"
                data-tooltip="Open Workspace Folder"
              >
                <FolderIcon size={15} />
              </button>
              <button
                type="button"
                onClick={onOpenFileDialog}
                className="action-btn"
                data-tooltip="Open Individual JBeam File"
              >
                <FileIcon size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Quick Filter & Expand/Collapse Bar */}
      {workspacePath && files && files.length > 0 && (
        <div className="explorer-filter-bar">
          <div className="explorer-search-wrap">
            <SearchIcon size={12} className="search-icon-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter files..."
              className="explorer-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="explorer-search-clear-btn"
                onClick={() => setSearchQuery('')}
              >
                <CloseIcon size={10} />
              </button>
            )}
          </div>
          <div className="explorer-tree-btns">
            <button
              type="button"
              className="structure-mini-btn"
              onClick={handleExpandAll}
              data-tooltip="Expand All Folders"
            >
              +
            </button>
            <button
              type="button"
              className="structure-mini-btn"
              onClick={handleCollapseAll}
              data-tooltip="Collapse All Folders"
            >
              −
            </button>
          </div>
        </div>
      )}

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
        {filteredFiles && filteredFiles.length > 0 ? (
          renderTree(filteredFiles)
        ) : files && files.length > 0 ? (
          <div className="explorer-empty">No files matching "{searchQuery}"</div>
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
              >
                <FolderIcon size={14} />
                <span>Open Folder</span>
              </button>
              {onNewVehicle && (
                <button
                  type="button"
                  onClick={onNewVehicle}
                  className="bng-explorer-btn secondary"
                >
                  <NewVehicleIcon size={14} />
                  <span>New Vehicle Mod</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectExplorer;
