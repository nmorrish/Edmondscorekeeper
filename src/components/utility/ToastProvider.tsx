import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import '../../App.css'; // Import CSS for toast styles

// ToastContext to allow toast creation from anywhere
const ToastContext = createContext<(message: string) => void>(() => {});

export const useToast = () => {
  return useContext(ToastContext);
};

interface Toast {
  id: number;
  message: string;
}

// ToastProvider to wrap the entire app
export const ToastProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string) => {
    const id = Date.now(); // Unique ID for each toast
    setToasts((prev) => [...prev, { id, message }]);
  }, []);

  useEffect(() => {
    if (toasts.length > 0) {
      // Automatically remove the first toast after 3 seconds (duration of the slide-out animation)
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
