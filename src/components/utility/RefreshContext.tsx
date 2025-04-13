/**
 * src/components/utility/RefreshContext.tsx
 * 
 * == Refresh Context Wrapper ==
 * This file defines a React Context for managing a refresh state across a component tree.
 * Components can use this context to trigger a refresh and listen for changes in the refresh state.
 * 
 * refresh triggered with triggerRefresh()
 * 
 * Wrap the component with <RefreshProvider> to allow use for all wrapped components
 * 
 */

import React, { createContext, useContext, useState } from "react";

/** Define Refresh Context */
interface RefreshContextType {
  /** A numeric key that increments to trigger a refresh */
  refreshKey: number;

  /** Function to trigger a refresh by updating `refreshKey` */
  triggerRefresh: () => void;
}

/** React Context for managing refresh state */
const RefreshContext = createContext<RefreshContextType | undefined>(undefined);


/**
 * Custom hook to access the RefreshContext.
 * Ensures that the hook is only used within a RefreshProvider.
 *
 * @returns {RefreshContextType} The refresh context with `refreshKey` and `triggerRefresh`
 * @throws {Error} If used outside of a `RefreshProvider`
 */
export const useRefresh = () => {
  const context = useContext(RefreshContext);
  if (!context) {
    throw new Error("useRefresh must be used within a RefreshProvider");
  }
  return context;
};


/**
 * Provides the RefreshContext to child components.
 *
 * @param {object} props - The component props
 * @param {React.ReactNode} props.children - The child components wrapped by the provider
 * @returns {JSX.Element} The context provider component
 */
export const RefreshProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [refreshKey, setRefreshKey] = useState<number>(0);

  /**Increment refresh key to trigger refresh */
  const triggerRefresh = () => {
    setRefreshKey((prevKey) => prevKey + 1);
  };

  return (
    <RefreshContext.Provider value={{ refreshKey, triggerRefresh }}>
      {children}
    </RefreshContext.Provider>
  );
};
