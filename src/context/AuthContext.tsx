import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Agency, UserRole, Client, Brand, CampaignCalculatedMetrics, CampaignLineItem } from '../types';
import { ApiService } from '../lib/api';
import { LoginPage } from '../components/auth/LoginPage';
import { RefreshCw } from 'lucide-react';
import { FirestoreService } from '../lib/firestoreService';

interface DrillDownState {
  clientId?: string;
  brandId?: string;
  campaignId?: string;
  platform?: string;
  lineItemId?: string;
}

interface AuthContextType {
  currentUser: User;
  setCurrentUser: (user: User) => void;
  availableUsers: User[];
  currentAgency: Agency | null;
  setCurrentAgency: (agency: Agency) => void;
  agencies: Agency[];
  refreshAgencies: () => Promise<void>;
  currentPortal: 'agency' | 'super_user' | 'client_viewer';
  setCurrentPortal: (portal: 'agency' | 'super_user' | 'client_viewer') => void;
  drillDown: DrillDownState;
  setDrillDown: React.Dispatch<React.SetStateAction<DrillDownState>>;
  selectCampaign: (campaignId: string, clientId?: string, brandId?: string) => void;
  selectPlatform: (platform: string) => void;
  selectLineItem: (lineItemId: string) => void;
  clearDrillDown: () => void;
  activeAlertCount: number;
  setActiveAlertCount: (cnt: number) => void;
  unmappedCount: number;
  refreshUnmappedCount: () => Promise<void>;
  switchRole: (role: UserRole) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Null until the session is resolved; the provider renders the sign-in screen
  // rather than handing a null user to the rest of the app.
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [currentAgency, setCurrentAgency] = useState<Agency | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [currentPortal, setCurrentPortal] = useState<'agency' | 'super_user' | 'client_viewer'>('agency');
  const [drillDown, setDrillDown] = useState<DrillDownState>({});
  const [activeAlertCount, setActiveAlertCount] = useState<number>(2);
  const [unmappedCount, setUnmappedCount] = useState<number>(3);

  const refreshUnmappedCount = useCallback(async () => {
    if (!currentAgency) return;
    try {
      const list = await ApiService.getUnmappedCampaigns(currentAgency.id, 'unmapped');
      setUnmappedCount(list.length);
    } catch (err) {
      console.error('Failed to load unmapped count', err);
    }
  }, [currentAgency]);

  const refreshAgencies = useCallback(async () => {
    try {
      const list = await ApiService.getAgencies();
      setAgencies(list);
      if (!currentAgency && list.length > 0) {
        const omni = list.find(a => a.id === 'agency_omni') || list[0];
        setCurrentAgency(omni);
      }
    } catch (err) {
      console.error('Failed to load agencies', err);
    }
  }, [currentAgency]);

  const refreshUsers = useCallback(async () => {
    try {
      const users = await ApiService.getUsers();
      setAvailableUsers(users);
    } catch (err) {
      console.error('Failed to load users', err);
    }
  }, []);

  useEffect(() => {
    // Only fetch once signed in, otherwise the sign-in screen fires requests
    // that can only come back 401.
    if (!currentUser) return;
    refreshAgencies();
    refreshUsers();
    refreshUnmappedCount();
  }, [currentUser, refreshAgencies, refreshUsers, refreshUnmappedCount]);

  useEffect(() => {
    const handleRefresh = () => {
      refreshUnmappedCount();
    };
    window.addEventListener('refresh-omnitrack', handleRefresh);
    window.addEventListener('campaigns-updated', handleRefresh);
    return () => {
      window.removeEventListener('refresh-omnitrack', handleRefresh);
      window.removeEventListener('campaigns-updated', handleRefresh);
    };
  }, [refreshUnmappedCount]);

  useEffect(() => {
    if (currentAgency) {
      refreshUnmappedCount();
    }
  }, [currentAgency?.id, refreshUnmappedCount]);

