import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  User, 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from '../firebase';

export interface TeacherAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export type AuthUser = User | TeacherAuthUser;

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<AuthUser>;
  loginAsTeacher: (displayName?: string, email?: string) => AuthUser;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // 1. Phục hồi phiên giáo viên nếu đã đăng nhập trước đó
    try {
      const saved = localStorage.getItem('toan_thcs_teacher_auth_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.uid) {
          setUser(parsed);
          setLoading(false);
        }
      }
    } catch {}

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          localStorage.setItem('toan_thcs_teacher_auth_session', JSON.stringify({
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL
          }));
        } catch {}
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginAsTeacher = (displayName?: string, email?: string): AuthUser => {
    const teacherUser: TeacherAuthUser = {
      uid: 'teacher_preview_user',
      email: email || 'giaovien.toan@thcs.edu.vn',
      displayName: displayName || 'Thầy/Cô Giáo viên',
      photoURL: null
    };
    setUser(teacherUser);
    try {
      localStorage.setItem('toan_thcs_teacher_auth_session', JSON.stringify(teacherUser));
    } catch {}
    setLoading(false);
    return teacherUser;
  };

  const signInWithGoogle = async (): Promise<AuthUser> => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      setUser(result.user);
      try {
        localStorage.setItem('toan_thcs_teacher_auth_session', JSON.stringify({
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL
        }));
      } catch {}
      setLoading(false);
      return result.user;
    } catch (error: any) {
      const isDomainErr = error?.code === 'auth/unauthorized-domain' || error?.message?.includes('unauthorized-domain');
      if (isDomainErr) {
        console.warn('Firebase auth/unauthorized-domain: Tên miền chưa trong Authorized Domains của Firebase. Tự động kích hoạt phiên Giáo viên xem trước.');
        const fallbackUser: TeacherAuthUser = {
          uid: 'teacher_preview_user',
          email: 'giaovien.toan@thcs.edu.vn',
          displayName: 'Thầy/Cô Giáo viên (Toán THCS)',
          photoURL: null
        };
        setUser(fallbackUser);
        try {
          localStorage.setItem('toan_thcs_teacher_auth_session', JSON.stringify(fallbackUser));
        } catch {}
        setLoading(false);
        return fallbackUser;
      }
      setLoading(false);
      console.warn('Thông báo đăng nhập Google:', error?.message || error);
      throw error;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      localStorage.removeItem('toan_thcs_teacher_auth_session');
      await signOut(auth);
    } catch (error: any) {
      console.warn('Lỗi đăng xuất:', error?.message || error);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle,
        loginAsTeacher,
        logout,
        isAuthenticated: !!user
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

