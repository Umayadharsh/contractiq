import React from 'react';
import { FileQuestion } from 'lucide-react';
import Button from './Button';

export default function EmptyState({
  icon: Icon = FileQuestion,
  title = 'No items found',
  description = 'There is nothing to display here at the moment.',
  actionLabel,
  onAction,
  actionIcon,
}) {
  return (
    <div className="ciq-empty-state">
      <div className="ciq-empty-icon-wrap">
        <Icon size={26} />
      </div>
      <h3 className="ciq-empty-title">{title}</h3>
      <p className="ciq-empty-desc">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" icon={actionIcon} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
