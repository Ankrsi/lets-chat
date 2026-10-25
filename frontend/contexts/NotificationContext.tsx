import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface NotificationContextType {
  notificationData: any;
  setNotificationData: (data: any) => void;
  clear: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notificationData, setNotificationData] = useState<any>(null);

  const clear = useCallback(() => setNotificationData(null), []);
  const value = useMemo(() => ({ notificationData, setNotificationData, clear }), [notificationData, clear]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
};