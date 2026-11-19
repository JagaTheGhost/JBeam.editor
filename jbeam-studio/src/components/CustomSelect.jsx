import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDownIcon, CheckIcon } from './Icons.jsx';

export default function CustomSelect({
  value,
  options = [], // [{ value, label, sublabel }] or strings
  onChange,
  placeholder = '-- Select --',
  className = '',
  title = '',
  searchable = true,
  compact = false,
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Normalize options to { value, label, sublabel }
  const normalizedOptions = useMemo(() => {
    return (options || []).map(opt => {
      if (typeof opt === 'string' || typeof opt === 'number') {
        return { value: opt, label: String(opt), sublabel: '' };
      }
      if (opt && typeof opt === 'object') {
        return {
          value: opt.value !== undefined ? opt.value : (opt.name || opt.fileName || String(opt)),
          label: opt.label || opt.name || opt.configurationName || opt.fileName || String(opt.value || opt),
          sublabel: opt.sublabel || (opt.fileName && opt.configurationName ? opt.fileName : '')
        };
      }
      return { value: '', label: '', sublabel: '' };
    });
  }, [options]);

  const selectedOption = useMemo(() => {
    return normalizedOptions.find(o => String(o.value) === String(value));
  }, [normalizedOptions, value]);

  // Outside click & escape listeners
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Drop-up calculation based on available screen space
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 220 && spaceAbove > spaceBelow) {
        setDropUp(true);
      } else {
        setDropUp(false);
      }
    }
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen && searchable && normalizedOptions.length > 7 && searchInputRef.current) {
      searchInputRef.current.focus();
    }
    if (!isOpen) {
      setFilterText('');
    }
  }, [isOpen, searchable, normalizedOptions.length]);

  const filteredOptions = useMemo(() => {
    if (!filterText) return normalizedOptions;
    const lower = filterText.toLowerCase();
    return normalizedOptions.filter(
      o => o.label.toLowerCase().includes(lower) || (o.sublabel && o.sublabel.toLowerCase().includes(lower))
    );
  }, [normalizedOptions, filterText]);

  const displayTitle = title || (selectedOption ? selectedOption.label : placeholder);

  return (
    <div
      className={`bng-custom-select-container ${isOpen ? 'is-open' : ''} ${compact ? 'is-compact' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
      ref={containerRef}
      title={displayTitle}
    >
      <button
        type="button"
        disabled={disabled}
        className="bng-custom-select-trigger"
        onClick={() => !disabled && setIsOpen(prev => !prev)}
      >
        <span className={`bng-custom-select-label ${!selectedOption ? 'placeholder' : ''}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDownIcon size={12} className={`bng-custom-select-chevron ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className={`bng-custom-select-dropdown ${dropUp ? 'drop-up' : ''}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {searchable && normalizedOptions.length > 7 && (
            <div className="bng-custom-select-search-box">
              <input
                ref={searchInputRef}
                type="text"
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                onKeyDown={e => e.stopPropagation()}
                placeholder="Filter options..."
                className="bng-custom-select-search-input"
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}

          <div className="bng-custom-select-items-list">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <div
                    key={`${opt.value}-${idx}`}
                    className={`bng-custom-select-item ${isSelected ? 'active' : ''}`}
                    title={opt.label}
                    onClick={() => {
                      if (onChange) onChange(opt.value);
                      setIsOpen(false);
                    }}
                  >
                    <div className="bng-custom-select-item-text">
                      <span className="bng-custom-select-item-title">{opt.label}</span>
                      {opt.sublabel && <span className="bng-custom-select-item-sub">{opt.sublabel}</span>}
                    </div>
                    {isSelected && <span className="bng-custom-select-item-check"><CheckIcon size={12} /></span>}
                  </div>
                );
              })
            ) : (
              <div className="bng-custom-select-empty">No matching options</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
