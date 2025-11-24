import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // capture et log pour debugging
    console.error('Uncaught error in App:', error, info);
    this.setState({ error, info });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 20,
          margin: 24,
          borderRadius: 8,
          background: '#1b1f26',
          color: '#ffdddd',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <h2 style={{ marginTop: 0 }}>Une erreur est survenue</h2>
          <div style={{whiteSpace:'pre-wrap', fontFamily: 'monospace', fontSize: 13}}>
            {String(this.state.error && this.state.error.toString())}
          </div>
          {this.state.info?.componentStack && (
            <details style={{ marginTop: 12, color: '#ffdede' }}>
              <summary>Stack trace</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.info.componentStack}</pre>
            </details>
          )}
          <div style={{ marginTop: 12, color: '#d1d5db' }}>
            Vérifie la console du navigateur et le terminal (vite) pour plus d'informations.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
