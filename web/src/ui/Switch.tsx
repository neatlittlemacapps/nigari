import type { ReactNode } from 'react';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import './Switch.css';

// An on/off setting that takes effect at once (a checkbox is for a choice that
// is saved later). Space toggles it; the state is data-checked.

export type SwitchProps = {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export function Switch({ label, checked, onCheckedChange, disabled, className }: SwitchProps) {
  return (
    <label className={'ui-switch' + (className ? ' ' + className : '')}>
      <BaseSwitch.Root className="ui-switch-track" checked={checked} onCheckedChange={(c) => onCheckedChange(c)} disabled={disabled}>
        <BaseSwitch.Thumb className="ui-switch-thumb" />
      </BaseSwitch.Root>
      <span className="ui-switch-label">{label}</span>
    </label>
  );
}
