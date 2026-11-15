# JBeam.editor - Custom Web Bootstrapper Installer

A lightweight, frameless, modern installer for **JBeam.editor** designed specifically for the BeamNG.drive modding community.

---

## ✨ Features

- **🎮 BeamNG Native Dark Theme**: Clean charcoal and gunmetal interface (`#1A1A1A`, `#262626`, `#3D3D3D`) featuring the iconic **JBeam<span style="color:#FF6600">.editor</span>** brand styling.
- **🔍 Auto-Detection of BeamNG.drive**:
  - Automatically queries the Windows Registry (`HKLM` & `HKCU`) to locate Steam.
  - Parses `steamapps/libraryfolders.vdf` across all drives to pinpoint `BeamNG.drive`.
  - Scans `%LocalAppData%\BeamNG.drive\0.3x` for the user's modding userfolder.
  - Automatically writes these paths into JBeam.editor's `settings.json` on first run.
- **⚡ Live Streaming & Animated Progress**:
  - Connects directly to GitHub Releases API.
  - Streams the download with live speed (`MB/s`), downloaded bytes, and percentage.
  - Displays rotating modder tips & keyboard shortcuts during installation.
- **📂 Native Windows Shell Integration**:
  - Associates `.jbeam` (Vehicle Physics Structure) and `.pc` (Part Configuration) files with custom icons.
  - Adds *"Open in JBeam.editor"* to the Windows Explorer context menu.
  - Creates Desktop and Start Menu `.lnk` shortcuts.
  - Registers clean Windows Uninstaller under *"Add or Remove Programs"*.

---

## 🛠 Project Structure

```
installer/
 ├── assets/                   # App icons and graphics (bng-logo.png, etc.)
 ├── src/
 │    ├── detector.js          # Steam & BeamNG registry auto-discovery engine
 │    ├── downloader.js        # GitHub Releases stream downloader & zip extractor
 │    ├── system.js            # Windows shortcuts, file associations, and registry
 │    ├── index.html           # Frameless HTML5 installer interface
 │    ├── styles.css           # Clean BeamNG theme styling
 │    └── ui.js                # State, tips carousel, and event handlers
 ├── main.js                   # Electron main process (frameless window management)
 ├── preload.js                # Secure IPC bridge between UI and Node.js
 └── package.json              # Build and portable target configuration
```

---

## 🚀 Testing Locally

You can launch and test the custom installer locally at any time:

### From the workspace root:
Double-click:
```bat
launch-installer.bat
```
Or run in terminal:
```bash
npx electron installer
```
