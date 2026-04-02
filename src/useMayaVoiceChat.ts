import { useState, useEffect, useRef, useCallback } from "react";
import { MayaVoiceNativeClient } from "./client";
import type { UseMayaVoiceChatConfig, UseMayaVoiceChatReturn, RNMediaStream } from "./types";
import type {
  ConversationMessage,
  MayaVoiceError,
  RoomMode,
  RoomParticipant,
  TranscriptionEntry,
  WaitingRoomEntry,
  MeetingBookmark,
  MeetingSummary,
  MeetingMinutes,
} from "@voxera/sdk-core";

/**
 * useMayaVoiceChat
 *
 * React Native hook equivalent of useOmniumVoiceChat from @maya-voice/sdk-react.
 * Returns the same shape so the web demo UI can be ported 1:1.
 *
 * @example
 * ```tsx
 * import { useMayaVoiceChat } from '@maya-voice/sdk-react-native';
 * import { RTCView } from 'react-native-webrtc';
 *
 * const { connect, localVideoStream, remoteStream } = useMayaVoiceChat({
 *   appKey: 'xxx',
 *   serverUrl: 'wss://media.example.com',
 * });
 *
 * // render remote audio/video
 * remoteStream && <RTCView streamURL={(remoteStream as any).toURL()} style={{ flex: 1 }} />
 * ```
 */
