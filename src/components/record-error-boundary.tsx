"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export class RecordErrorBoundary extends Component<
  { children: ReactNode; fallbackTitle: string; fallbackDescription: string; onReset?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium">{this.props.fallbackTitle}</p>
        <p className="max-w-md text-sm text-muted-foreground">{this.props.fallbackDescription}</p>
        {this.props.onReset ? (
          <Button type="button" variant="outline" onClick={this.props.onReset}>
            Close
          </Button>
        ) : null}
      </div>
    );
  }
}
