import React from 'react';

/**
 * Official application brand name component: JBeam.editor
 * Styles 'JBeam' in bold white/main theme color, and '.editor' in vibrant Azure / Sky Blue (#0099FF),
 * mirroring the official BeamNG.drive logo styling.
 */
export function AppBrandName({ className = '', fontSize, style = {} }) {
  return (
    <span className={`bng-app-brand-name ${className}`} style={{ ...style, fontSize }}>
      <span className="brand-name-base">JBeam</span>
      <span className="brand-name-ext">.editor</span>
    </span>
  );
}

export default AppBrandName;

