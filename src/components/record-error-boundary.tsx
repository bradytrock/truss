"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";

export class RecordErrorBoundary extends Component<
  { children: ReactNode; fallbackTitle: string; fallbackDescription: string; onReset?: () => void },
  { failed: boolean; message: string }
> {
  state = { failed: false, message: "" };
  private retries = 0;

  static getDerivedStateFromError(error: unknown) {
    // Next throws this while reading the URL. Swallowing it leaves the fallback
    // on screen and the inbox never gets a second chance to render.
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "";
    return { failed: true, message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    // One render can throw before the router has search params. Retry once so a
    // single frame does not leave the inbox on this screen after the next render.
    if (this.retries < 1) {
      this.retries += 1;
      this.setState({ failed: false, message: "" });
    }
  }

  private recover = () => {
    this.retries = 0;
    this.setState({ failed: false, message: "" });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium">{this.props.fallbackTitle}</p>
        <p className="max-w-md text-sm text-muted-foreground">{this.props.fallbackDescription}</p>
        {this.state.message ? (
          <p className="max-w-md text-xs text-muted-foreground">{this.state.message}</p>
        ) : null}
        <Button type="button" variant="outline" onClick={this.recover}>
          Try again
        </Button>
        {this.props.onReset ? (
          <Button type="button" variant="outline" onClick={this.props.onReset}>
            Close
          </Button>
        ) : null}
      </div>
    );
  }
}
