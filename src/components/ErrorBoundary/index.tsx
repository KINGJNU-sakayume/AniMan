// src/components/ErrorBoundary/index.tsx
// M-02: React Error Boundary — 예기치 못한 런타임 오류로 인한 흰 화면(WSOD) 방지

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-6 p-8">
          <div className="text-center space-y-3">
            <h2 className="text-xl font-bold text-red-400">렌더링 오류가 발생했습니다</h2>
            <p className="text-gray-400 text-sm max-w-md">
              {this.state.error?.message || '알 수 없는 오류가 발생했습니다.'}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="px-5 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-gray-200 hover:bg-zinc-700 transition-colors"
          >
            다시 시도
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