export function useMayaVoiceChat(config: UseMayaVoiceChatConfig): UseMayaVoiceChatReturn {
  const clientRef = useRef<MayaVoiceNativeClient | null>(null);

  const [connectionStatus, setConnectionStatus] = useState<UseMayaVoiceChatReturn["connectionStatus"]>("idle");
  const [conversationStatus, setConversationStatus] = useState<UseMayaVoiceChatReturn["conversationStatus"]>("idle");
  const [speakingStatus, setSpeakingStatus] = useState<UseMayaVoiceChatReturn["speakingStatus"]>("none");
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [error, setError] = useState<MayaVoiceError | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [aiAudioLevel, setAiAudioLevel] = useState(0);
  const [localVideoStream, setLocalVideoStream] = useState<RNMediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<RNMediaStream | null>(null);
  const [remoteVideoStream, setRemoteVideoStream] = useState<RNMediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<RNMediaStream | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMuted, setIsMutedState] = useState(false);
  const [isListenMode, setIsListenModeState] = useState(false);

  // Meeting state
  const [roomMode, setRoomMode] = useState<RoomMode | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [roomParticipants, setRoomParticipants] = useState<RoomParticipant[]>([]);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [waitingRoom, setWaitingRoom] = useState<WaitingRoomEntry[]>([]);
  const [isTranscriptionEnabled, setIsTranscriptionEnabled] = useState(false);
  const [isAskAiActive, setIsAskAiActive] = useState(false);
  const [isRoomLocked, setIsRoomLocked] = useState(false);
  const [isWaitingRoomEnabled, setIsWaitingRoomEnabled] = useState(false);
  const [isInWaitingRoom, setIsInWaitingRoom] = useState(false);
  const [bookmarks, setBookmarks] = useState<MeetingBookmark[]>([]);
  const [summaries, setSummaries] = useState<MeetingSummary[]>([]);
  const [currentMinutes, setCurrentMinutes] = useState<MeetingMinutes | null>(null);
  const [askAiTextResponse, setAskAiTextResponse] = useState("");
  const [isAskAiTextProcessing, setIsAskAiTextProcessing] = useState(false);

  const configRef = useRef(config);
  configRef.current = config;

  const getClient = useCallback((): MayaVoiceNativeClient => {
    if (!clientRef.current) {
      clientRef.current = new MayaVoiceNativeClient({
        ...configRef.current,
        onConnectionStatusChange: setConnectionStatus,
        onConversationStatusChange: setConversationStatus,
        onSpeakingStatusChange: setSpeakingStatus,
        onMessage: (msg) => setConversationMessages((prev) => [...prev, msg]),
        onTranscript: (text, isFinal) => {
          setCurrentTranscript(isFinal ? "" : text);
        },
        onError: (err) => setError(err),
        onAudioLevel: setAudioLevel,
        onAIAudioLevel: setAiAudioLevel,
        onLocalVideoStream: (s) => setLocalVideoStream(s),
        onRemoteStream: (s) => setRemoteStream(s),
        onRemoteVideoStream: (s) => setRemoteVideoStream(s),
        onLocalScreenStream: (s) => { setLocalScreenStream(s); setIsScreenSharing(s !== null); },
        meetingCallbacks: configRef.current.meetingCallbacks,
      });

      // Set up meeting event callbacks
      clientRef.current.setMeetingCallbacks({
        ...configRef.current.meetingCallbacks,
        onParticipantJoined: (data) => {
          setRoomParticipants(data.participants);
          configRef.current.meetingCallbacks?.onParticipantJoined?.(data);
        },
        onParticipantLeft: (data) => {
          setRoomParticipants(data.participants);
          configRef.current.meetingCallbacks?.onParticipantLeft?.(data);
        },
        onParticipantRemoved: (data) => {
          setRoomParticipants(data.participants);
          configRef.current.meetingCallbacks?.onParticipantRemoved?.(data);
        },
        onParticipantsUpdated: (data) => {
          setRoomParticipants(data.participants);
          configRef.current.meetingCallbacks?.onParticipantsUpdated?.(data);
        },
        onHostChanged: (data) => {
          setIsHost(clientRef.current?.isHost ?? false);
          configRef.current.meetingCallbacks?.onHostChanged?.(data);
        },
        onMeetingEnded: (data) => {
          configRef.current.meetingCallbacks?.onMeetingEnded?.(data);
        },
        onRoomLockedChanged: (data) => {
          setIsRoomLocked(data.locked);
          configRef.current.meetingCallbacks?.onRoomLockedChanged?.(data);
        },
        onTranscriptionToggled: (data) => {
          setIsTranscriptionEnabled(data.enabled);
          configRef.current.meetingCallbacks?.onTranscriptionToggled?.(data);
        },
        onLiveTranscription: (entry) => {
          setTranscriptions((prev) => [...prev, entry]);
          configRef.current.meetingCallbacks?.onLiveTranscription?.(entry);
        },
        onAskAiStarted: (data) => {
          setIsAskAiActive(true);
          configRef.current.meetingCallbacks?.onAskAiStarted?.(data);
        },
        onAskAiCancelled: (data) => {
          setIsAskAiActive(false);
          configRef.current.meetingCallbacks?.onAskAiCancelled?.(data);
        },
        onAskAiTextStarted: (data) => {
          setIsAskAiTextProcessing(true);
          setAskAiTextResponse("");
          configRef.current.meetingCallbacks?.onAskAiTextStarted?.(data);
        },
        onAskAiTextChunk: (data) => {
          setAskAiTextResponse((prev) => prev + data.token);
          configRef.current.meetingCallbacks?.onAskAiTextChunk?.(data);
        },
        onAskAiTextResponse: (data) => {
          setAskAiTextResponse(data.text);
          setIsAskAiTextProcessing(false);
          configRef.current.meetingCallbacks?.onAskAiTextResponse?.(data);
        },
        onAskAiTextError: (data) => {
          setIsAskAiTextProcessing(false);
          configRef.current.meetingCallbacks?.onAskAiTextError?.(data);
        },
        onWaitingRoom: (data) => {
          setIsInWaitingRoom(true);
          configRef.current.meetingCallbacks?.onWaitingRoom?.(data);
        },
        onAdmitted: (data) => {
          setIsInWaitingRoom(false);
          if (data.roomMode) setRoomMode(data.roomMode);
          configRef.current.meetingCallbacks?.onAdmitted?.(data);
        },
        onDenied: (data) => {
          setIsInWaitingRoom(false);
          configRef.current.meetingCallbacks?.onDenied?.(data);
        },
        onWaitingRoomUpdated: (data) => {
          setWaitingRoom(data.waitingRoom);
          configRef.current.meetingCallbacks?.onWaitingRoomUpdated?.(data);
        },
        onWaitingRoomToggled: (data) => {
          setIsWaitingRoomEnabled(data.enabled);
          configRef.current.meetingCallbacks?.onWaitingRoomToggled?.(data);
        },
        onSummaryGenerated: (summary) => {
          setSummaries((prev) => [...prev, summary]);
          configRef.current.meetingCallbacks?.onSummaryGenerated?.(summary);
        },
        onMinutesGenerated: (minutes) => {
          setCurrentMinutes(minutes);
          configRef.current.meetingCallbacks?.onMinutesGenerated?.(minutes);
        },
        onBookmarkAdded: (bookmark) => {
          setBookmarks((prev) => [...prev, bookmark]);
          configRef.current.meetingCallbacks?.onBookmarkAdded?.(bookmark);
        },
        onBookmarkRemoved: (data) => {
          setBookmarks((prev) => prev.filter((b) => b.id !== data.bookmarkId));
          configRef.current.meetingCallbacks?.onBookmarkRemoved?.(data);
        },
      });
    }
    return clientRef.current;
  }, []);

  // Auto-connect (and optionally auto-start) if requested
  useEffect(() => {
    if (config.autoConnect) {
      const init = async () => {
        try {
          await getClient().connect();
          if (config.autoStart) await getClient().startConversation();
        } catch (e: any) { setError(e); }
      };
      init();
    }
    return () => {
      clientRef.current?.disconnect().catch(() => {});
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Actions ────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    setError(null);
    try { await getClient().connect(); }
    catch (err) { setError(err as MayaVoiceError); throw err; }
  }, [getClient]);

  const disconnect = useCallback(async () => {
    try {
      await getClient().disconnect();
      setConversationMessages([]);
      setCurrentTranscript("");
      setRoomMode(null);
      setIsHost(false);
      setRoomParticipants([]);
      setTranscriptions([]);
      setWaitingRoom([]);
      setIsTranscriptionEnabled(false);
      setIsAskAiActive(false);
      setIsRoomLocked(false);
      setIsWaitingRoomEnabled(false);
      setIsInWaitingRoom(false);
      setBookmarks([]);
      setSummaries([]);
      setCurrentMinutes(null);
      setAskAiTextResponse("");
      setIsAskAiTextProcessing(false);
    }
    catch (err) { setError(err as MayaVoiceError); }
  }, [getClient]);

  const startConversation = useCallback(async () => {
    try { await getClient().startConversation(); }
    catch (err) { setError(err as MayaVoiceError); throw err; }
  }, [getClient]);

  const endConversation = useCallback(async () => {
    try { await getClient().endConversation(); }
    catch (err) { setError(err as MayaVoiceError); }
  }, [getClient]);

  const sendMessage = useCallback((content: string) => {
    try { getClient().sendMessage(content); }
    catch (err) { setError(err as MayaVoiceError); }
  }, [getClient]);

  const setMuted = useCallback((muted: boolean) => {
    getClient().setMuted(muted);
    setIsMutedState(muted);
  }, [getClient]);

  const setListenMode = useCallback((mode: boolean) => {
    getClient().setListenMode(mode);
    setIsListenModeState(mode);
    // keep isMuted in sync
    setIsMutedState(mode);
  }, [getClient]);

  const toggleListenMode = useCallback((): boolean => {
    const next = getClient().toggleListenMode();
    setIsListenModeState(next);
    setIsMutedState(next);
    return next;
  }, [getClient]);

  const enableVideo = useCallback(async () => {
    try { await getClient().enableVideo(); }
    catch (err) { setError(err as MayaVoiceError); throw err; }
  }, [getClient]);

  const disableVideo = useCallback(async () => {
    try { await getClient().disableVideo(); }
    catch (err) { setError(err as MayaVoiceError); }
  }, [getClient]);

  const toggleVideo = useCallback(async (): Promise<boolean> => {
    try { return await getClient().toggleVideo(); }
    catch (err) { setError(err as MayaVoiceError); return false; }
  }, [getClient]);

  const startScreenShare = useCallback(async () => {
    try { await getClient().startScreenShare(); }
    catch (err) { setError(err as MayaVoiceError); throw err; }
  }, [getClient]);

  const stopScreenShare = useCallback(async () => {
    try { await getClient().stopScreenShare(); }
    catch (err) { setError(err as MayaVoiceError); }
  }, [getClient]);

  const toggleScreenShare = useCallback(async (): Promise<boolean> => {
    try { return await getClient().toggleScreenShare(); }
    catch (err) { setError(err as MayaVoiceError); return false; }
  }, [getClient]);

  const getStats = useCallback(async () => {
    try { return await getClient().getStats(); }
    catch { return null; }
  }, [getClient]);

  const clearError = useCallback(() => setError(null), []);

  const updateConfig = useCallback((partial: Partial<UseMayaVoiceChatConfig>) => {
    configRef.current = { ...configRef.current, ...partial };
    clientRef.current?.updateConfig(partial);
  }, []);

  // ─── Multi-room / meeting actions ──────────────────────────────

  const connectSocket = useCallback(async () => {
    setError(null);
    try { await getClient().connectSocketOnly(); }
    catch (err) { setError(err as MayaVoiceError); throw err; }
  }, [getClient]);

  const setupRoomWebRTC = useCallback(async () => {
    try { await getClient().setupRoomWebRTC(); }
    catch (err) { setError(err as MayaVoiceError); throw err; }
  }, [getClient]);

  // ─── Host control actions ──────────────────────────────────────

  const muteParticipant = useCallback(async (sessionId: string, targetClientId: string) => {
    return getClient().muteParticipant(sessionId, targetClientId);
  }, [getClient]);

  const muteAll = useCallback(async (sessionId: string) => {
    return getClient().muteAll(sessionId);
  }, [getClient]);

  const unmuteAll = useCallback(async (sessionId: string) => {
    return getClient().unmuteAll(sessionId);
  }, [getClient]);

  const removeParticipant = useCallback(async (sessionId: string, targetClientId: string) => {
    return getClient().removeParticipant(sessionId, targetClientId);
  }, [getClient]);

  const lockRoom = useCallback(async (sessionId: string, locked: boolean) => {
    return getClient().lockRoom(sessionId, locked);
  }, [getClient]);

  const endMeeting = useCallback(async (sessionId: string) => {
    return getClient().endMeeting(sessionId);
  }, [getClient]);

  const transferHost = useCallback(async (sessionId: string, targetClientId: string) => {
    return getClient().transferHost(sessionId, targetClientId);
  }, [getClient]);

  const toggleTranscription = useCallback(async (sessionId: string, enabled: boolean) => {
    return getClient().toggleTranscription(sessionId, enabled);
  }, [getClient]);

  const askAi = useCallback(async (sessionId: string) => {
    return getClient().askAi(sessionId);
  }, [getClient]);

  const cancelAskAi = useCallback(async (sessionId: string) => {
    return getClient().cancelAskAi(sessionId);
  }, [getClient]);

  const askAiText = useCallback(async (sessionId: string, prompt?: string) => {
    return getClient().askAiText(sessionId, prompt);
  }, [getClient]);

  const enableWaitingRoom = useCallback(async (sessionId: string, enabled: boolean) => {
    return getClient().enableWaitingRoom(sessionId, enabled);
  }, [getClient]);

  const admitParticipant = useCallback(async (sessionId: string, targetClientId: string) => {
    return getClient().admitParticipant(sessionId, targetClientId);
  }, [getClient]);

  const denyParticipant = useCallback(async (sessionId: string, targetClientId: string) => {
    return getClient().denyParticipant(sessionId, targetClientId);
  }, [getClient]);

  const admitAll = useCallback(async (sessionId: string) => {
    return getClient().admitAll(sessionId);
  }, [getClient]);

  // ─── AI differentiator actions ─────────────────────────────────

  const generateSummary = useCallback(async (sessionId: string) => {
    return getClient().generateSummary(sessionId);
  }, [getClient]);

  const generateMinutes = useCallback(async (sessionId: string) => {
    return getClient().generateMinutes(sessionId);
  }, [getClient]);

  const addBookmark = useCallback(async (sessionId: string, label: string, isActionItem?: boolean) => {
    return getClient().addBookmark(sessionId, label, isActionItem);
  }, [getClient]);

  const removeBookmarkAction = useCallback(async (sessionId: string, bookmarkId: string) => {
    return getClient().removeBookmark(sessionId, bookmarkId);
  }, [getClient]);

  const getBookmarksAction = useCallback(async (sessionId: string) => {
    return getClient().getBookmarks(sessionId);
  }, [getClient]);

  const getTranscriptAction = useCallback(async (sessionId: string) => {
    return getClient().getTranscript(sessionId);
  }, [getClient]);

  const getSummariesAction = useCallback(async (sessionId: string) => {
    return getClient().getSummaries(sessionId);
  }, [getClient]);

  const getMinutesAction = useCallback(async (sessionId: string) => {
    return getClient().getMinutes(sessionId);
  }, [getClient]);

  return {
    // Status
    connectionStatus,
    conversationStatus,
    speakingStatus,

    // Data
    conversationMessages,
    currentTranscript,
    audioLevel,
    aiAudioLevel,
    error,

    // Streams
    localVideoStream,
    remoteStream,
    remoteVideoStream,
    localScreenStream,

    // Meeting state
    roomMode,
    isHost,
    roomParticipants,
    transcriptions,
    waitingRoom,
    isTranscriptionEnabled,
    isAskAiActive,
    isRoomLocked,
    isWaitingRoomEnabled,
    isInWaitingRoom,
    bookmarks,
    summaries,
    currentMinutes,
    askAiTextResponse,
    isAskAiTextProcessing,

    // Computed
    isConnected: connectionStatus === "connected",
    isConnecting: connectionStatus === "connecting",
    isConversationActive: conversationStatus === "active",
    isSpeaking: speakingStatus !== "none",
    isUserSpeaking: speakingStatus === "user",
    isAISpeaking: speakingStatus === "ai",
    isVideoEnabled: localVideoStream !== null,
    isScreenSharing,
    isMuted,
    isListenMode,

    // Actions
    connect,
    connectSocket,
    setupRoomWebRTC,
    disconnect,
    startConversation,
    endConversation,
    sendMessage,
    setMuted,
    setListenMode,
    toggleListenMode,
    enableVideo,
    disableVideo,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    toggleScreenShare,
    updateConfig,
    getStats,
    clearError,

    // Host control actions
    muteParticipant,
    muteAll,
    unmuteAll,
    removeParticipant,
    lockRoom,
    endMeeting,
    transferHost,
    toggleTranscription,
    askAi,
    cancelAskAi,
    askAiText,
    enableWaitingRoom,
    admitParticipant,
    denyParticipant,
    admitAll,

    // AI differentiator actions
    generateSummary,
    generateMinutes,
    addBookmark,
    removeBookmark: removeBookmarkAction,
    getBookmarks: getBookmarksAction,
    getTranscript: getTranscriptAction,
    getSummaries: getSummariesAction,
    getMinutes: getMinutesAction,
  };
}
