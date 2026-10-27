import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode; onReset: () => void };
type State = { failed: boolean };

export default class ListingCreationErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Court creation page recovered from an error", error, info);
  }

  private reset = () => {
    this.props.onReset();
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-slate-50 p-4">
        <section className="w-full max-w-lg rounded-3xl border border-amber-200 bg-white p-7 text-center shadow-sm">
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-amber-600" />
          <h1 className="text-2xl font-bold text-slate-950">Court form needs to restart</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Your saved draft contains data this version cannot open. Restart the form and continue without a blank page.</p>
          <Button onClick={this.reset} className="mt-6 rounded-full bg-emerald-900 px-6 hover:bg-emerald-800">
            <RefreshCw className="me-2 h-4 w-4" />Restart court form
          </Button>
        </section>
      </main>
    );
  }
}
