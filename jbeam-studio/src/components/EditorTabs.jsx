import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  FileIcon,
  CodeIcon,
  LayersIcon,
  CloseIcon,
  ChevronDownIcon
} from './Icons.jsx';

function getFileType(filename = '') {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.jbeam')) {
    return { type: 'jbeam', label: 'JBeam', color: '#0099FF' };
  }
  if (lower.endsWith('.pc')) {
    return { type: 'pc', label: 'PC Config', color: '#38bdf8' };
  }
  if (lower.endsWith('.json')) {
    return { type: 'json', label: 'JSON', color: '#facc15' };
  }
  if (lower.endsWith('.lua')) {
    return { type: 'lua', label: 'Lua', color: '#a855f7' };
  }
  return { type: 'file', label: 'File', color: '#94a3b8' };
}

export function EditorTabs({
  tabs = [],
  activeTabId,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs
}) {
  const tabBarRef = useRef(null);
  const activeTabRef = useRef(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, tab }
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Auto-scroll active tab into view
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }, [activeTabId]);

  // Horizontal wheel scroll listener (native passive: false for smooth scroll)
  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY * 0.8;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu && !showDropdown) return;

    const handlePointerDown = (e) => {
      if (contextMenu) setContextMenu(null);
      if (showDropdown && dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setShowDropdown(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu, showDropdown]);

  const handleContextMenu = (e, tab) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 180),
      y: Math.min(e.clientY, window.innerHeight - 200),
      tab
    });
  };

  const handleAuxClick = (e, tabId) => {
    // Middle-click to close tab (standard browser/IDE behavior)
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      onCloseTab(tabId);
    }
  };

  const copyToClipboard = (text) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
  };

  if (!tabs || tabs.length === 0) return null;

  return (
    <div className="tab-bar-container">
      <div className="tab-bar" ref={tabBarRef}>
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const fileInfo = getFileType(tab.filePath || tab.title);

          return (
            <div
              key={tab.id}
              ref={isActive ? activeTabRef : null}
              className={`tab-item ${isActive ? 'active' : ''} ${tab.isDirty ? 'dirty' : ''} ${fileInfo.type}`}
              onClick={() => onSelectTab(tab.id)}
              onAuxClick={(e) => handleAuxClick(e, tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab)}
              title={`${tab.title}${tab.filePath ? ` — ${tab.filePath}` : ''}${tab.isDirty ? ' (Unsaved Changes)' : ''}`}
            >
              {/* File Type Specific Icon */}
              <span className={`tab-icon-wrapper ${fileInfo.type}`} style={{ color: fileInfo.color }}>
                {fileInfo.type === 'jbeam' ? (
                  <CodeIcon size={13} />
                ) : fileInfo.type === 'pc' ? (
                  <LayersIcon size={13} />
                ) : (
                  <FileIcon size={13} />
                )}
              </span>

              {/* Tab Title */}
              <span className="tab-title">{tab.title}</span>

              {/* Dirty indicator or close button */}
              <div className="tab-action-container">
                {tab.isDirty && (
                  <span className="tab-dirty-dot" title="Unsaved changes">●</span>
                )}
                <button
                  type="button"
                  className="tab-close-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  title="Close tab (Ctrl+W or Middle-click)"
                >
                  <CloseIcon size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tab Bar Right Controls (Quick tab dropdown & close all) */}
      {tabs.length > 0 && (
        <div className="tab-bar-actions" ref={dropdownRef}>
          <button
            type="button"
            className={`tab-bar-action-btn ${showDropdown ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setShowDropdown(prev => !prev);
            }}
            title={`Open Tabs List (${tabs.length} file${tabs.length > 1 ? 's' : ''} open)`}
          >
            <ChevronDownIcon size={12} className={showDropdown ? 'rotate-180' : ''} />
          </button>

          {showDropdown && (
            <div
              className="tab-bar-dropdown-menu"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="tab-bar-dropdown-header">
                <span>OPEN EDITORS ({tabs.length})</span>
                {onCloseAllTabs && (
                  <button
                    type="button"
                    className="tab-dropdown-close-all"
                    onClick={() => {
                      setShowDropdown(false);
                      onCloseAllTabs();
                    }}
                    title="Close all open tabs"
                  >
                    Close All
                  </button>
                )}
              </div>
              <div className="tab-bar-dropdown-list">
                {tabs.map((tab) => {
                  const isActive = tab.id === activeTabId;
                  const fileInfo = getFileType(tab.filePath || tab.title);
                  return (
                    <div
                      key={tab.id}
                      className={`tab-dropdown-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        onSelectTab(tab.id);
                        setShowDropdown(false);
                      }}
                    >
                      <span className="tab-dropdown-icon" style={{ color: fileInfo.color }}>
                        {fileInfo.type === 'jbeam' ? (
                          <CodeIcon size={12} />
                        ) : fileInfo.type === 'pc' ? (
                          <LayersIcon size={12} />
                        ) : (
                          <FileIcon size={12} />
                        )}
                      </span>
                      <span className="tab-dropdown-title">{tab.title}</span>
                      {tab.isDirty && <span className="tab-dropdown-dirty">●</span>}
                      <button
                        type="button"
                        className="tab-dropdown-close"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseTab(tab.id);
                        }}
                        title="Close tab"
                      >
                        <CloseIcon size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Right Click Context Menu */}
      {contextMenu && (
        <div
          className="tab-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="tab-context-item"
            onClick={() => {
              onCloseTab(contextMenu.tab.id);
              setContextMenu(null);
            }}
          >
            <span>Close</span>
            <span className="tab-context-shortcut">Ctrl+W</span>
          </div>

          {tabs.length > 1 && onCloseOtherTabs && (
            <div
              className="tab-context-item"
              onClick={() => {
                onCloseOtherTabs(contextMenu.tab.id);
                setContextMenu(null);
              }}
            >
              <span>Close Others</span>
            </div>
          )}

          {tabs.length > 1 && onCloseAllTabs && (
            <div
              className="tab-context-item"
              onClick={() => {
                onCloseAllTabs();
                setContextMenu(null);
              }}
            >
              <span>Close All</span>
            </div>
          )}

          <div className="tab-context-divider" />

          {contextMenu.tab.filePath && (
            <>
              <div
                className="tab-context-item"
                onClick={() => {
                  copyToClipboard(contextMenu.tab.filePath);
                  setContextMenu(null);
                }}
              >
                <span>Copy Full Path</span>
              </div>
              <div
                className="tab-context-item"
                onClick={() => {
                  copyToClipboard(contextMenu.tab.title);
                  setContextMenu(null);
                }}
              >
                <span>Copy File Name</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default EditorTabs;
