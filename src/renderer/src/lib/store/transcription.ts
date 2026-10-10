import { create } from 'zustand'

/** Whether the other side is being listened to; recognition itself runs in main */
interface TranscriptionStore {
  isTranscribing: boolean
  setIsTranscribing: (v: boolean) => void
}

export const useTranscriptionStore = create<TranscriptionStore>()((set) => ({
  isTranscribing: false,
  setIsTranscribing: (v) => set({ isTranscribing: v })
}))
