/**
 * Collada Visual Mesh (.dae) Manager for JBeam Studio
 * Loads, styles, and aligns 3D vehicle visual meshes with JBeam physics structures.
 */
import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';

export class VisualMeshManager {
  constructor() {
    const loadingManager = new THREE.LoadingManager();
    loadingManager.onError = () => {}; // suppress missing texture 404s
    this.loader = new ColladaLoader(loadingManager);
    this.meshGroup = new THREE.Group();
    this.meshGroup.name = 'jbeam_visual_mesh_overlay';
    // BeamNG DAE models are exported with -Y Front, +Z Up.
    // Three.js ColladaLoader converts Z-UP by rotating around X by -90 deg.
    // Setting meshGroup.rotation.y = Math.PI completes the transformation to:
    // (X_dae, Y_dae, Z_dae) -> (-X_dae, Z_dae, Y_dae), which aligns 1:1 with beamngToThree.
    this.meshGroup.rotation.y = Math.PI;
    this.currentMesh = null;
    this.loadedModels = new Map(); // fileName -> THREE.Group (model scene)
    this.opacity = 0.45;
    this.isVisible = true;
    this.isWireframe = false;
    this.materials = [];
    this.allMeshes = [];
    this.submeshMap = new Map();
    this.submeshNames = [];
    this.submeshDetails = new Map();
    this.totalVertices = 0;
    this.totalTriangles = 0;
    this.highlightedSubmesh = null;
  }

