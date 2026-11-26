import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Field as BaseField } from '@base-ui/react/field';
import { Input as BaseInput } from '@base-ui/react/input';
import './Field.css';

// A labelled control. Field links the label to the control and announces the
// hint and the error through aria-describedby, which hand-built forms did one
// at a time or not at all. `children` is the control: usually <Input>, or any
// Base UI control that works with Field.

export type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
};

export function Field({ label, hint, error, disabled, className, children }: FieldProps) {
  return (
    <BaseField.Root className={'ui-field' + (className ? ' ' + className : '')} invalid={!!error} disabled={disabled}>
      <BaseField.Label className="ui-field-label">{label}</BaseField.Label>
      {children}
      {hint && <BaseField.Description className="ui-field-hint">{hint}</BaseField.Description>}
      {/* match: shown whenever `error` is set, not only after Base UI's own
          validation ran; the caller decides what is wrong. */}
      {error && (
        <BaseField.Error className="ui-field-error" match>
          {error}
        </BaseField.Error>
      )}
    </BaseField.Root>
  );
}

export type InputProps = Omit<ComponentPropsWithoutRef<typeof BaseInput>, 'className'> & {
  className?: string;
  /** default: a form's field. cell: a field that fills a table cell while its
   *  value is typed in place (spec 026): flat, a lighter fill and a thin
   *  rounded outline, no lift or shadow, so the row keeps its height. */
  variant?: 'default' | 'cell';
};

export function Input({ className, variant = 'default', ...rest }: InputProps) {
  return (
    <BaseInput
      className={'ui-input' + (className ? ' ' + className : '')}
      data-variant={variant === 'default' ? undefined : variant}
      {...rest}
    />
  );
}
