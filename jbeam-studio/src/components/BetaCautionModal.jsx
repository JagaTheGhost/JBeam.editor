import React, { useState, useEffect } from 'react';
import { WarningIcon, CloseIcon } from './Icons.jsx';

/**
 * Early Beta Safety Notice Modal
 * Warns users to backup existing working vehicle mods before editing.
 */
export function BetaCautionModal({
  isOpen,
  version = 'v0.2Beta',
  onAcknowledge,
  onClose
}) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDontShowAgain(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onAcknowledge(dontShowAgain);
  };

  return (
    <div className="blueprint-modal-backdrop beta-caution-backdrop" onClick={onClose}>
      <div
        className="bng-dialog-card beta-caution-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="beta-caution-title"
      >
        {/* Header */}
        <div className="bng-dialog-header beta-caution-header">
          <div className="beta-caution-header-title">
            <span className="beta-caution-icon-pill">
              <WarningIcon size={18} />
            </span>
            <span id="beta-caution-title" className="bng-dialog-title">
              Early Development Beta Notice ({version})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bng-dialog-close-btn"
            title="Close Notice (Esc)"
          >
            <CloseIcon size={12} />
          </button>
        </div>

        {/* Body Content */}
        <div className="bng-dialog-body beta-caution-body">
          <div className="beta-caution-lead">
            <strong>⚠️ Important Safety Recommendation:</strong>
          </div>
          <p className="beta-caution-paragraph">
            This editor is currently in active <strong>Beta ({version})</strong> — an early development stage. You can expect occasional bugs, syntax glitches, or unexpected file writes that could alter or ruin your previous work.
          </p>

          <div className="beta-caution-callout">
            <div className="beta-caution-callout-icon">💾</div>
            <div className="beta-caution-callout-text">
              <strong>Please take time to create a backup copy</strong> of your previous working vehicle mods before opening and editing them in JBeam.editor.
              <br />
              <span className="beta-caution-callout-sub">Do not directly edit your only working copy of a project!</span>
            </div>
          </div>

          <p className="beta-caution-note">
            The developer suggests always working on a duplicate copy. Thank you for testing and supporting JBeam.editor development!
          </p>
        </div>

        {/* Footer Actions */}
        <div className="beta-caution-footer">
          <label className="beta-caution-checkbox-label">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="beta-caution-checkbox"
            />
            <span>Don't show again until next update ({version})</span>
          </label>

          <button
            type="button"
            className="bng-btn primary beta-caution-confirm-btn"
            onClick={handleConfirm}
            title="Acknowledge notice and continue"
          >
            Thanks for the headsUP dev
          </button>
        </div>
      </div>
    </div>
  );
}

export default BetaCautionModal;
