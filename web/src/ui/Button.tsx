import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { chordFor } from '../keys';
import './Button.css';

// The one button. 356 hand-built <button>s chose their look from class
// combinations (btn, btn-sm, primary, danger) whose rules were stated four
// times over in styles.css and theme.css; this states it once, from tokens.
// Behaviour comes from Base UI: a disabled button stays out of the tab order
// and ignores clicks, with data-disabled for the look (spec 001, FR-009).

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = Omit<ComponentPropsWithoutRef<typeof BaseButton>, 'className'> & {
  /** primary: the ink pill, one per screen. secondary: a hairline, the default.
   *  ghost: no frame, for toolbars. danger: removes something. */
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  /** A shortcut id from keys.ts. Its live chord is shown after the label, and
   *  disappears when the shortcut is not bound here (FR-010). */
  shortcut?: string;
  className?: string;
  children?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', shortcut, className, children, type = 'button', ...rest },
  ref,
) {
  const chord = shortcut ? chordFor(shortcut) : '';
  return (
    <BaseButton
      ref={ref}
      type={type}
      className={'ui-button' + (className ? ' ' + className : '')}
      data-variant={variant}
      data-size={size}
      {...rest}
    >
      {children}
      {chord && <kbd className="ui-button-kbd">{chord}</kbd>}
    </BaseButton>
  );
});
