import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { pushToast } from '../features/ui/uiSlice';

/**
 * Toast helper for action feedback:
 *   const toast = useToast();
 *   toast.success('Claim submitted', 'Your claim is now with the Finance Manager.');
 */
export const useToast = () => {
  const dispatch = useDispatch();

  return useMemo(
    () => ({
      success: (title, message) => dispatch(pushToast({ title, message, tone: 'success' })),
      error: (title, message) => dispatch(pushToast({ title, message, tone: 'error' })),
      warning: (title, message) => dispatch(pushToast({ title, message, tone: 'warning' })),
      info: (title, message) => dispatch(pushToast({ title, message, tone: 'info' })),
    }),
    [dispatch],
  );
};

export default useToast;
