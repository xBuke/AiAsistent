interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`admin-toggle-switch ${checked ? 'admin-toggle-switch--checked' : ''}`}
    >
      <span className="admin-toggle-switch__knob" />
    </button>
  );
}
