import NewDeviceNotifyModal from "@/app/components/NewDeviceNotifyModal";
import { globalRefs } from "@/utils/globalRefs";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

interface DbUpdateContextType {
  dbTick: number;
  notifyDbUpdate: () => void;
  newLogin: { show: boolean; logout: boolean };
  setNewLogin: (value: { show: boolean; logout: boolean }) => void;
}

const DbUpdateContext = createContext<DbUpdateContextType>({
  dbTick: 0,
  notifyDbUpdate: () => { },
  newLogin: { show: false, logout: false },
  setNewLogin: () => { },
});

export const useDbUpdate = () => useContext(DbUpdateContext);

export const DbUpdateProvider = ({ children }: any) => {
  const [dbTick, setDbTick] = useState(0);
  const [newLogin, setNewLoginState] = useState({ show: false, logout: false });

  // Writes often come in bursts (e.g. a backlog of offline messages): coalesce them so screens
  // re-read their data once per burst instead of once per write
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyDbUpdate = useCallback(() => {
    if (pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      setDbTick(prev => prev + 1);
    }, 50);
  }, []);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);

  const setNewLogin = useCallback((value: { show: boolean; logout: boolean }) => {
    setNewLoginState(value);
  }, []);

  const value = useMemo(() => ({ dbTick, notifyDbUpdate, newLogin, setNewLogin }), [dbTick, notifyDbUpdate, newLogin, setNewLogin]);

  useEffect(() => {
    globalRefs.notifyDbUpdate = notifyDbUpdate;
    globalRefs.setNewLogin = setNewLogin as any;
  }, [notifyDbUpdate, setNewLogin]);

  return (
    <DbUpdateContext.Provider value={value}>
      <NewDeviceNotifyModal
        visible={newLogin.show}
        onCancel={() => setNewLogin({ show: false, logout: false })}
      />
      {children}
    </DbUpdateContext.Provider>
  );
};
