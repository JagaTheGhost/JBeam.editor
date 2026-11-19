/*
  JBeam Studio - Automated Test Suite: Hover Documentation & Breadcrumbs (from VS Code)
  Validates:
  1. Documentation catalog lookup across nodes, beams, flexbodies, surfaces, slots, and variables
  2. Breadcrumb context resolution (part name and enclosing table section)
  3. Valid physical ranges, units, and BeamNG physics guide notes formatting
  4. Monaco provideJBeamHover integration and markdown output
*/

import assert from 'node:assert';
import {
  findDocumentationEntry,
  formatHoverMarkdown,
  normalizeSectionName,
  JBEAM_DOCUMENTATION
} from '../src/features/jbeam/docHelper.js';
import {
  resolveContextAtPosition,
  resolveHoveredJBeamElement,
  resolveElementsInLineRange,
  provideJBeamHover
} from '../src/features/jbeam/hoverProvider.js';
import { buildCodeHoverGroup } from '../src/features/viewport/visualizers.js';

export function runHoverProviderTests() {
  console.log('--- Running Hover Documentation & Breadcrumbs Tests (from VS Code) ---');

  // Test 1: Documentation Catalog Lookup for Core Parameters
  {
    // 1a. beamSpring
    const springEntry = findDocumentationEntry('beamSpring', 'beams');
    assert.ok(springEntry, 'beamSpring must be documented');
    assert.strictEqual(springEntry.key, 'beams > beamSpring');
    assert.strictEqual(springEntry.doc.type, 'number');
    assert.strictEqual(springEntry.doc.units, 'N/m');
    assert.ok(springEntry.doc.validRange.includes('200,000'));
    assert.ok(springEntry.doc.physicsNote.includes('MN/m'));

    // 1b. nodeWeight
    const weightEntry = findDocumentationEntry('nodeWeight', 'nodes');
    assert.ok(weightEntry, 'nodeWeight must be documented');
    assert.strictEqual(weightEntry.key, 'nodes > nodeWeight');
    assert.strictEqual(weightEntry.doc.type, 'number');
    assert.strictEqual(weightEntry.doc.units, 'kg');
    assert.ok(weightEntry.doc.validRange.includes('kg'));

    // 1c. flexbodies
    const flexEntry = findDocumentationEntry('flexbodies');
    assert.ok(flexEntry, 'flexbodies section must be documented');
    assert.strictEqual(flexEntry.key, 'flexbodies');
    assert.ok(flexEntry.doc.description.includes('mesh'));

    // 1d. Section-specific disambiguation for 'group'
    const nodeGroup = findDocumentationEntry('group', 'nodes');
    assert.strictEqual(nodeGroup.key, 'nodes > group');

    const flexGroup = findDocumentationEntry('group', 'flexbodies');
    assert.strictEqual(flexGroup.key, 'flexbodies > group');

    console.log('✓ Test 1: Documentation catalog lookup verified.');
  }

  // Test 2: Formatting Markdown with Breadcrumbs & Physics Ranges
  {
    const entry = findDocumentationEntry('beamSpring', 'beams');
    const md = formatHoverMarkdown(entry.key, entry.doc, { partName: 'pickup_cab', sectionName: 'beams' });

    assert.ok(md.includes('pickup_cab'), 'Breadcrumb must include part name');
    assert.ok(md.includes('beams > beamSpring'), 'Breadcrumb must include parameter key');
    assert.ok(md.includes('**Type:** `number`'));
    assert.ok(md.includes('**Units:** `N/m`'));
    assert.ok(md.includes('**Recommended Range:**'));
    assert.ok(md.includes('BeamNG Physics Guide'));
    assert.ok(md.includes('https://documentation.beamng.com'));

    console.log('✓ Test 2: Markdown hover formatting verified.');
  }

  // Test 3: Document Context Resolution (Part & Section Scans)
  {
    const lines = [
      '{',
      '  "semi_truck_frame": {',
      '    "information": { "name": "Frame" },',
      '    "nodes": [',
      '      ["id", "posX", "posY", "posZ"],',
      '      {"nodeWeight": 25},',
      '      ["f1", 0.5, 1.0, 0.4]',
      '    ],',
      '    "beams": [',
      '      ["id1:", "id2:"],',
      '      {"beamSpring": 4500000, "beamDamp": 450},',
      '      ["f1", "f2"]',
      '    ],',
      '    "flexbodies": [',
      '      ["mesh", "[group]:", "nonFlexMaterials"],',
      '      ["semi_chassis", ["semi_frame"]]',
      '    ]',
      '  }',
      '}'
    ];

    const mockModel = {
      getLineContent: (lineNum) => lines[lineNum - 1] || ''
    };

    // Line 6 is inside nodes section
    const ctxNodes = resolveContextAtPosition(mockModel, 6);
    assert.strictEqual(ctxNodes.partName, 'semi_truck_frame');
    assert.strictEqual(ctxNodes.sectionName, 'nodes');

    // Line 11 is inside beams section
    const ctxBeams = resolveContextAtPosition(mockModel, 11);
    assert.strictEqual(ctxBeams.partName, 'semi_truck_frame');
    assert.strictEqual(ctxBeams.sectionName, 'beams');

    // Line 15 is inside flexbodies section
    const ctxFlex = resolveContextAtPosition(mockModel, 15);
    assert.strictEqual(ctxFlex.partName, 'semi_truck_frame');
    assert.strictEqual(ctxFlex.sectionName, 'flexbodies');

    console.log('✓ Test 3: Document context resolution (part & section scanner) verified.');
  }

  // Test 4: End-to-End Mock Monaco Hover Generation
  {
    const lines = [
      '{',
      '  "sports_car": {',
      '    "beams": [',
      '      {"beamSpring": 2500000}',
      '    ],',
      '    "nodes": [',
      '      {"nodeWeight": 8.5}',
      '    ]',
      '  }',
      '}'
    ];

    const mockModel = {
      getLineContent: (lineNum) => lines[lineNum - 1] || '',
      getWordAtPosition: (pos) => {
        if (pos.lineNumber === 4) return { word: 'beamSpring', startColumn: 8, endColumn: 18 };
        if (pos.lineNumber === 7) return { word: 'nodeWeight', startColumn: 8, endColumn: 18 };
        if (pos.lineNumber === 3) return { word: 'beams', startColumn: 5, endColumn: 10 };
        return null;
      }
    };

    // 4a. Hover over beamSpring
    const hover1 = provideJBeamHover(mockModel, { lineNumber: 4, column: 12 }, null);
    assert.ok(hover1, 'Hover must be returned for beamSpring');
    assert.ok(hover1.contents[0].value.includes('sports_car > beams > beamSpring'));
    assert.ok(hover1.contents[0].value.includes('N/m'));

    // 4b. Hover over nodeWeight
    const hover2 = provideJBeamHover(mockModel, { lineNumber: 7, column: 10 }, null);
    assert.ok(hover2, 'Hover must be returned for nodeWeight');
    assert.ok(hover2.contents[0].value.includes('sports_car > nodes > nodeWeight'));
    assert.ok(hover2.contents[0].value.includes('kg'));

    // 4c. Hover over non-existent / empty
    const hover3 = provideJBeamHover(mockModel, { lineNumber: 1, column: 1 }, null);
    assert.strictEqual(hover3, null, 'No hover for non-keyword tokens');

    console.log('✓ Test 4: End-to-end mock Monaco hover provider execution verified.');
  }

  // Test 5: Code Hover Element Resolution for 3D Viewport Highlighting
  {
    const lines = [
      '{',
      '  "pickup_frame": {',
      '    "nodes": [',
      '      ["id", "posX", "posY", "posZ"],',
      '      ["f1r", -0.4, 1.2, 0.35],',
      '      ["f1l", 0.4, 1.2, 0.35]',
      '    ],',
      '    "beams": [',
      '      ["id1:", "id2:"],',
      '      ["f1r", "f1l"]',
      '    ],',
      '    "triangles": [',
      '      ["id1:", "id2:", "id3:"],',
      '      ["f1r", "f1l", "f2r"]',
      '    ],',
      '    "quads": [',
      '      ["id1:", "id2:", "id3:", "id4:"],',
      '      ["f1r", "f1l", "f2l", "f2r"]',
      '    ]',
      '  }',
      '}'
    ];

    const mockModel = {
      getLineContent: (lineNum) => lines[lineNum - 1] || '',
      getWordAtPosition: () => null
    };

    // 5a. Node hover
    const nodeEl = resolveHoveredJBeamElement(mockModel, 5, 8, null);
    assert.ok(nodeEl, 'Must resolve node element from code line');
    assert.strictEqual(nodeEl.type, 'node');
    assert.strictEqual(nodeEl.id, 'f1r');
    assert.strictEqual(nodeEl.partName, 'pickup_frame');

    // 5b. Beam hover
    const beamEl = resolveHoveredJBeamElement(mockModel, 10, 8, null);
    assert.ok(beamEl, 'Must resolve beam element from code line');
    assert.strictEqual(beamEl.type, 'beam');
    assert.strictEqual(beamEl.id1, 'f1r');
    assert.strictEqual(beamEl.id2, 'f1l');
    assert.strictEqual(beamEl.beamKey, 'f1r_f1l');

    // 5c. Triangle hover
    const triEl = resolveHoveredJBeamElement(mockModel, 14, 8, null);
    assert.ok(triEl, 'Must resolve triangle element from code line');
    assert.strictEqual(triEl.type, 'triangle');
    assert.deepStrictEqual(triEl.nodes, ['f1r', 'f1l', 'f2r']);

    // 5d. Quad hover
    const quadEl = resolveHoveredJBeamElement(mockModel, 18, 8, null);
    assert.ok(quadEl, 'Must resolve quad element from code line');
    assert.strictEqual(quadEl.type, 'quad');
    assert.deepStrictEqual(quadEl.nodes, ['f1r', 'f1l', 'f2l', 'f2r']);

    console.log('✓ Test 5: Code hover element resolution (nodes/beams/triangles/quads) verified.');
  }

  // Test 6: Multi-line Code Selection Resolution & 3D Highlighting
  {
    const fixtureLines = [
      '{',
      '  "vehicle_frame": {',
      '    "nodes": [',
      '      ["id:", "posX", "posY", "posZ"],',
      '      ["n1l", 0.5, 1.2, 0.3],',
      '      ["n1r", -0.5, 1.2, 0.3],',
      '      ["n2l", 0.5, 2.0, 0.3],',
      '      ["n2r", -0.5, 2.0, 0.3],',
      '      ["n3l", 0.5, 2.8, 0.3],',
      '      ["n3r", -0.5, 2.8, 0.3]',
      '    ],',
      '    "beams": [',
      '      ["id1:", "id2:"],',
      '      {"beamSpring": 2001000, "beamDamp": 200},',
      '      ["n1r", "n1l"],',
      '      {"beamSpring": 2001000, "beamDamp": 200},',
      '      ["n1l", "n2r"],',
      '      {"beamSpring": 2001000, "beamDamp": 200},',
      '      ["n2r", "n3l"],',
      '      {"beamSpring": 2001000, "beamDamp": 200},',
      '      ["n1r", "n2l"]',
      '    ],',
      '    "triangles": [',
      '      ["id1:", "id2:", "id3:"],',
      '      ["n1l", "n2r", "n2l"],', // Line 25: Triangle 1 (from user screenshot)
      '      ["n1l", "n2r", "n1r"]',  // Line 26: Triangle 2 (from user screenshot)
      '    ],',
      '    "quads": [',
      '      ["id1:", "id2:", "id3:", "id4:"],',
      '      ["n2l", "n3l", "n3r", "n2r"]', // Line 30: Quad 1 (from user screenshot)
      '    ]',
      '  }',
      '}'
    ];

    const mockModel = {
      getLineContent: (lineNum) => fixtureLines[lineNum - 1] || ''
    };

    // 6a. Select multiple triangle lines (Lines 25 to 26 - exact match of user screenshot)
    const triSelection = resolveElementsInLineRange(mockModel, 25, 26, null);
    assert.ok(triSelection, 'resolveElementsInLineRange must return selection object');
    assert.strictEqual(triSelection.triangles.length, 2, 'Should resolve both selected triangles');
    assert.deepStrictEqual(triSelection.triangles[0].nodes, ['n1l', 'n2r', 'n2l']);
    assert.deepStrictEqual(triSelection.triangles[1].nodes, ['n1l', 'n2r', 'n1r']);
    assert.strictEqual(triSelection.quads.length, 0);
    assert.strictEqual(triSelection.beams.length, 0);
    assert.strictEqual(triSelection.nodes.length, 0);

    // 6b. Select quads line (Line 30)
    const quadSelection = resolveElementsInLineRange(mockModel, 30, 30, null);
    assert.ok(quadSelection);
    assert.strictEqual(quadSelection.quads.length, 1);
    assert.deepStrictEqual(quadSelection.quads[0].nodes, ['n2l', 'n3l', 'n3r', 'n2r']);

    // 6c. Select multiple nodes lines (Lines 5 to 8)
    const nodeSelection = resolveElementsInLineRange(mockModel, 5, 8, null);
    assert.ok(nodeSelection);
    assert.strictEqual(nodeSelection.nodes.length, 4);
    assert.deepStrictEqual(nodeSelection.nodes.map(n => n.id), ['n1l', 'n1r', 'n2l', 'n2r']);

    // 6d. Select multiple beam lines with interspersed options objects (Lines 14 to 21)
    const beamSelection = resolveElementsInLineRange(mockModel, 14, 21, null);
    assert.ok(beamSelection);
    assert.strictEqual(beamSelection.beams.length, 4, 'Should cleanly extract the 4 beams while ignoring options objects');
    assert.strictEqual(beamSelection.beams[0].id1, 'n1r');
    assert.strictEqual(beamSelection.beams[0].id2, 'n1l');

    // 6e. Verify 3D Viewport Group construction for multi-line triangle selection
    const testNodesDict = {
      n1l: { posX: 0.5, posY: 1.2, posZ: 0.3 },
      n1r: { posX: -0.5, posY: 1.2, posZ: 0.3 },
      n2l: { posX: 0.5, posY: 2.0, posZ: 0.3 },
      n2r: { posX: -0.5, posY: 2.0, posZ: 0.3 },
      n3l: { posX: 0.5, posY: 2.8, posZ: 0.3 },
      n3r: { posX: -0.5, posY: 2.8, posZ: 0.3 }
    };

    const multiTriGroup = buildCodeHoverGroup({ selected: triSelection }, testNodesDict);
    assert.strictEqual(multiTriGroup.children.length, 2, 'Should create 1 surface mesh and 1 outline LineSegments for multi-tri selection');

    // The surface mesh should have 2 triangles * 3 vertices = 6 vertices (18 float values)
    const surfaceMesh = multiTriGroup.children.find(c => c.isMesh);
    assert.ok(surfaceMesh, 'Surface mesh must exist');
    assert.strictEqual(surfaceMesh.geometry.attributes.position.count, 6, '6 vertices for 2 selected triangles');

    // The edge lines should have 2 triangles * 3 edges * 2 points = 12 vertices
    const edgeLines = multiTriGroup.children.find(c => c.isLineSegments);
    assert.ok(edgeLines, 'Edge lines segments must exist');
    assert.strictEqual(edgeLines.geometry.attributes.position.count, 12, '12 edge points for 2 selected triangles');

    console.log('✓ Test 6: Multi-line Code Selection Resolution & 3D Highlighting verified.');
  }

  console.log('All Hover Documentation & Breadcrumbs tests passed!\n');
}
