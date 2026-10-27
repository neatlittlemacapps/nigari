import type { ReactNode } from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronsUpDown } from 'lucide-react';
import './Select.css';

// A choice from a short, fixed list. Arrow keys move, a typed letter jumps to
// the matching option, Escape closes and returns focus to the trigger: Base
// UI's behaviour, which the hand-built pickers each approximated. For a long
// or searchable list, a Combobox (a later batch) is the right control.

export type SelectOption = { value: string; label: ReactNode };

export type SelectProps = {
  label: ReactNode;
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

export function Select({ label, options, value, onValueChange, disabled, className }: SelectProps) {
  return (
    <div className={'ui-select' + (className ? ' ' + className : '')}>
      <BaseSelect.Root
        items={options}
        value={value}
        onValueChange={(v) => {
          if (typeof v === 'string') onValueChange(v);
        }}
        disabled={disabled}
      >
        {/* Select.Label names the trigger itself (aria-labelledby). */}
        <BaseSelect.Label className="ui-select-label">{label}</BaseSelect.Label>
        <BaseSelect.Trigger className="ui-select-trigger">
          <BaseSelect.Value className="ui-select-value" />
          <BaseSelect.Icon className="ui-select-icon">
            <ChevronsUpDown aria-hidden="true" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner className="ui-select-positioner" sideOffset={4}>
            <BaseSelect.Popup className="ui-select-popup">
              <BaseSelect.List>
                {options.map((o) => (
                  <BaseSelect.Item key={o.value} value={o.value} className="ui-select-item">
                    <BaseSelect.ItemIndicator className="ui-select-item-indicator">
                      <Check aria-hidden="true" />
                    </BaseSelect.ItemIndicator>
                    <BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </div>
  );
}
