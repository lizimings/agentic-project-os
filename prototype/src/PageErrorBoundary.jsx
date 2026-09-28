import { Component } from "react";
import { ArrowClockwise, House, Warning } from "@phosphor-icons/react";

export class PageErrorBoundary extends Component {
  state = { error: null, retry: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <section className="page-error-boundary" role="alert"><span><Warning size={30} weight="duotone" /></span><h1>这个页面刚刚遇到问题</h1><p>应用外壳、Inbox 和其他项目仍在运行。你可以重新渲染当前页面，或安全回到今天。</p><code>{this.state.error.message}</code><div><button type="button" onClick={() => { this.props.onRecover?.(); this.setState(({ retry }) => ({ error: null, retry: retry + 1 })); }}><ArrowClockwise size={16} />重新加载页面</button><button className="primary-small" type="button" onClick={this.props.onGoHome}><House size={16} />回到今天</button></div></section>;
  }
}

export function DiagnosticFault({ active, children }) {
  if (active) throw new Error("Agentic Project OS 页面级错误边界诊断");
  return children;
}
