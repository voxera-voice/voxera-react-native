import React, { useEffect, useState } from "react";
import { Platform } from "react-native";

// Global flag so registerGlobals() only runs once per app lifecycle
let webrtcGlobalsRegistered = false;

/**
 * VoiceChatProvider
 *
 * Wrap your app root with this component (same pattern as omnium-webrtc-client).
 * It calls `registerGlobals()` from react-native-webrtc so that
 * RTCPeerConnection, RTCIceCandidate, etc. are available globally before any
 * WebRTC code runs.
 *
 * Children are not rendered until WebRTC is initialised (native only).
 *
 * @example
 * ```tsx
 * // index.js  ← react-native-webrtc must be imported here first
 * import 'react-native-webrtc';
 * import { AppRegistry } from 'react-native';
 * import App from './App';
 * AppRegistry.registerComponent('MyApp', () => App);
 *
 * // App.tsx
 * import { VoiceChatProvider } from '@maya-voice/sdk-react-native';
 *
 * export default function App() {
 *   return (
 *     <VoiceChatProvider>
 *       <YourRootNavigator />
 *     </VoiceChatProvider>
 *   );
 * }
 * ```
 */
export const VoiceChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(Platform.OS === "web");

  useEffect(() => {
    if (Platform.OS === "web" || webrtcGlobalsRegistered) {
      setIsReady(true);
      return;
    }

    try {
      const webrtc = require("react-native-webrtc");

      if (typeof webrtc.registerGlobals === "function") {
        webrtc.registerGlobals();
        webrtcGlobalsRegistered = true;
      }
    } catch (err) {
      // react-native-webrtc not available – continue anyway
      console.warn("[Maya RN] VoiceChatProvider: react-native-webrtc not found:", err);
    }

    setIsReady(true);
  }, []);

  if (!isReady) return null;

  return <>{children}</>;
};

export default VoiceChatProvider;
