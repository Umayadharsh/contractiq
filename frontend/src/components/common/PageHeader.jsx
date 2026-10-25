import React from 'react';

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className = '',
}) {
  return (
    <div className={`ciq-page-header ${className}`.trim()}>
      <div>
        {eyebrow && <div className="ciq-page-header-eyebrow">{eyebrow}</div>}
        <h1 className="ciq-page-header-title">{title}</h1>
        {description && <p className="ciq-page-header-desc">{description}</p>}
      </div>
      {actions && <div className="ciq-page-header-actions">{actions}</div>}
    </div>
  );
}
