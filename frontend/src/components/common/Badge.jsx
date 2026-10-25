import React from 'react';

export default function Badge({
  children,
  variant = 'neutral', // success, warning, danger, info, neutral
  dot = false,
  pill = false,
  className = '',
  ...props
}) {
  return (
    <span
      className={`ciq-badge ciq-badge-${variant} ${pill ? 'ciq-badge-pill' : ''} ${className}`.trim()}
      {...props}
    >
      {dot && <span className="ciq-badge-dot" />}
      {children}
    </span>
  );
}

export function RiskBadge({ severity, status, score }) {
  const norm = (severity || status || '').toLowerCase();
  let variant = 'neutral';
  let label = severity || status || 'Unknown';

  if (norm.includes('pass') || norm.includes('low') || norm.includes('approved')) {
    variant = 'success';
  } else if (norm.includes('warn') || norm.includes('major') || norm.includes('needsreview') || norm.includes('waiting')) {
    variant = 'warning';
  } else if (norm.includes('critical') || norm.includes('danger') || norm.includes('high') || norm.includes('fail') || norm.includes('non-compliant') || norm.includes('rejected')) {
    variant = 'danger';
  } else if (norm.includes('info') || norm.includes('escalate')) {
    variant = 'info';
  }

  return (
    <Badge variant={variant} dot>
      {score !== undefined ? `${score}/100 ` : ''}{label}
    </Badge>
  );
}
