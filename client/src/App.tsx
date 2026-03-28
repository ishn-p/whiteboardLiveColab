import { Navigate, Route, Routes } from "react-router-dom";
import CanvasListPage from "./pages/CanvasListPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import WhiteboardPage from "./pages/WhiteboardPage";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/canvases"
        element={
          <AuthGuard>
            <CanvasListPage />
          </AuthGuard>
        }
      />
      <Route
        path="/canvas/:id"
        element={
          <AuthGuard>
            <WhiteboardPage />
          </AuthGuard>
        }
      />
      <Route path="*" element={<Navigate to="/canvases" replace />} />
    </Routes>
  );
}
