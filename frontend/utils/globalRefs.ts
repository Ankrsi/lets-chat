import { Socket } from 'socket.io-client';

export const globalRefs = {
  socket: null as Socket | null,
  username: null as string | null,
  isSocketConnected: false as boolean | false,
  notifyDbUpdate: null as (() => void) | null,
  setNewLogin: null as (() => void) | null,
};

export const setGlobalSocket = (socket: Socket | null) => {
  globalRefs.socket = socket;
};

export const setGlobalUsername = (username: string | null) => {
  globalRefs.username = username;
};

export const setGlobalIsSocketConnected = (isConnected: boolean) => {
  globalRefs.isSocketConnected = isConnected;
};

export const setGlobalDbTick = () => {
  globalRefs.notifyDbUpdate?.();
};

export const setGlobalNewLogin = (newLogin: { show: boolean, logout: boolean }) => {
  globalRefs.setNewLogin?.();
};

export const getGlobalSocket = () => globalRefs.socket;
export const getGlobalUsername = () => globalRefs.username;
export const getGlobalIsSocketConnected = () => globalRefs.isSocketConnected;