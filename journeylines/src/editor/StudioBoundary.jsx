import { lazy, Suspense } from 'react';

// Studio is intentionally a separate async chunk. Opening or playing the
// timeline must not load editor forms, the city search tool or full canonical
// route metadata merely to animate a completed journey.
const AdminPanel = lazy(() => import('../components/AdminPanel.jsx'));

export default function StudioBoundary({ open, ...props }) {
  if (!open) return null;
  return <Suspense fallback={
    <div className="studio-loading-overlay" role="status" aria-live="polite">
      <div className="studio-loading-card glass">
        <strong>Opening GlobeHoppers Studio…</strong>
        <span>Loading editor tools</span>
      </div>
    </div>
  }>
    <AdminPanel {...props} />
  </Suspense>;
}
