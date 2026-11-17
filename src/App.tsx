import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './components/AppShell';
import { NotFoundPanel, Spinner } from './components/ui';
import { useAuth } from './state/auth';
import { useActiveCar } from './state/car';
import LoginView from './views/LoginView';
import HomeView from './views/HomeView';
import FolderView from './views/FolderView';
import PageView from './views/PageView';
import PageEditorView from './views/PageEditorView';
import SearchView from './views/SearchView';
import AdminView from './views/AdminView';
import InviteView from './views/InviteView';

function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Signing you in…" />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

function DefaultCarRedirect() {
  const car = useActiveCar();
  return <Navigate to={`/c/${car.id}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginView />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DefaultCarRedirect />} />
          <Route path="/admin" element={<AdminView />} />
          <Route path="/invite" element={<InviteView />} />
          <Route path="/c/:carId" element={<HomeView />} />
          <Route path="/c/:carId/s/:subteamId" element={<FolderView />} />
          <Route path="/c/:carId/f/:folderId" element={<FolderView />} />
          <Route path="/c/:carId/p/:pageId" element={<PageView />} />
          <Route path="/c/:carId/p/:pageId/edit" element={<PageEditorView />} />
          <Route path="/c/:carId/new" element={<PageEditorView />} />
          <Route path="/c/:carId/search" element={<SearchView />} />
          <Route path="*" element={<NotFoundPanel />} />
        </Route>
      </Route>
    </Routes>
  );
}
