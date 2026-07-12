import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, Inbox, LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva('ui-button', {
  variants: {
    variant: {
      primary: 'ui-button--primary',
      secondary: 'ui-button--secondary',
      ghost: 'ui-button--ghost',
      danger: 'ui-button--danger',
    },
    size: { sm: 'ui-button--sm', md: 'ui-button--md', icon: 'ui-button--icon' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

export function Button({
  asChild,
  className,
  variant,
  size,
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={!asChild ? disabled || loading : undefined}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="ui-spinner" aria-hidden="true" /> : null}
      {children}
    </Component>
  );
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function TextField({ label, hint, error, className, id, ...props }: TextFieldProps) {
  const fieldId = id ?? props.name;
  const descriptionId = `${fieldId}-description`;
  return (
    <label className="ui-field" htmlFor={fieldId}>
      <span className="ui-field__label">{label}</span>
      <input
        {...props}
        id={fieldId}
        className={cn('ui-input', className)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hint || error ? descriptionId : undefined}
      />
      {hint || error ? (
        <span id={descriptionId} className={cn('ui-field__hint', error && 'ui-field__error')}>
          {error ?? hint}
        </span>
      ) : null}
    </label>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="ui-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  children: ReactNode;
}) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`ui-alert ui-alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <AlertCircle aria-hidden="true" />
      <div>
        {title ? <strong>{title}</strong> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon?: LucideIcon;
}) {
  return (
    <article className="ui-metric">
      <div className="ui-metric__label">
        {Icon ? <Icon aria-hidden="true" /> : null}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="ui-empty-state">
      <Icon aria-hidden="true" />
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('ui-skeleton', className)} aria-hidden="true" />;
}

export function MessageBubble({
  direction,
  channel,
  time,
  children,
}: {
  direction: 'inbound' | 'outbound';
  channel?: string;
  time?: string;
  children: ReactNode;
}) {
  return (
    <div className={`ui-message ui-message--${direction}`}>
      <div>{children}</div>
      {channel || time ? <small>{[channel, time].filter(Boolean).join(' · ')}</small> : null}
    </div>
  );
}

export function Toast({
  tone = 'info',
  children,
  onDismiss,
}: {
  tone?: 'info' | 'success' | 'danger';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className={`ui-toast ui-toast--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onDismiss ? (
        <button type="button" aria-label="Bildirimi kapat" onClick={onDismiss}>
          ×
        </button>
      ) : null}
    </div>
  );
}

export function Modal({
  title,
  description,
  children,
  actions,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="ui-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-modal-title"
      >
        <header>
          <div>
            <h2 id="ui-modal-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" aria-label="Pencereyi kapat" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="ui-modal__body">{children}</div>
        {actions ? <footer>{actions}</footer> : null}
      </section>
    </div>
  );
}
