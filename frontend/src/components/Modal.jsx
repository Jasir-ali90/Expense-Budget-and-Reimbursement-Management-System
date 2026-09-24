import React, { useEffect } from 'react';

/**
 * Accessible modal dialog plus a small confirmation helper.
 * Closes on Escape and on backdrop click.
 */
export const Modal = ({ open, title, onClose, children, footer, wide = false }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className={`modal${wide ? ' modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__header">
          <h3 className="card__title">{title}</h3>
          <button type="button" className="modal__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__footer">{footer}</div> : null}
      </div>
    </div>
  );
};

/** Yes/no confirmation used before destructive or irreversible actions. */
export const ConfirmModal = ({
  open,
  title = 'Please confirm',
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
  children,
}) => (
  <Modal
    open={open}
    title={title}
    onClose={busy ? undefined : onCancel}
    footer={
      <>
        <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${tone === 'danger' ? 'btn--danger' : ''}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </>
    }
  >
    {message ? <p className="small">{message}</p> : null}
    {children}
  </Modal>
);

export default Modal;
