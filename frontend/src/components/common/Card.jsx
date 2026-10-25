import React from 'react';

export default function Card({
  children,
  title,
  subtitle,
  actions,
  footer,
  className = '',
  ...props
}) {
  return (
    <div className={`ciq-card ${className}`.trim()} {...props}>
      {(title || subtitle || actions) && (
        <div className="ciq-card-header">
          <div>
            {title && <h3 className="ciq-card-title">{title}</h3>}
            {subtitle && <p className="ciq-card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="ciq-card-actions">{actions}</div>}
        </div>
      )}
      <div className="ciq-card-body">{children}</div>
      {footer && <div className="ciq-card-footer">{footer}</div>}
    </div>
  );
}
