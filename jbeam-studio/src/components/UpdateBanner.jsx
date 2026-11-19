import React from 'react';
import AppBrandName from './AppBrandName.jsx';
import { CloseIcon } from './Icons.jsx';

/**
 * BeamNG Themed In-App Update Notification Banner
 * Matches the official BeamNG.drive dark UI style
 */
export function UpdateBanner({ updateInfo, onDismiss }) {
  if (!updateInfo || !updateInfo.latestVersion) return null;

  const handleUpdateClick = () => {
    if (updateInfo.htmlUrl) {
      if (window.jbeamAPI && window.jbeamAPI.openExternalUrl) {
        window.jbeamAPI.openExternalUrl(updateInfo.htmlUrl);
      } else {
        window.open(updateInfo.htmlUrl, '_blank');
      }
    }
  };

  return (
    <div className="bng-update-banner" role="alert">
      <div className="bng-update-left">
        <span className="bng-update-pulse"></span>
        <div className="bng-update-text">
          <span className="bng-update-title">
            <AppBrandName /> Update Available
          </span>
          <span className="bng-update-badge">v{updateInfo.latestVersion}</span>
          <span className="bng-update-desc">
            {updateInfo.name ? updateInfo.name : 'A new version has been released!'}
          </span>
        </div>
      </div>

      <div className="bng-update-actions">
        <button
          type="button"
          className="bng-btn primary bng-update-btn"
          onClick={handleUpdateClick}
          title="Open release download page"
        >
          VIEW & UPDATE
        </button>
        <button
          type="button"
          className="bng-update-close"
          onClick={onDismiss}
          title="Dismiss notification"
          aria-label="Dismiss notification"
        >
          <CloseIcon size={13} />
        </button>
      </div>
    </div>
  );
}

export default UpdateBanner;