  const loadSession = useCallback(async () => {
    try {
      const { user } = await ApiService.getCurrentUser();
      setCurrentUser(user);
      setCurrentPortal(user.role === 'super_user' ? 'super_user' : user.role === 'client_viewer' ? 'client_viewer' : 'agency');
    } catch {
      setCurrentUser(null);
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
    // Any request rejected as unauthenticated drops us back to the sign-in screen.
    const onUnauthenticated = () => setCurrentUser(null);
    window.addEventListener('omnitrack-unauthenticated', onUnauthenticated);
    return () => window.removeEventListener('omnitrack-unauthenticated', onUnauthenticated);
  }, [loadSession]);

  const signOut = useCallback(async () => {
    try {
      await ApiService.logout();
    } finally {
      setCurrentUser(null);
    }
  }, []);

  const switchRole = (role: UserRole) => {
    // Only an actual super user may view the product as another role. For
    // everyone else this is a no-op: the server derives access from the session
    // regardless, so switching would only misrepresent what they can see.
    if (currentUser?.role !== 'super_user') return;

    if (role === 'super_user') {
      const superU = availableUsers.find(u => u.role === 'super_user') || {
        id: 'user_super',
        email: 'admin@omnitrack.io',
        name: 'Alex Vance (Super Admin)',
        role: 'super_user',
        created_at: new Date().toISOString()
      };
      setCurrentUser(superU);
      setCurrentPortal('super_user');
    } else if (role === 'agency_admin') {
      const adminU = availableUsers.find(u => u.role === 'agency_admin') || {
        id: 'user_sarah',
        email: 'sarah@omnidigital.com',
        name: 'Sarah Jenkins',
        role: 'agency_admin',
        agency_id: currentAgency?.id || 'agency_omni',
        created_at: new Date().toISOString()
      };
      setCurrentUser(adminU);
      setCurrentPortal('agency');
    } else if (role === 'agency_member') {
      const memberU = availableUsers.find(u => u.role === 'agency_member') || {
        id: 'user_david',
        email: 'david@omnidigital.com',
        name: 'David Chen',
        role: 'agency_member',
        agency_id: currentAgency?.id || 'agency_omni',
        created_at: new Date().toISOString()
      };
      setCurrentUser(memberU);
      setCurrentPortal('agency');
    } else if (role === 'client_viewer') {
      const clientU = availableUsers.find(u => u.role === 'client_viewer') || {
        id: 'user_client_abc',
        email: 'nimal@abcholdings.lk',
        name: 'Nimal Perera (Client)',
        role: 'client_viewer',
        agency_id: currentAgency?.id || 'agency_omni',
        client_id: 'client_abc',
        created_at: new Date().toISOString()
      };
      setCurrentUser(clientU);
      setCurrentPortal('client_viewer');
    }
  };

  const selectCampaign = (campaignId: string, clientId?: string, brandId?: string) => {
    setDrillDown(prev => ({
      ...prev,
      clientId: clientId || prev.clientId,
      brandId: brandId || prev.brandId,
      campaignId,
      platform: undefined,
      lineItemId: undefined
    }));
  };

  const selectPlatform = (platform: string) => {
    setDrillDown(prev => ({
      ...prev,
      platform,
      lineItemId: undefined
    }));
  };

  const selectLineItem = (lineItemId?: string) => {
    setDrillDown(prev => ({
      ...prev,
      lineItemId: (!lineItemId || prev.lineItemId === lineItemId) ? undefined : lineItemId
    }));
  };

  const clearDrillDown = () => {
    setDrillDown({});
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  // Gate the whole app behind a session, so every consumer below can rely on
  // currentUser being present.
  if (!currentUser) {
    return <LoginPage onSignedIn={() => { setIsAuthLoading(true); loadSession(); }} />;
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        availableUsers,
        currentAgency,
        setCurrentAgency,
        agencies,
        refreshAgencies,
        currentPortal,
        setCurrentPortal,
        drillDown,
        setDrillDown,
        selectCampaign,
        selectPlatform,
        selectLineItem,
        clearDrillDown,
        activeAlertCount,
        setActiveAlertCount,
        unmappedCount,
        refreshUnmappedCount,
        switchRole,
        signOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
