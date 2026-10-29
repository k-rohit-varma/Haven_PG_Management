import { useEffect, useState, useSyncExternalStore } from 'react';
import { getRequestActivitySnapshot, subscribeToRequestActivity } from '../../lib/requestActivity.js';
import './GlobalLoadingIndicator.css';

export default function GlobalLoadingIndicator() {
  const active = useSyncExternalStore(subscribeToRequestActivity, getRequestActivitySnapshot, () => false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setVisible(true), 120);
    return () => window.clearTimeout(timer);
  }, [active]);

  return <div className={`global-loading ${visible ? 'global-loading-visible' : ''}`} role="status" aria-live="polite" aria-hidden={!visible}>
    <span className="global-loading-track" />
    <span className="global-loading-dialog"><span className="global-loading-spinner" /><span>Processing your request…</span></span>
  </div>;
}
