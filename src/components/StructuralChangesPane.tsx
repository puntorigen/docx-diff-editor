/**
 * Structural Changes Pane Component
 * 
 * A floating, collapsible panel that displays structural changes
 * (table rows, list items, images, etc.) with Accept/Reject controls.
 * 
 * Uses SuperDoc's acceptTrackedChangeById/rejectTrackedChangeById commands
 * to handle accept/reject actions.
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { StructuralChangeInfo, StructuralPanePosition } from '../types';

// ============================================================================
// Types
// ============================================================================

interface StructuralChangesPaneProps {
  /** Array of structural changes to display */
  changes: StructuralChangeInfo[];
  
  /** Position of the pane */
  position?: StructuralPanePosition;
  
  /** Start collapsed? */
  initiallyCollapsed?: boolean;
  
  /** Callback when a change is accepted */
  onAccept: (changeId: string) => void;
  
  /** Callback when a change is rejected */
  onReject: (changeId: string) => void;
  
  /** Callback when Accept All is clicked */
  onAcceptAll: () => void;
  
  /** Callback when Reject All is clicked */
  onRejectAll: () => void;
  
  /** Callback when a change is clicked (for navigation) */
  onNavigate?: (changeId: string) => void;
  
  /** Callback when pane is dismissed */
  onDismiss?: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get icon for change type
 */
function getChangeIcon(type: StructuralChangeInfo['type']): string {
  switch (type) {
    case 'rowInsert':
    case 'columnInsert':
    case 'paragraphInsert':
    case 'listItemInsert':
    case 'imageInsert':
      return '➕';
    case 'rowDelete':
    case 'columnDelete':
    case 'paragraphDelete':
    case 'listItemDelete':
    case 'imageDelete':
      return '➖';
    case 'attrChange':
      return '✏️';
    default:
      return '•';
  }
}

/**
 * Get human-readable label for change type
 */
function getChangeLabel(type: StructuralChangeInfo['type']): string {
  switch (type) {
    case 'rowInsert':
      return 'Row inserted';
    case 'rowDelete':
      return 'Row deleted';
    case 'columnInsert':
      return 'Column inserted';
    case 'columnDelete':
      return 'Column deleted';
    case 'paragraphInsert':
      return 'Paragraph inserted';
    case 'paragraphDelete':
      return 'Paragraph deleted';
    case 'listItemInsert':
      return 'List item inserted';
    case 'listItemDelete':
      return 'List item deleted';
    case 'imageInsert':
      return 'Image inserted';
    case 'imageDelete':
      return 'Image deleted';
    case 'attrChange':
      return 'Formatting changed';
    default:
      return 'Change';
  }
}

/**
 * Format date for display
 */
function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

// ============================================================================
// Component
// ============================================================================

export const StructuralChangesPane: React.FC<StructuralChangesPaneProps> = ({
  changes,
  position = 'bottom-right',
  initiallyCollapsed = false,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  onNavigate,
  onDismiss,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(initiallyCollapsed);
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // Auto-hide when no changes
  useEffect(() => {
    if (changes.length === 0) {
      setIsAnimatingOut(true);
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(true);
      setIsAnimatingOut(false);
    }
  }, [changes.length]);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, 300);
  }, [onDismiss]);

  // Handle toggle collapse
  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  // Handle accept single change
  const handleAccept = useCallback((e: React.MouseEvent, changeId: string) => {
    e.stopPropagation();
    onAccept(changeId);
  }, [onAccept]);

  // Handle reject single change
  const handleReject = useCallback((e: React.MouseEvent, changeId: string) => {
    e.stopPropagation();
    onReject(changeId);
  }, [onReject]);

  // Handle navigate to change
  const handleNavigate = useCallback((changeId: string) => {
    onNavigate?.(changeId);
  }, [onNavigate]);

  // Don't render if not visible
  if (!isVisible) return null;

  // Position classes
  const positionClasses: Record<StructuralPanePosition, string> = {
    'top-right': 'dde-pane--top-right',
    'bottom-right': 'dde-pane--bottom-right',
    'top-left': 'dde-pane--top-left',
    'bottom-left': 'dde-pane--bottom-left',
  };

  return (
    <div
      className={`dde-structural-pane ${positionClasses[position]} ${
        isAnimatingOut ? 'dde-pane--animating-out' : ''
      } ${isCollapsed ? 'dde-pane--collapsed' : ''}`}
      role="region"
      aria-label="Structural Changes"
    >
      {/* Header */}
      <div className="dde-pane__header" onClick={handleToggleCollapse}>
        <div className="dde-pane__title">
          <span className="dde-pane__icon">📋</span>
          <span className="dde-pane__label">
            Structural Changes
            <span className="dde-pane__count">{changes.length}</span>
          </span>
        </div>
        <div className="dde-pane__controls">
          <button
            className="dde-pane__btn dde-pane__btn--collapse"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleCollapse();
            }}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? '+' : '−'}
          </button>
          <button
            className="dde-pane__btn dde-pane__btn--close"
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            aria-label="Close"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Body - only visible when not collapsed */}
      {!isCollapsed && (
        <>
          <div className="dde-pane__body">
            {changes.length === 0 ? (
              <div className="dde-pane__empty">No structural changes</div>
            ) : (
              <ul className="dde-pane__list">
                {changes.map((change) => (
                  <li
                    key={change.id}
                    className="dde-pane__item"
                    onClick={() => handleNavigate(change.id)}
                  >
                    <div className="dde-pane__item-header">
                      <span className="dde-pane__item-icon">
                        {getChangeIcon(change.type)}
                      </span>
                      <span className="dde-pane__item-label">
                        {getChangeLabel(change.type)}
                      </span>
                    </div>
                    <div className="dde-pane__item-location">
                      {change.location}
                    </div>
                    <div className="dde-pane__item-preview">
                      {change.preview}
                    </div>
                    <div className="dde-pane__item-meta">
                      <span className="dde-pane__item-author">
                        {change.author.name}
                      </span>
                      <span className="dde-pane__item-date">
                        {formatDate(change.date)}
                      </span>
                    </div>
                    <div className="dde-pane__item-actions">
                      <button
                        className="dde-pane__action dde-pane__action--accept"
                        onClick={(e) => handleAccept(e, change.id)}
                        title="Accept change"
                      >
                        Accept
                      </button>
                      <button
                        className="dde-pane__action dde-pane__action--reject"
                        onClick={(e) => handleReject(e, change.id)}
                        title="Reject change"
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer with bulk actions */}
          {changes.length > 0 && (
            <div className="dde-pane__footer">
              <button
                className="dde-pane__bulk-btn dde-pane__bulk-btn--accept"
                onClick={onAcceptAll}
              >
                Accept All
              </button>
              <button
                className="dde-pane__bulk-btn dde-pane__bulk-btn--reject"
                onClick={onRejectAll}
              >
                Reject All
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StructuralChangesPane;