  /**
   * Parses Collada XML text and builds a styled visual mesh hierarchy.
   * @param {string} daeContent - Raw XML string of .dae file
   * @param {string} basePath - Base directory path for texture resolution
   * @param {object} options - { opacity, color, wireframe, fileName, append }
   * @returns {object} - Status and metadata
   */
  loadFromText(daeContent, basePath = '', options = {}) {
    const isAppend = Boolean(options.append);
    if (!isAppend) {
      this.clear();
    }

    const targetOpacity = options.opacity !== undefined ? options.opacity : this.opacity;
    this.opacity = targetOpacity;
    this.isWireframe = Boolean(options.wireframe);
    const fileName = options.fileName || (typeof basePath === 'string' && basePath.endsWith('.dae') ? basePath.split(/[\\/]/).pop() : 'model.dae');

    const origWarn = console.warn;
    try {
      // Suppress harmless missing texture warnings (ghost overlays use custom solid/translucent shader materials)
      console.warn = (...args) => {
        if (typeof args[0] === 'string' && (
          args[0].includes('ColladaLoader: Couldn\'t find image') ||
          args[0].includes('ColladaLoader: Couldn\'t create texture') ||
          args[0].includes('Z-UP coordinate system')
        )) {
          return;
        }
        origWarn.apply(console, args);
      };

      const collada = this.loader.parse(daeContent, basePath);
      if (!collada || !collada.scene) {
        throw new Error('Invalid Collada scene graph returned');
      }

      const modelScene = collada.scene;
      modelScene.name = `collada_vehicle_scene_${fileName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      this.currentMesh = isAppend ? this.meshGroup : modelScene;
      this.loadedModels.set(fileName, modelScene);

      // Style all visual meshes with ghost transparency for physics alignment
      const baseColor = options.color || 0x8ea2b0;

      modelScene.traverse((child) => {
        // Register any named Collada node in submeshNames and submeshMap (includes Groups and Lines)
        const rawNodeName = (child.name || '').trim();
        if (rawNodeName && !rawNodeName.startsWith('collada_') && rawNodeName !== 'Scene') {
          if (!this.submeshNames.includes(rawNodeName)) {
            this.submeshNames.push(rawNodeName);
          }
          if (!this.submeshMap.has(rawNodeName)) {
            this.submeshMap.set(rawNodeName, child);
          }
        }

        if (child.isLine || child.isLineSegments) {
          // CAD helper lines, curve references, and template outlines in .dae files.
          // BeamNG vehicle physics and visual flexbodies strictly use 3D triangle meshes;
          // raw <lines> in .dae files are not rendered in BeamNG.
          // Hide them by default so they never float as disconnected white wire fragments in 3D space,
          // while keeping them registered so they are properly managed.
          child.visible = false;
          child.userData.daeFileName = fileName;
          child.userData.isHelperLine = true;
          this.allMeshes.push(child);
          return;
        }

        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
          child.userData.daeFileName = fileName;

          const ghostMat = new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: 0.4,
            metalness: 0.2,
            transparent: true,
            opacity: this.opacity,
            depthWrite: false,
            side: THREE.DoubleSide,
            wireframe: this.isWireframe
          });

          this.materials.push(ghostMat);
          this.allMeshes.push(child);
          child.material = ghostMat;

          // If child name is empty or default, inherit from parent group name
          let meshName = rawNodeName;
          if (!meshName || meshName.startsWith('mesh_')) {
            const parentName = (child.parent?.name || '').trim();
            if (parentName && !parentName.startsWith('collada_') && parentName !== 'Scene') {
              meshName = parentName;
            } else {
              meshName = `mesh_${this.materials.length}`;
            }
          }
          child.name = meshName;
          this.submeshMap.set(meshName, child);
          if (!this.submeshNames.includes(meshName)) {
            this.submeshNames.push(meshName);
          }

          let submeshVerts = 0;
          let submeshTris = 0;
          let bbox = null;
          if (child.geometry) {
            const posAttr = child.geometry.attributes?.position;
            if (posAttr) {
              submeshVerts = posAttr.count;
              this.totalVertices += submeshVerts;
            }
            if (child.geometry.index) {
              submeshTris = child.geometry.index.count / 3;
              this.totalTriangles += submeshTris;
            } else if (posAttr) {
              submeshTris = posAttr.count / 3;
              this.totalTriangles += submeshTris;
            }

            try {
              child.geometry.computeBoundingBox();
              if (child.geometry.boundingBox) {
                const b = child.geometry.boundingBox;
                bbox = {
                  min: { x: b.min.x, y: b.min.y, z: b.min.z },
                  max: { x: b.max.x, y: b.max.y, z: b.max.z },
                  size: {
                    x: Math.abs(b.max.x - b.min.x),
                    y: Math.abs(b.max.y - b.min.y),
                    z: Math.abs(b.max.z - b.min.z)
                  },
                  center: {
                    x: (b.min.x + b.max.x) / 2,
                    y: (b.min.y + b.max.y) / 2,
                    z: (b.min.z + b.max.z) / 2
                  }
                };
              }
            } catch (_) {
              // Ignore bbox calculation error
            }
          }

          this.submeshDetails.set(meshName, {
            name: meshName,
            vertices: submeshVerts,
            triangles: Math.round(submeshTris),
            daeFile: fileName,
            bbox
          });
        }
      });

      this.meshGroup.add(modelScene);
      this.meshGroup.visible = this.isVisible;

      return {
        success: true,
        meshGroup: this.meshGroup,
        meshCount: this.materials.length,
        submeshNames: this.submeshNames,
        submeshDetails: Object.fromEntries(this.submeshDetails.entries()),
        totalVertices: this.totalVertices,
        totalTriangles: Math.round(this.totalTriangles),
        loadedFilesCount: this.loadedModels.size
      };
    } catch (err) {
      console.error('[VisualMeshManager] Failed to parse Collada mesh:', err);
      return {
        success: false,
        error: err.message
      };
    } finally {
      console.warn = origWarn;
    }
  }

  /**
   * Parses multiple Collada XML texts and combines them into the visual mesh hierarchy.
   * Enables simultaneous viewing and inspection of vehicles split across multiple .dae files.
   * @param {Array<{fileName?: string, name?: string, content: string, path?: string}|string>} fileList
   * @param {string} basePath
   * @param {object} options
   * @returns {object}
   */
  loadMultipleFromText(fileList, basePath = '', options = {}) {
    this.clear();

    if (!Array.isArray(fileList) || fileList.length === 0) {
      return {
        success: true,
        meshGroup: this.meshGroup,
        meshCount: 0,
        submeshNames: [],
        submeshDetails: {},
        totalVertices: 0,
        totalTriangles: 0,
        loadedFilesCount: 0
      };
    }

    let loadedCount = 0;
    const errors = [];

    for (let i = 0; i < fileList.length; i++) {
      const item = fileList[i];
      const content = typeof item === 'string' ? item : item?.content;
      const fileName = (typeof item === 'object' ? (item.fileName || item.name) : null) || `model_${i + 1}.dae`;

      if (!content || typeof content !== 'string') continue;

      const res = this.loadFromText(content, basePath, {
        ...options,
        fileName,
        append: true
      });

      if (res && res.success) {
        loadedCount++;
      } else if (res && res.error) {
        errors.push(`${fileName}: ${res.error}`);
      }
    }

    return {
      success: loadedCount > 0,
      meshGroup: this.meshGroup,
      meshCount: this.materials.length,
      submeshNames: this.submeshNames,
      submeshDetails: Object.fromEntries(this.submeshDetails.entries()),
      totalVertices: this.totalVertices,
      totalTriangles: Math.round(this.totalTriangles),
      loadedFilesCount: loadedCount,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Updates opacity across all loaded visual submeshes in real time.
   * @param {number} opacity - 0.0 to 1.0
   */
  setOpacity(opacity) {
    this.opacity = Math.max(0.01, Math.min(1, opacity));
    const isSolid = this.opacity >= 0.99;
    for (const mat of this.materials) {
      mat.opacity = this.opacity;
      // Do NOT set mat.needsUpdate = true on every frame!
      // Opacity is a standard WebGL shader uniform. Setting needsUpdate forces
      // expensive shader re-compilation across all submeshes, causing UI freezes.
      if (mat.transparent !== !isSolid) {
        mat.transparent = !isSolid;
        mat.depthWrite = isSolid;
        mat.needsUpdate = true;
      }
    }
  }

  /**
   * Sets visibility of the visual mesh overlay.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.isVisible = Boolean(visible);
    this.meshGroup.visible = this.isVisible;
  }

  /**
   * Toggles or sets visibility of the visual mesh overlay.
   * @param {boolean} [visible]
   */
  toggleVisibility(visible) {
    if (visible !== undefined) {
      this.setVisible(visible);
    } else {
      this.setVisible(!this.isVisible);
    }
  }

  /**
   * Toggles wireframe rendering of the visual mesh.
   * @param {boolean} wireframe
   */
  setWireframe(wireframe) {
    this.isWireframe = Boolean(wireframe);
    for (const mat of this.materials) {
      mat.wireframe = this.isWireframe;
      mat.needsUpdate = true;
    }
  }

  /**
   * Checks if a submesh exists in the loaded model.
   * @param {string} meshName
   * @returns {boolean}
   */
  hasSubmesh(meshName) {
    if (!meshName) return false;
    if (this.submeshMap.has(meshName)) return true;
    const clean = String(meshName).trim().toLowerCase();
    for (const [key] of this.submeshMap) {
      if (key.trim().toLowerCase() === clean) return true;
    }
    return false;
  }

  /**
   * Filters submeshes so that only matching submeshes are visible in 3D.
   * If allowedNames is null, undefined, or empty (and not forceExplicit), ALL submeshes are visible.
   * If forceExplicit is true, only explicitly matching submeshes are visible (empty set = 0 visible).
   * Matching supports BeamNG flexbody conventions, Blender duplicate (.001) suffixes, and LOD suffixes.
   * @param {string[]|Set<string>|null} allowedNames
   * @param {boolean} forceExplicit
   * @returns {number} count of visible matching submeshes
   */
  filterSubmeshes(allowedNames, forceExplicit = false) {
    if (!allowedNames || (Array.isArray(allowedNames) && allowedNames.length === 0) || (allowedNames instanceof Set && allowedNames.size === 0)) {
      if (forceExplicit) {
        for (const mesh of this.allMeshes) {
          mesh.visible = false;
        }
        return 0;
      }
      for (const mesh of this.allMeshes) {
        mesh.visible = true;
      }
      return this.allMeshes.length;
    }

    const normalizedTargets = new Set();
    const rawList = Array.isArray(allowedNames) ? allowedNames : Array.from(allowedNames);
    for (const n of rawList) {
      if (!n) continue;
      const clean = String(n).trim().toLowerCase()
        .replace(/^['"]|['"]$/g, '')
        .replace(/\.\d+$/, '')
        .replace(/_lod\d+$/i, '');
      if (clean) normalizedTargets.add(clean);
    }

    let matchCount = 0;
    for (const mesh of this.allMeshes) {
      const candidateNames = [];
      if (mesh.name) candidateNames.push(mesh.name);

      // Only search immediate parent group if it is a specific assembly (e.g. mirror group, door latch)
      // Never include whole-vehicle roots or scenes which would match every part!
      let p = mesh.parent;
      while (p && p !== this.meshGroup && !p.name?.startsWith('collada_vehicle_scene')) {
        const pName = (p.name || '').trim();
        if (pName && pName !== 'Scene' && pName !== 'RootNode' && p.children && p.children.length <= 8) {
          candidateNames.push(pName);
        }
        p = p.parent;
      }

      let matches = false;
      for (const rawCandidate of candidateNames) {
        const name = (rawCandidate || '').trim();
        const lowerName = name.toLowerCase();
        const normName = lowerName.replace(/\.\d+$/, '').replace(/_lod\d+$/i, '');

        // Direct exact match
        if (normalizedTargets.has(lowerName) || normalizedTargets.has(normName)) {
          matches = true;
          break;
        }

        // Handle common BeamNG submesh naming conventions (e.g. submesh is door_fl_glass and target is door_fl)
        for (const target of normalizedTargets) {
          if (normName === target || normName.startsWith(target + '_') || normName.startsWith(target + '.')) {
            matches = true;
            break;
          }
          // Also match when submesh has vehicle prefix (e.g. percheron_door_fl matches target door_fl)
          if (normName.endsWith('_' + target)) {
            matches = true;
            break;
          }
        }
        if (matches) break;
      }

      if (mesh.userData?.isHelperLine) {
        mesh.visible = false;
      } else {
        mesh.visible = matches;
        if (matches) matchCount++;
      }
    }

    // Safety fallback: If 0 meshes matched the active part filter (e.g. untitled.jbeam,
    // empty document, or newly scaffolded part with 0 flexbodies defined), do NOT blank out the vehicle!
    // Show all body meshes so the user can see their model and use DAE Snap to author nodes.
    // (Disabled if forceExplicit is true, where user explicitly chose 0 spawned meshes)
    if (!forceExplicit && matchCount === 0 && this.allMeshes.length > 0) {
      for (const mesh of this.allMeshes) {
        if (!mesh.userData?.isHelperLine) {
          mesh.visible = true;
          matchCount++;
        }
      }
    }

    return matchCount;
  }

  /**
   * Returns list of all submesh names that match candidate names.
   * @param {string[]|Set<string>} candidates
   * @returns {string[]}
   */
  getMatchingSubmeshes(candidates) {
    if (!candidates) return [];
    const normalizedTargets = new Set();
    const rawList = Array.isArray(candidates) ? candidates : Array.from(candidates);
    for (const n of rawList) {
      if (!n) continue;
      const clean = String(n).trim().toLowerCase()
        .replace(/^['"]|['"]$/g, '')
        .replace(/\.\d+$/, '')
        .replace(/_lod\d+$/i, '');
      if (clean) normalizedTargets.add(clean);
    }

    const matches = [];
    for (const name of this.submeshNames) {
      const lowerName = name.trim().toLowerCase();
      const normName = lowerName.replace(/\.\d+$/, '').replace(/_lod\d+$/i, '');
      let isMatch = normalizedTargets.has(lowerName) || normalizedTargets.has(normName);
      if (!isMatch) {
        for (const target of normalizedTargets) {
          if (normName === target || normName.startsWith(target + '_') || normName.startsWith(target + '.')) {
            isMatch = true;
            break;
          }
        }
      }
      if (isMatch) matches.push(name);
    }
    return matches;
  }

  /**
   * Selectively highlights a single submesh (e.g. for flexbody binding inspection)
   * while maintaining ghost opacity for the rest of the vehicle.
   * @param {string|null} meshName
   */
  highlightSubmesh(meshName) {
    this.highlightedSubmesh = meshName;
    for (const mesh of this.allMeshes) {
      if (mesh.material) {
        if (meshName && mesh.name === meshName) {
          mesh.material.color.setHex(0x00e5ff); // Cyan highlight
          mesh.material.opacity = Math.max(0.7, this.opacity);
          mesh.material.needsUpdate = true;
        } else {
          mesh.material.color.setHex(0x8ea2b0); // Default slate ghost
          mesh.material.opacity = meshName ? this.opacity * 0.4 : this.opacity;
          mesh.material.needsUpdate = true;
        }
      }
    }
  }

  /**
   * Returns geometry statistics (vertices, triangles) for a specific submesh.
   * @param {string} meshName
   * @returns {{name: string, vertices: number, triangles: number}|null}
   */
  getSubmeshStats(meshName) {
    if (!meshName) return null;
    return this.submeshDetails.get(meshName) || null;
  }

  /**
   * Finds the closest vertex on any loaded visual mesh to a given 3D world position.
   * Enables magnetic vertex snapping from JBeam nodes to visual 3D model geometry.
   *
   * @param {THREE.Vector3} worldPoint - Target point in world space
   * @param {number} [maxDistance=0.25] - Maximum search radius in meters
   * @returns {{found: boolean, point: THREE.Vector3|null, distance: number, submesh: string|null}}
   */
  findClosestVertex(worldPoint, maxDistance = 0.25) {
    if (!worldPoint || !this.allMeshes || this.allMeshes.length === 0) {
      return { found: false, point: null, distance: Infinity, submesh: null };
    }

    let closestDist = maxDistance;
    let closestPoint = null;
    let closestSubmesh = null;

    const tempV = new THREE.Vector3();
    const box = new THREE.Box3();

    for (const mesh of this.allMeshes) {
      if (!mesh || !mesh.visible || !mesh.geometry) continue;
      const posAttr = mesh.geometry.attributes?.position;
      if (!posAttr) continue;

      // Ensure world matrix and bounding box are computed
      mesh.updateWorldMatrix(true, false);
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);

      // Distance from point to bounding box; if greater than closestDist, skip entire mesh
      const boxDist = box.distanceToPoint(worldPoint);
      if (boxDist > closestDist) continue;

      const count = posAttr.count;
      for (let i = 0; i < count; i++) {
        tempV.fromBufferAttribute(posAttr, i);
        tempV.applyMatrix4(mesh.matrixWorld);

        const d = tempV.distanceTo(worldPoint);
        if (d < closestDist) {
          closestDist = d;
          closestPoint = tempV.clone();
          closestSubmesh = mesh.name;
        }
      }
    }

    if (closestPoint) {
      return {
        found: true,
        point: closestPoint,
        distance: closestDist,
        submesh: closestSubmesh
      };
    }

    return { found: false, point: null, distance: Infinity, submesh: null };
  }

  /**
   * Directly raycasts against loaded 3D visual submeshes from the camera ray,
   * snapping to the exact 3D surface point and magnetically locking to the closest
   * vertex on the hit mesh within magneticRadius.
   *
   * @param {THREE.Raycaster} raycaster
   * @param {number} [magneticRadius=0.35]
   * @returns {{found: boolean, point: THREE.Vector3|null, surfacePoint: THREE.Vector3|null, isVertex: boolean, submesh: string|null, distance: number}}
   */
  snapRayToMesh(raycaster, magneticRadius = 0.35) {
    if (!raycaster || !this.allMeshes || this.allMeshes.length === 0) {
      return { found: false, point: null, surfacePoint: null, isVertex: false, submesh: null, distance: Infinity };
    }

    const visibleMeshes = this.allMeshes.filter(m => m && m.visible && m.geometry);
    if (visibleMeshes.length === 0) {
      return { found: false, point: null, surfacePoint: null, isVertex: false, submesh: null, distance: Infinity };
    }

    const hits = raycaster.intersectObjects(visibleMeshes, false);
    if (!hits || hits.length === 0) {
      return { found: false, point: null, surfacePoint: null, isVertex: false, submesh: null, distance: Infinity };
    }

    const firstHit = hits[0];
    const hitPoint = firstHit.point.clone();
    const hitMesh = firstHit.object;

    let closestVertex = null;
    let closestDist = magneticRadius;
    const tempV = new THREE.Vector3();

    // 1. Inspect the 3 vertices of the intersected triangle face
    if (firstHit.face && hitMesh.geometry?.attributes?.position) {
      const posAttr = hitMesh.geometry.attributes.position;
      const faceIndices = [firstHit.face.a, firstHit.face.b, firstHit.face.c];
      for (const idx of faceIndices) {
        tempV.fromBufferAttribute(posAttr, idx).applyMatrix4(hitMesh.matrixWorld);
        const d = tempV.distanceTo(hitPoint);
        if (d < closestDist) {
          closestDist = d;
          closestVertex = tempV.clone();
        }
      }
    }

    // 2. Search neighboring vertices on the hit mesh within magneticRadius
    if (hitMesh.geometry?.attributes?.position) {
      const posAttr = hitMesh.geometry.attributes.position;
      const count = posAttr.count;
      const step = count > 20000 ? Math.ceil(count / 20000) : 1;
      for (let i = 0; i < count; i += step) {
        tempV.fromBufferAttribute(posAttr, i).applyMatrix4(hitMesh.matrixWorld);
        const d = tempV.distanceTo(hitPoint);
        if (d < closestDist) {
          closestDist = d;
          closestVertex = tempV.clone();
        }
      }
    }

    const finalPoint = closestVertex || hitPoint;

    return {
      found: true,
      point: finalPoint,
      surfacePoint: hitPoint,
      isVertex: Boolean(closestVertex),
      submesh: hitMesh.name,
      distance: closestDist
    };
  }

  /**
   * Resets all submesh highlights back to default ghost styling.
   */
  resetHighlights() {
    this.highlightSubmesh(null);
  }

  /**
   * Cleans up all geometries, materials, and children in the mesh group.
   */
  clear() {
    while (this.meshGroup.children.length > 0) {
      const child = this.meshGroup.children[0];
      this.meshGroup.remove(child);
      child.traverse((node) => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose());
          else node.material.dispose();
        }
      });
    }
    this.materials = [];
    this.allMeshes = [];
    this.submeshMap.clear();
    this.submeshNames = [];
    this.submeshDetails.clear();
    this.loadedModels.clear();
    this.totalVertices = 0;
    this.totalTriangles = 0;
    this.highlightedSubmesh = null;
    this.currentMesh = null;
  }
}

export default VisualMeshManager;

