import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
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
  const explicitPreview = useRef(false);

  useEffect(() => {
    // Only Firebase SDK may restore a real teacher login, not a cached name/UID.
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        explicitPreview.current = false;
        setUser(currentUser);
        try {
          localStorage.setItem('toan_thcs_teacher_auth_session', JSON.stringify({
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL
          }));
        } catch {}
      } else if (!explicitPreview.current) {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginAsTeacher = (displayName?: string, email?: string): AuthUser => {
    explicitPreview.current = true;
    const teacherUser: TeacherAuthUser = {
      uid: 'teacher_preview_user',
      email: email || 'giaovien.toan@thcs.edu.vn',
      displayName: displayName || 'Thầy/Cô Giáo viên',
      photoURL: null
    };
    setUser(teacherUser);
    // Explicit demo is never persisted as a real authenticated teacher.
    setLoading(false);
    return teacherUser;
  };

  const signInWithGoogle = async (): Promise<AuthUser> => {
    explicitPreview.current = false;
    setUser(null);
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
        setLoading(false);
        throw new Error('Tên miền Preview chưa được Firebase cho phép đăng nhập Google. Hãy thêm vào Authentication > Settings > Authorized domains. Không chuyển sang tài khoản giáo viên giả.');
      }
      setLoading(false);
      console.warn('Thông báo đăng nhập Google:', error?.message || error);
      throw error;
    }
  };

  const logout = async (): Promise<void> => {
    explicitPreview.current = false;
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

