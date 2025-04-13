/**
 * src/components/utility/ToastProvider.tsx
 * 
 * == Toast Message Provider ==
 * A React Context for providing toast messages. Each message lingers 3 seconds.
 * Should wrap <App/> in src/main.tsx for global toast usage
 * 
 * declare hook with
 *    import { useToast } from '../utility/ToastProvider';
 * 
 * create toast with
 *    const addToast = useToast();
 *    addToast("message");
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import '../../App.css'; // Import CSS for toast styles

/** ToastContext to allow toast creation from anywhere*/
const ToastContext = createContext<(message: string) => void>(() => {});

/**
 * Custom hook to access the ToastContext.
 * @returns {(message: string) => void} A function to trigger toast messages.
 */
export const useToast = () => {
  return useContext(ToastContext);
};

interface Toast {
  id: number;
  message: string;
}

/**
 * Provides the ToastContext to wrap the entire app.
 *
 * @param {object} props - The component props.
 * @param {React.ReactNode} props.children - The children components wrapped by the provider.
 * @returns {JSX.Element} The ToastProvider component.
 */
export const ToastProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  /**
   * Adds a toast notification.
   *
   * @param {string} message - Message to toast.
   */
  const addToast = useCallback((message: string) => {
    const id = Date.now(); // Unique ID for each toast
    setToasts((prev) => [...prev, { id, message }]);
  }, []);

  /** Automatically remove the first toast after 3 seconds (duration of the slide-out animation) */
  useEffect(() => {
    if (toasts.length > 0) {
      const timer = setTimeout(() => {
        setToasts((prev) => prev.slice(1)); // Remove the first toast
      }, 3000); // Set a timeout for 3 seconds

      return () => clearTimeout(timer); // Cleanup timer when component unmounts
    }
  }, [toasts]);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
