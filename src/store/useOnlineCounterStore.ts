import { create } from 'zustand';

interface OnlineCounterState {
  count: number;
  isInitialized: boolean;
  setCount: (count: number) => void;
  setInitialized: (value: boolean) => void;
}

export const useOnlineCounterStore = create<OnlineCounterState>((set) => ({
  count: 0,
  isInitialized: false,
  
  setCount: (count) => set({ count }),
  setInitialized: (value) => set({ isInitialized: value }),
}));
