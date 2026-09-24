import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { dismissToast, selectToasts } from '../features/ui/uiSlice';

/** Toast stack rendered once in the app shell. */
const ToastStack = () => {
  const dispatch = useDispatch();
  const toasts = useSelector(selectToasts);

  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const timers = toasts.map((toast) =>
      setTimeout(() => dispatch(dismissToast(toast.id)), 5000),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dispatch]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`} role="status">
          {toast.title ? <div className="toast__title">{toast.title}</div> : null}
          <div>{toast.message}</div>
          <button
            type="button"
            className="btn--ghost btn--sm"
            onClick={() => dispatch(dismissToast(toast.id))}
            style={{ marginTop: '0.35rem' }}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastStack;
