import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ margin: "2rem", color: "red" }}>
          <h2>⚠ Something went wrong in this section.</h2>
          <p>{this.state.error?.message || "Unknown error"}</p>
          <p>Try refreshing the page to reset.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
