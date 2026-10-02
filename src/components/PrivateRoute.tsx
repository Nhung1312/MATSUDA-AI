import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

interface PrivateRouteProps {
  children: React.ReactElement;
}

export const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400 animate-spin">
          <Loader2 className="w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          Đang kiểm tra quyền truy cập Giáo viên...
        </p>
      </div>
    );
  }

  if (!user) {
    // Redirect to /login and preserve destination
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
};
