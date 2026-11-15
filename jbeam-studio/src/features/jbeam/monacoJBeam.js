/*
  Monaco Editor JBeam Language Provider
  Registers custom Monarch tokenizer, bracket configuration, syntax themes,
  and hover documentation providers for JBeam.
*/

import { registerJBeamHoverProvider } from './hoverProvider.js';

export const JBEAM_LANGUAGE_ID = 'jbeam';

export function registerJBeamLanguage(monaco) {
  if (!monaco) return;

  // Check if already registered
  const existingLanguages = monaco.languages.getLanguages();
  if (existingLanguages.some(l => l.id === JBEAM_LANGUAGE_ID)) {
    return;
  }

  monaco.languages.register({
    id: JBEAM_LANGUAGE_ID,
    extensions: ['.jbeam'],
    aliases: ['JBeam', 'jbeam'],
    mimetypes: ['application/x-jbeam']
  });

  // Language configuration (brackets, comments, indentation)
  monaco.languages.setLanguageConfiguration(JBEAM_LANGUAGE_ID, {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/']
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')']
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' }
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' }
    ]
  });

  // Monarch Tokenizer
  monaco.languages.setMonarchTokensProvider(JBEAM_LANGUAGE_ID, {
    defaultToken: 'invalid',
    tokenPostfix: '.jbeam',

    keywords: [
      'information', 'slotType', 'slots', 'slots2', 'variables', 'refNodes',
      'nodes', 'beams', 'triangles', 'quads', 'hydros', 'torsionbars',
      'flexbodies', 'props', 'engine', 'transmission', 'materials',
      'controller', 'soundConfig', 'glowMap', 'mainEngine', 'differential'
    ],

    specialConstants: [
      'true', 'false', 'null', 'FLT_MAX', 'MINUS_FLT_MAX'
    ],

    beamTypes: [
      '|NORMAL', '|HYDRO', '|ANISOTROPIC', '|BOUNDED', '|SUPPORT',
      '|PRESSURED', '|LBEAM', '|TIRESIDE', '|BROKEN'
    ],

    tokenizer: {
      root: [
        // Comments
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],

        // JBeam section identifiers (strings that match keywords or headers)
        [/"(nodes|beams|triangles|quads|slots|slots2|variables|refNodes|flexbodies|information|props|hydros)"(?=\s*:)/, 'keyword.section'],

        // Strings
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string'],

        // Variables ($var, $=expression)
        [/\$[a-zA-Z0-9_]+/, 'variable.name'],
        [/\$=[^",\]]+/, 'variable.expression'],

        // Beam types
        [/\|[A-Z_]+/, 'type.identifier'],

        // Numbers (float, int, scientific)
        [/[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/, 'number'],

        // Identifiers / Constants
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@specialConstants': 'constant.language',
            '@default': 'identifier'
          }
        }],

        // Delimiters & punctuation
        [/[{}()\[\]]/, '@brackets'],
        [/[:,]/, 'delimiter'],

        // Whitespace
        { include: '@whitespace' }
      ],

      whitespace: [
        [/[ \t\r\n]+/, 'white']
      ],

      comment: [
        [/[^\/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment']
      ],

      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop']
      ]
    }
  });

  // Define custom dark theme matching BeamNG.drive design system
  monaco.editor.defineTheme('jbeam-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword.section', foreground: 'FF6600', fontStyle: 'bold' },
      { token: 'keyword', foreground: 'FF8533', fontStyle: 'bold' },
      { token: 'variable.name', foreground: 'FFFFFF', fontStyle: 'bold' },
      { token: 'variable.expression', foreground: 'FFC107' },
      { token: 'type.identifier', foreground: 'FFC107' },
      { token: 'number', foreground: '4CAF50' },
      { token: 'string', foreground: 'E2A053' },
      { token: 'comment', foreground: '737373', fontStyle: 'italic' },
      { token: 'constant.language', foreground: 'FF8533' }
    ],
    colors: {
      'editor.background': '#1A1A1A',
      'editor.foreground': '#FFFFFF',
      'editorLineNumber.foreground': '#737373',
      'editorLineNumber.activeForeground': '#FF6600',
      'editorCursor.foreground': '#FF6600',
      'editor.lineHighlightBackground': '#262626',
      'editor.selectionBackground': '#FF660040',
      'editor.selectionHighlightBackground': '#FF853326',
      'editorBracketMatch.background': '#FF660022',
      'editorBracketMatch.border': '#FF6600'
    }
  });

  // Register Monaco Hover Provider for BeamNG parameter documentation & breadcrumbs
  registerJBeamHoverProvider(monaco);
}

export default {
  JBEAM_LANGUAGE_ID,
  registerJBeamLanguage
};

