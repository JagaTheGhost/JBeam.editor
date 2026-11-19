import React, { useState, useEffect, useRef } from 'react';

/**
 * Custom dark-themed numeric stepper component.
 * Replaces ugly default browser white spin buttons with sleek, dark-themed
 * increase/decrease chevron controls matching the BeamNG / JBeam Studio design system.
 */
export default function NumberStepper({
  value,
  onChange,
  min = undefined,
  max = undefined,
  step = 1,
  className = '',
  style = {},
  title = '',
  disabled = false,
  width = undefined
}) {
  const [internalText, setInternalText] = useState(String(value ?? ''));
  const isHoldingRef = useRef(null);
  const holdIntervalRef = useRef(null);

  useEffect(() => {
    setInternalText(String(value ?? ''));
  }, [value]);

  const cleanNum = (val) => {
    const n = Number(val);
    return isNaN(n) ? (min !== undefined ? min : 0) : n;
  };

  const commitChange = (rawVal) => {
    let num = cleanNum(rawVal);
    if (min !== undefined && num < min) num = min;
    if (max !== undefined && num > max) num = max;
    setInternalText(String(num));
    if (onChange && num !== value) {
      onChange(num);
    }
  };

  const handleStep = (direction) => {
    if (disabled) return;
    const current = cleanNum(value);
    const precision = (String(step).split('.')[1] || '').length;
    let next = direction > 0 ? current + step : current - step;
    if (precision > 0) {
      next = parseFloat(next.toFixed(precision));
    }
    if (min !== undefined && next < min) next = min;
    if (max !== undefined && next > max) next = max;
    setInternalText(String(next));
    if (onChange) onChange(next);
  };

  const handleInputChange = (e) => {
    setInternalText(e.target.value);
  };

  const handleBlur = () => {
    commitChange(internalText);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleStep(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleStep(-1);
    } else if (e.key === 'Enter') {
      commitChange(internalText);
    }
  };

  const startHold = (direction) => {
    handleStep(direction);
    isHoldingRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        handleStep(direction);
      }, 70);
    }, 320);
  };

  const stopHold = () => {
    if (isHoldingRef.current) clearTimeout(isHoldingRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    isHoldingRef.current = null;
    holdIntervalRef.current = null;
  };

  const containerStyle = {
    ...(width ? { width } : {}),
    ...style
  };

  return (
    <div
      className={`dark-number-stepper ${disabled ? 'disabled' : ''} ${className}`}
      style={containerStyle}
      title={title}
    >
      <input
        type="text"
        inputMode="numeric"
        value={internalText}
        onChange={handleInputChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="dark-stepper-input"
      />
      <div className="dark-stepper-buttons">
        <button
          type="button"
          className="dark-stepper-btn dark-stepper-btn-up"
          onMouseDown={() => startHold(1)}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          disabled={disabled || (max !== undefined && Number(value) >= max)}
          tabIndex={-1}
          aria-label="Increase value"
        >
          <svg width="7" height="4" viewBox="0 0 7 4" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.5 0.5L6.5 3.5H0.5L3.5 0.5Z" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className="dark-stepper-btn dark-stepper-btn-down"
          onMouseDown={() => startHold(-1)}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          disabled={disabled || (min !== undefined && Number(value) <= min)}
          tabIndex={-1}
          aria-label="Decrease value"
        >
          <svg width="7" height="4" viewBox="0 0 7 4" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.5 3.5L0.5 0.5H6.5L3.5 3.5Z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
