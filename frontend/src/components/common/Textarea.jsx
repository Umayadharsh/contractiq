import React from 'react';

export default function Textarea({
  label,
  id,
  error,
  hint,
  className = '',
  rows = 3,
  ...props
}) {
  const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="ciq-form-group">
      {label && (
        <label htmlFor={textareaId} className="ciq-label">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        className={`ciq-textarea ${error ? 'ciq-input-error' : ''} ${className}`.trim()}
        {...props}
      />
      {hint && !error && <span className="ciq-form-hint">{hint}</span>}
      {error && <span className="ciq-form-hint" style={{ color: 'var(--ciq-danger-text)' }}>{error}</span>}
    </div>
  );
}
