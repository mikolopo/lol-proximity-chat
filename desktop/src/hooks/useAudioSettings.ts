import { useState, useEffect, useRef } from "react";
import type { VoiceManager } from "../voice/VoiceManager";

/** Audio device enumeration, volume sliders, noise gate, noise suppression, mic test. */
export function useAudioSettings(voiceManagerRef: React.MutableRefObject<VoiceManager | null>, backendUrl: string) {
  const [audioDevices, setAudioDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }>({ inputs: [], outputs: [] });
  const [selectedMic, setSelectedMic] = useState(() => localStorage.getItem('lpc_mic') || "default");
  const [selectedSpeaker, setSelectedSpeaker] = useState(() => localStorage.getItem('lpc_speaker') || "default");

  const [micVolume, setMicVolume] = useState(() => parseFloat(localStorage.getItem('lpc_micVol') || '1.0'));
  const [headphoneVolume, setHeadphoneVolume] = useState(() => parseFloat(localStorage.getItem('lpc_hpVol') || '1.0'));
  const [noiseGate, setNoiseGate] = useState(() => parseFloat(localStorage.getItem('lpc_noiseGate') || '0.15'));
  const [noiseSuppression, setNoiseSuppression] = useState(() => localStorage.getItem('lpc_noiseSuppression') !== 'false');

  const [micLevelDisplay, setMicLevelDisplay] = useState(0);
  const micLevelInterval = useRef<any>(null);
  const [isMicTesting, setIsMicTesting] = useState(false);

  // Persist settings
  useEffect(() => { localStorage.setItem('lpc_mic', selectedMic); }, [selectedMic]);
  useEffect(() => { localStorage.setItem('lpc_speaker', selectedSpeaker); }, [selectedSpeaker]);
  useEffect(() => { localStorage.setItem('lpc_micVol', String(micVolume)); }, [micVolume]);
  useEffect(() => { localStorage.setItem('lpc_hpVol', String(headphoneVolume)); }, [headphoneVolume]);
  useEffect(() => { localStorage.setItem('lpc_noiseGate', String(noiseGate)); }, [noiseGate]);
  useEffect(() => { localStorage.setItem('lpc_noiseSuppression', String(noiseSuppression)); }, [noiseSuppression]);

  /** Enumerate audio devices (call when settings modal opens) */
  const fetchDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices({
        inputs: devices.filter(d => d.kind === 'audioinput'),
        outputs: devices.filter(d => d.kind === 'audiooutput'),
      });
    } catch (err) {
      console.error("Failed to enum devices", err);
    }
  };

  /** Start polling mic level for the meter (call when settings opens) */
  const startMicLevelPolling = () => {
    micLevelInterval.current = setInterval(() => {
      if (voiceManagerRef.current) setMicLevelDisplay(voiceManagerRef.current.getMicLevel());
    }, 50);
  };

  /** Stop polling mic level (call when settings closes) */
  const stopMicLevelPolling = () => {
    if (micLevelInterval.current) {
      clearInterval(micLevelInterval.current);
      micLevelInterval.current = null;
    }
  };

  /** Toggle mic loopback test */
  const toggleMicTest = async (isConnected: boolean) => {
    const { VoiceManager } = await import("../voice/VoiceManager");
    if (!voiceManagerRef.current) {
      const normalizedUrl = backendUrl.startsWith('http') ? backendUrl : `http://${backendUrl}`;
      voiceManagerRef.current = new VoiceManager(normalizedUrl);
    }

    if (isMicTesting) {
      setIsMicTesting(false);
      await voiceManagerRef.current.toggleMicTest(false, "", "");
      if (!isConnected) {
        voiceManagerRef.current.disconnect();
        voiceManagerRef.current = null;
      }
    } else {
      setIsMicTesting(true);
      voiceManagerRef.current.setNoiseSuppression(noiseSuppression);
      voiceManagerRef.current.setNoiseGate(noiseGate);
      voiceManagerRef.current.setMicVolume(micVolume);
      await voiceManagerRef.current.toggleMicTest(true, selectedMic, selectedSpeaker);
    }
  };

  /** Update mic volume and sync to VoiceManager */
  const updateMicVolume = (v: number) => {
    setMicVolume(v);
    voiceManagerRef.current?.setMicVolume(v);
  };

  /** Update headphone volume and sync to VoiceManager */
  const updateHeadphoneVolume = (v: number) => {
    setHeadphoneVolume(v);
    voiceManagerRef.current?.setHeadphoneVolume(v);
  };

  /** Update noise gate and sync to VoiceManager */
  const updateNoiseGate = (v: number) => {
    setNoiseGate(v);
    voiceManagerRef.current?.setNoiseGate(v);
  };

  /** Toggle noise suppression with optional mic test restart */
  const toggleNoiseSuppression = () => {
    const next = !noiseSuppression;
    setNoiseSuppression(next);
    if (voiceManagerRef.current) {
      voiceManagerRef.current.setNoiseSuppression(next);
      if (isMicTesting) {
        voiceManagerRef.current.toggleMicTest(false, "", "").then(() => {
          voiceManagerRef.current?.toggleMicTest(true, selectedMic, selectedSpeaker);
        });
      }
    }
  };

  /** Restart mic test after noise gate slider release */
  const restartMicTestIfActive = () => {
    if (isMicTesting && voiceManagerRef.current) {
      voiceManagerRef.current.toggleMicTest(false, "", "").then(() => {
        voiceManagerRef.current?.toggleMicTest(true, selectedMic, selectedSpeaker);
      });
    }
  };

  return {
    audioDevices, fetchDevices,
    selectedMic, setSelectedMic, selectedSpeaker, setSelectedSpeaker,
    micVolume, updateMicVolume, headphoneVolume, updateHeadphoneVolume,
    noiseGate, updateNoiseGate, noiseSuppression, toggleNoiseSuppression,
    micLevelDisplay, startMicLevelPolling, stopMicLevelPolling,
    isMicTesting, toggleMicTest, restartMicTestIfActive,
  };
}
