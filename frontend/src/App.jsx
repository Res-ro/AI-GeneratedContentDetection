/**
 * App.jsx – the routes (React Router, Week 9).
 *
 *   /                  Screen 1   Paste & Analyse
 *   /results/passage   Screen 2   Colour-coded passage
 *   /results/summary   Screen 3   Overall score & confidence
 *   /results/feedback  Screen 4b  Rate this result
 *   /history           Screen 4a  Analysis history
 *   /settings                     Default model, history on/off
 *   anything else                 404 page
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import AnalysePage from './pages/AnalysePage.jsx';
import ResultsLayout from './pages/ResultsLayout.jsx';
import PassagePage from './pages/PassagePage.jsx';
import SummaryPage from './pages/SummaryPage.jsx';
import FeedbackPage from './pages/FeedbackPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

function CrashTest() {
  // Development only: lets you show the error-fallback page in the demo video.
  throw new Error('Crash test: this error was thrown on purpose.');
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<AnalysePage />} />
        <Route path="results" element={<ResultsLayout />}>
          <Route index element={<Navigate to="passage" replace />} />
          <Route path="passage" element={<PassagePage />} />
          <Route path="summary" element={<SummaryPage />} />
          <Route path="feedback" element={<FeedbackPage />} />
        </Route>
        <Route path="history" element={<HistoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {import.meta.env.DEV && <Route path="crash-test" element={<CrashTest />} />}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
