import type { ReactNode } from 'react';
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Check } from 'lucide-react';
import './Checkbox.css';

// A checkbox with its label. The whole row is the click target (the label
// wraps the box), Space toggles it, and the state is data-checked for the look.
// `description` trails the label, quieter: the webhook tab shows the event's
// name there (page.created).

export type CheckboxProps = {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
};

export function Checkbox({ label, checked, onCheckedChange, description, disabled, className }: CheckboxProps) {
  return (
    <label className={'ui-checkbox' + (className ? ' ' + className : '')}>
      <BaseCheckbox.Root
        className="ui-checkbox-box"
        checked={checked}
        onCheckedChange={(c) => onCheckedChange(c)}
        disabled={disabled}
      >
        <BaseCheckbox.Indicator className="ui-checkbox-indicator">
          <Check aria-hidden="true" strokeWidth={3} />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span className="ui-checkbox-label">{label}</span>
      {description && <span className="ui-checkbox-description">{description}</span>}
    </label>
  );
}
