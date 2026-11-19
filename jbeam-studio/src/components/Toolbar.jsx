import React, { useState, useEffect, useRef } from 'react';
import AppBrandName from './AppBrandName.jsx';
import {
  SidebarLeftIcon,
  SidebarRightIcon,
  PanelBottomIcon,
  MinimizeIcon,
  MaximizeIcon,
  RestoreIcon,
  CloseIcon
} from './Icons.jsx';

export function Toolbar({
  leftSidebarOpen = true,
  onToggleLeftSidebar,
  bottomPanelOpen = false,
  onToggleBottomPanel,
  problemCount = 0,
  rightSidebarOpen = true,
  onToggleRightSidebar,
  activeTabTitle = '',
  workspacePath = null,
  onNewFile = null,
  onOpenFile = null,
  onOpenFolder = null,
  onCloseFolder = null,
  onSaveFile = null,
  onSaveFileAs = null,
  onNewVehicle = null,
  onOpenBlueprintModal = null,
  onOpenObjModal = null,
  onUndo = null,
  onRedo = null,
  onReloadVehicleInSim = null,
  onToggleSimConnection = null,
  simStatus = 'disconnected',
  viewportSource = 'activeDocument',
  onChangeViewportSource = null,
  onSelectLeftTab = null,
  onDetachViewport = null,
  isViewportDetached = false,
  onOpenSearch = null,
  onCheckForUpdates = null
}) {
  const [openMenu, setOpenMenu] = useState(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const menuBarRef = useRef(null);

  // Sync window maximized state from Electron preload
  useEffect(() => {
    if (typeof window !== 'undefined' && window.jbeamAPI?.isWindowMaximized) {
      window.jbeamAPI.isWindowMaximized().then(setIsMaximized).catch(() => {});
    }
    if (typeof window !== 'undefined' && window.jbeamAPI?.onWindowMaximizedChange) {
      return window.jbeamAPI.onWindowMaximizedChange(setIsMaximized);
    }
  }, []);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    if (openMenu) {
      window.addEventListener('pointerdown', handleClickOutside);
      return () => window.removeEventListener('pointerdown', handleClickOutside);
    }
  }, [openMenu]);

  const handleMenuClick = (menuName) => {
    setOpenMenu(prev => (prev === menuName ? null : menuName));
  };

  const handleMenuHover = (menuName) => {
    if (openMenu && openMenu !== menuName) {
      setOpenMenu(menuName);
    }
  };

  const executeMenuAction = (action) => {
    setOpenMenu(null);
    if (typeof action === 'function') {
      action();
    }
  };

  const handleMinimize = () => {
    if (window.jbeamAPI?.minimizeWindow) {
      window.jbeamAPI.minimizeWindow();
    }
  };

  const handleMaximize = () => {
    if (window.jbeamAPI?.maximizeWindow) {
      window.jbeamAPI.maximizeWindow();
    }
  };

  const handleClose = () => {
    if (window.jbeamAPI?.closeWindow) {
      window.jbeamAPI.closeWindow();
    } else {
      window.close();
    }
  };

  return (
    <header className="app-top-header window-titlebar">
      {/* Left Section: Logo & Top Menu Bar (Image 2 Alignment) */}
      <div className="titlebar-left" ref={menuBarRef}>
        <div className="titlebar-brand" title="JBeam.editor">
          <img
            src="./icons/logo.png"
            alt="JBeam.editor"
            className="titlebar-logo-img"
          />
        </div>

        <nav className="titlebar-menu-bar">
          {/* FILE MENU */}
          <div className="menu-item-wrapper">
            <button
              type="button"
              className={`titlebar-menu-btn ${openMenu === 'file' ? 'active' : ''}`}
              onClick={() => handleMenuClick('file')}
              onMouseEnter={() => handleMenuHover('file')}
            >
              File
            </button>
            {openMenu === 'file' && (
              <div className="titlebar-menu-dropdown">
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onNewFile)}
                >
                  <span>New JBeam File</span>
                  <span className="item-shortcut">Ctrl+N</span>
                </button>
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onNewVehicle)}
                >
                  <span>New Vehicle Project...</span>
                </button>
                <div className="menu-dropdown-separator" />
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onOpenFile)}
                >
                  <span>Open File...</span>
                  <span className="item-shortcut">Ctrl+O</span>
                </button>
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onOpenFolder)}
                >
                  <span>Open Vehicle Folder...</span>
                </button>
                {workspacePath && (
                  <button
                    type="button"
                    className="menu-dropdown-item"
                    onClick={() => executeMenuAction(onCloseFolder)}
                  >
                    <span>Close Workspace Folder</span>
                  </button>
                )}
                <div className="menu-dropdown-separator" />
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onSaveFile)}
                >
                  <span>Save</span>
                  <span className="item-shortcut">Ctrl+S</span>
                </button>
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onSaveFileAs)}
                >
                  <span>Save As...</span>
                  <span className="item-shortcut">Ctrl+Shift+S</span>
                </button>
              </div>
            )}
          </div>

          {/* EDIT MENU */}
          <div className="menu-item-wrapper">
            <button
              type="button"
              className={`titlebar-menu-btn ${openMenu === 'edit' ? 'active' : ''}`}
              onClick={() => handleMenuClick('edit')}
              onMouseEnter={() => handleMenuHover('edit')}
            >
              Edit
            </button>
            {openMenu === 'edit' && (
              <div className="titlebar-menu-dropdown">
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onUndo)}
                >
                  <span>Undo</span>
                  <span className="item-shortcut">Ctrl+Z</span>
                </button>
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onRedo)}
                >
                  <span>Redo</span>
                  <span className="item-shortcut">Ctrl+Y</span>
                </button>
              </div>
            )}
          </div>

          {/* SELECTION MENU */}
          <div className="menu-item-wrapper">
            <button
              type="button"
              className={`titlebar-menu-btn ${openMenu === 'selection' ? 'active' : ''}`}
              onClick={() => handleMenuClick('selection')}
              onMouseEnter={() => handleMenuHover('selection')}
            >
              Selection
            </button>
            {openMenu === 'selection' && (
              <div className="titlebar-menu-dropdown">
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(null)}
                >
                  <span>Select All</span>
                  <span className="item-shortcut">Ctrl+A</span>
                </button>
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(null)}
                >
                  <span>Clear Selection</span>
                  <span className="item-shortcut">Esc</span>
                </button>
              </div>
            )}
          </div>

          {/* VIEW MENU */}
          <div className="menu-item-wrapper">
            <button
              type="button"
              className={`titlebar-menu-btn ${openMenu === 'view' ? 'active' : ''}`}
              onClick={() => handleMenuClick('view')}
              onMouseEnter={() => handleMenuHover('view')}
            >
              View
            </button>
            {openMenu === 'view' && (
              <div className="titlebar-menu-dropdown">
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(() => onChangeViewportSource && onChangeViewportSource('activeDocument'))}
                >
                  <span>Part View (Single Component)</span>
                </button>
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(() => onSelectLeftTab && onSelectLeftTab('assembly'))}
                >
                  <span>Vehicle Assembly Workspace</span>
                </button>
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(() => onChangeViewportSource && onChangeViewportSource('openTabs'))}
                >
                  <span>Multi-Part Linkage (Open Tabs)</span>
                </button>
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(() => onSelectLeftTab && onSelectLeftTab('mechanical'))}
                >
                  <span>Mechanical Workspace</span>
                </button>
                <div className="menu-dropdown-separator" />
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onToggleLeftSidebar)}
                >
                  <span>Toggle Primary Sidebar</span>
                  <span className="item-shortcut">Ctrl+B</span>
                </button>
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onToggleBottomPanel)}
                >
                  <span>Toggle Bottom Panel</span>
                  <span className="item-shortcut">Ctrl+`</span>
                </button>
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onToggleRightSidebar)}
                >
                  <span>Toggle Secondary Sidebar</span>
                  <span className="item-shortcut">Ctrl+J</span>
                </button>
                <div className="menu-dropdown-separator" />
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onDetachViewport)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <img
                      src="./icons/detached-logo.png"
                      alt=""
                      style={{ width: '13px', height: '13px', objectFit: 'contain' }}
                    />
                    <span>{isViewportDetached ? 'Reattach 3D Viewport to Main Window' : 'Detach 3D Viewport to Window'}</span>
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* TOOLS MENU */}
          <div className="menu-item-wrapper">
            <button
              type="button"
              className={`titlebar-menu-btn ${openMenu === 'tools' ? 'active' : ''}`}
              onClick={() => handleMenuClick('tools')}
              onMouseEnter={() => handleMenuHover('tools')}
            >
              Tools
            </button>
            {openMenu === 'tools' && (
              <div className="titlebar-menu-dropdown">
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onReloadVehicleInSim)}
                >
                  <span>Reload Vehicle in BeamNG</span>
                  <span className="item-shortcut">Ctrl+R</span>
                </button>
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onToggleSimConnection)}
                >
                  <span>{simStatus === 'connected' ? 'Disconnect from BeamNG' : 'Connect to BeamNG Live Bridge'}</span>
                </button>
                <div className="menu-dropdown-separator" />
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onOpenBlueprintModal)}
                >
                  <span>Blueprint & Reference Tracing...</span>
                </button>
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => executeMenuAction(onOpenObjModal)}
                >
                  <span>Wavefront OBJ Converter...</span>
                </button>
              </div>
            )}
          </div>

          {/* HELP MENU */}
          <div className="menu-item-wrapper">
            <button
              type="button"
              className={`titlebar-menu-btn ${openMenu === 'help' ? 'active' : ''}`}
              onClick={() => handleMenuClick('help')}
              onMouseEnter={() => handleMenuHover('help')}
            >
              Help
            </button>
            {openMenu === 'help' && (
              <div className="titlebar-menu-dropdown">
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => {
                    setOpenMenu(null);
                    if (window.jbeamAPI?.openDocs) {
                      window.jbeamAPI.openDocs();
                    } else {
                      window.open('./docs/index.html', '_blank');
                    }
                  }}
                >
                  <span>JBeam.editor Documentation</span>
                </button>
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => {
                    setOpenMenu(null);
                    window.open('https://documentation.beamng.com/modding/vehicle/sections/', '_blank');
                  }}
                >
                  <span>BeamNG Modding Wiki</span>
                </button>
                {onCheckForUpdates && (
                  <button
                    type="button"
                    className="menu-dropdown-item"
                    onClick={() => {
                      setOpenMenu(null);
                      onCheckForUpdates();
                    }}
                  >
                    <span>Check for Updates...</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </nav>
      </div>

      {/* Center Section: Window Title & Document Name */}
      <div className="titlebar-center">
        <span className="titlebar-doc-name">
          <AppBrandName />
          {activeTabTitle && (
            <>
              <span className="titlebar-sep"> — </span>
              <span className="titlebar-active-tab">{activeTabTitle}</span>
            </>
          )}
          {!activeTabTitle && workspacePath && (
            <>
              <span className="titlebar-sep"> — </span>
              <span className="titlebar-workspace-name">{workspacePath.split(/[\\/]/).filter(Boolean).pop()}</span>
            </>
          )}
        </span>
      </div>

      {/* Right Section: Layout Toggles & Window Controls (Image 2 Alignment) */}
      <div className="titlebar-right">
        {/* Layout Icons Group */}
        <div className="titlebar-layout-toggles">
          <button
            type="button"
            onClick={onToggleLeftSidebar}
            className={`layout-icon-btn ${leftSidebarOpen ? 'active' : ''}`}
            title="Toggle Primary Sidebar (Ctrl+B)"
            aria-label="Toggle Primary Sidebar"
            aria-pressed={leftSidebarOpen}
          >
            <SidebarLeftIcon size={16} open={leftSidebarOpen} />
          </button>
          <button
            type="button"
            onClick={onToggleBottomPanel}
            className={`layout-icon-btn ${bottomPanelOpen ? 'active' : ''}`}
            title={`Toggle Bottom Panel: Diagnostics & Problems (Ctrl+\`) ${problemCount > 0 ? `(${problemCount} issues)` : ''}`}
            aria-label="Toggle Bottom Panel"
            aria-pressed={bottomPanelOpen}
          >
            <PanelBottomIcon size={16} open={bottomPanelOpen} />
            {problemCount > 0 && <span className="layout-badge-dot" />}
          </button>
          <button
            type="button"
            onClick={onToggleRightSidebar}
            className={`layout-icon-btn ${rightSidebarOpen ? 'active' : ''}`}
            title="Toggle Secondary Sidebar (Ctrl+J)"
            aria-label="Toggle Secondary Sidebar"
            aria-pressed={rightSidebarOpen}
          >
            <SidebarRightIcon size={16} open={rightSidebarOpen} />
          </button>
        </div>

        {/* Window Control Buttons: Minimize, Maximize, Close */}
        <div className="window-controls-group">
          <button
            type="button"
            onClick={handleMinimize}
            className="window-control-btn minimize"
            title="Minimize"
          >
            <MinimizeIcon size={12} />
          </button>
          <button
            type="button"
            onClick={handleMaximize}
            className="window-control-btn maximize"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <RestoreIcon size={11} /> : <MaximizeIcon size={11} />}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="window-control-btn close"
            title="Close"
          >
            <CloseIcon size={13} />
          </button>
        </div>
      </div>
    </header>
  );
}

export default Toolbar;
