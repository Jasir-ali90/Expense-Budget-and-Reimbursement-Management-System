import React, { useState } from 'react';

/**
 * Form primitives with labels, hints and inline validation messages.
 * The backend re-validates everything; these messages are a convenience.
 */

export const Field = ({ label, required, hint, error, children, htmlFor }) => (
  <div className="field">
    {label ? (
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="req">*</span> : null}
      </label>
    ) : null}
    {children}
    {hint && !error ? <span className="field__hint">{hint}</span> : null}
    {error ? <span className="field__error">{error}</span> : null}
  </div>
);

export const TextInput = ({ label, required, hint, error, id, ...props }) => {
  const inputId = id || `f-${String(label || 'input').replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={inputId}>
      <input id={inputId} className={`input${error ? ' input--error' : ''}`} {...props} />
    </Field>
  );
};

/** Eye / eye-off glyphs for the password toggle (no icon dependency). */
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path
      d="M12 5C7.5 5 4 9.2 4 12s3.5 7 8 7 8-4.2 8-7-3.5-7-8-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z"
      fill="currentColor"
    />
    <circle cx="12" cy="12" r="2.6" fill="currentColor" />
  </svg>
);

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path
      d="m3.3 3.3-1.3 1.3 3 3C3.5 9 2.7 10.5 2.4 11.4a1 1 0 0 0 0 .4C4 15.6 7.6 19 12 19c1.7 0 3.3-.5 4.7-1.3l3.7 3.7 1.3-1.3L3.3 3.3ZM12 17c-3.3 0-6.1-2.4-7.5-5 .3-.8 1-2 2.1-3l2 2A4.5 4.5 0 0 0 14 15.1l1.7 1.7c-1.1.2-2.2.2-3.7.2Zm0-10c3.3 0 6.1 2.4 7.5 5-.3.7-.8 1.6-1.6 2.4l1.4 1.4c1.3-1.3 2.2-2.8 2.4-3.6a1 1 0 0 0 0-.4C20 7.4 16.4 4 12 4c-1.2 0-2.4.2-3.5.7l1.6 1.6c.6-.2 1.2-.3 1.9-.3Z"
      fill="currentColor"
    />
  </svg>
);

/**
 * Password field with a show / hide toggle.
 * The toggle is a real button (keyboard accessible) and it exposes its state
 * through aria-pressed, so assistive tech announces exactly what it does.
 */
export const PasswordInput = ({ label, required, hint, error, id, ...props }) => {
  const [visible, setVisible] = useState(false);
  const inputId = id || `f-${String(label || 'password').replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={inputId}>
      <div className={`input-group${error ? ' input-group--error' : ''}`}>
        <input
          id={inputId}
          className="input input-group__input"
          type={visible ? 'text' : 'password'}
          {...props}
        />
        <button
          type="button"
          className="input-group__toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          title={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </Field>
  );
};

export const TextArea = ({ label, required, hint, error, id, ...props }) => {
  const inputId = id || `f-${String(label || 'textarea').replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={inputId}>
      <textarea id={inputId} className={`textarea${error ? ' input--error' : ''}`} {...props} />
    </Field>
  );
};

export const Select = ({ label, required, hint, error, id, options = [], children, ...props }) => {
  const inputId = id || `f-${String(label || 'select').replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={inputId}>
      <select id={inputId} className={`select${error ? ' input--error' : ''}`} {...props}>
        {children ||
          options.map((option) => (
            <option key={option.value ?? option} value={option.value ?? option}>
              {option.label ?? option}
            </option>
          ))}
      </select>
    </Field>
  );
};

export const Checkbox = ({ label, hint, id, ...props }) => {
  const inputId = id || `f-${String(label || 'checkbox').replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="field">
      <label className="checkbox" htmlFor={inputId}>
        <input id={inputId} type="checkbox" {...props} />
        <span>{label}</span>
      </label>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
};

/** Client-side required-field validation used before hitting the API. */
export const validateRequired = (values, rules) => {
  const errors = {};
  Object.entries(rules).forEach(([field, label]) => {
    const value = values?.[field];
    const missing =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0);
    if (missing) errors[field] = `${label} is required`;
  });
  return errors;
};

export default Field;
