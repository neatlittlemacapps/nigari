import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Tooltip } from '@base-ui/react/tooltip';
import type { ButtonVariant } from './Button';
import './Button.css';
import './IconButton.css';

// A button that is only an icon must still have a name: a screen reader reads
// `label`, and a sighted user sees the same words in a tooltip on hover or
// keyboard focus. `label` is required for exactly that reason, and arrives
// already translated (FR-008).

export type IconButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'aria-label'> & {
  label: string;
  icon: ReactNode;
  variant?: Exclude<ButtonVariant, 'primary'>;
  size?: 'sm' | 'md';
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        ref={ref}
        type={type}
        aria-label={label}
        className={'ui-button ui-icon-button' + (className ? ' ' + className : '')}
        data-variant={variant}
        data-size={size}
        {...rest}
      >
        <span aria-hidden="true" className="ui-icon-button-icon">{icon}</span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className="ui-tooltip-positioner">
          <Tooltip.Popup className="ui-tooltip">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});
