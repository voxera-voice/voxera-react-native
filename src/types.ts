/**
 * Maya Voice SDK – React Native Types
 * Extends sdk-core types with React Native specifics.
 */

export type {
  ConnectionStatus,
  ConversationStatus,
  SpeakingStatus,
  ConversationMessage,
  ChatConfig,
  VoiceConfig,
  VideoConfig,
  ScreenShareConfig,
  ConnectionOptions,
  WebRTCStats,
  Session,
  MayaVoiceEvents,
  ErrorCode,
  RoomMode,
  RoomParticipant,
  TranscriptionEntry,
  WaitingRoomEntry,
  RoomInfo,
  MeetingCallbacks,
  MeetingBookmark,
  MeetingSummary,
  MeetingMinutes,
} from "@maya-voice/sdk-core";

export { MayaVoiceError, ErrorCodes } from "@maya-voice/sdk-core";

import type {
  ConnectionStatus,
  ConversationStatus,
  SpeakingStatus,
  ConversationMessage,
  ChatConfig,
  VoiceConfig,
  VideoConfig,
  ScreenShareConfig,
  ConnectionOptions,
  RoomMode,
  RoomParticipant,
  TranscriptionEntry,
  WaitingRoomEntry,
  MeetingBookmark,
  MeetingSummary,
  MeetingMinutes,
  MeetingCallbacks,
} from "@maya-voice/sdk-core";

/**
 * React Native specific media stream type.
 * react-native-webrtc provides its own MediaStream implementation.
 */
export type RNMediaStream = any; // RTCMediaStream from react-native-webrtc

/**
 * React Native config – same shape as web MayaVoiceConfig but callbacks
 * receive RNMediaStream instead of browser MediaStream.
 */
export interface MayaVoiceNativeConfig {
  // Required
  appKey: string;
  serverUrl: string;

  // Optional
  configurationId?: string;

  // Feature configs – identical to web
  chatConfig?: ChatConfig;
  voiceConfig?: VoiceConfig;
  videoConfig?: VideoConfig;
  screenShareConfig?: ScreenShareConfig;
  connectionOptions?: ConnectionOptions;

  // Callbacks
  onConnectionStatusChange?: (status: ConnectionStatus) => void;
  onConversationStatusChange?: (status: ConversationStatus) => void;
  onSpeakingStatusChange?: (status: SpeakingStatus) => void;
  onMessage?: (message: ConversationMessage) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (error: import("@maya-voice/sdk-core").MayaVoiceError) => void;
  onAudioLevel?: (level: number) => void;
  onAIAudioLevel?: (level: number) => void;
  /** Called when the local camera stream changes */
  onLocalVideoStream?: (stream: RNMediaStream | null) => void;
  /** Called when the AI audio stream changes */
  onRemoteStream?: (stream: RNMediaStream | null) => void;
  /** Called when the AI video stream changes */
  onRemoteVideoStream?: (stream: RNMediaStream | null) => void;
  /** Called when the screen share stream changes (iOS/Android) */
  onLocalScreenStream?: (stream: RNMediaStream | null) => void;

  /** Meeting event callbacks */
  meetingCallbacks?: MeetingCallbacks;
}

export interface UseMayaVoiceChatConfig extends MayaVoiceNativeConfig {
  /** Auto-connect on hook mount */
  autoConnect?: boolean;
  /** Auto-start conversation after connecting */
  autoStart?: boolean;
}

export interface UseMayaVoiceChatReturn {
  // Status
  connectionStatus: ConnectionStatus;
  conversationStatus: ConversationStatus;
  speakingStatus: SpeakingStatus;

  // Data
  conversationMessages: ConversationMessage[];
  currentTranscript: string;
  audioLevel: number;
  aiAudioLevel: number;
  error: import("@maya-voice/sdk-core").MayaVoiceError | null;

  // Streams (pass directly to RTCView or a custom renderer)
  localVideoStream: RNMediaStream | null;
  remoteStream: RNMediaStream | null;
  remoteVideoStream: RNMediaStream | null;
  localScreenStream: RNMediaStream | null;

  // Meeting state
  roomMode: RoomMode | null;
  isHost: boolean;
  roomParticipants: RoomParticipant[];
  transcriptions: TranscriptionEntry[];
  waitingRoom: WaitingRoomEntry[];
  isTranscriptionEnabled: boolean;
  isAskAiActive: boolean;
  isRoomLocked: boolean;
  isWaitingRoomEnabled: boolean;
  isInWaitingRoom: boolean;
  bookmarks: MeetingBookmark[];
  summaries: MeetingSummary[];
  currentMinutes: MeetingMinutes | null;
  askAiTextResponse: string;
  isAskAiTextProcessing: boolean;

  // Computed
  isConnected: boolean;
  isConnecting: boolean;
  isConversationActive: boolean;
  isSpeaking: boolean;
  isUserSpeaking: boolean;
  isAISpeaking: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isMuted: boolean;
  isListenMode: boolean;

  // Actions
  connect: () => Promise<void>;
  connectSocket: () => Promise<void>;
  setupRoomWebRTC: () => Promise<void>;
  disconnect: () => Promise<void>;
  startConversation: () => Promise<void>;
  endConversation: () => Promise<void>;
  sendMessage: (content: string) => void;
  setMuted: (muted: boolean) => void;
  setListenMode: (mode: boolean) => void;
  toggleListenMode: () => boolean;
  enableVideo: () => Promise<void>;
  disableVideo: () => Promise<void>;
  toggleVideo: () => Promise<boolean>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  toggleScreenShare: () => Promise<boolean>;
  updateConfig: (config: Partial<MayaVoiceNativeConfig>) => void;
  getStats: () => Promise<import("@maya-voice/sdk-core").WebRTCStats | null>;
  clearError: () => void;

  // Host control actions
  muteParticipant: (sessionId: string, targetClientId: string) => Promise<any>;
  muteAll: (sessionId: string) => Promise<any>;
  unmuteAll: (sessionId: string) => Promise<any>;
  removeParticipant: (sessionId: string, targetClientId: string) => Promise<any>;
  lockRoom: (sessionId: string, locked: boolean) => Promise<any>;
  endMeeting: (sessionId: string) => Promise<any>;
  transferHost: (sessionId: string, targetClientId: string) => Promise<any>;
  toggleTranscription: (sessionId: string, enabled: boolean) => Promise<any>;
  askAi: (sessionId: string) => Promise<any>;
  cancelAskAi: (sessionId: string) => Promise<any>;
  askAiText: (sessionId: string, prompt?: string) => Promise<any>;
  enableWaitingRoom: (sessionId: string, enabled: boolean) => Promise<any>;
  admitParticipant: (sessionId: string, targetClientId: string) => Promise<any>;
  denyParticipant: (sessionId: string, targetClientId: string) => Promise<any>;
  admitAll: (sessionId: string) => Promise<any>;

  // AI differentiator actions
  generateSummary: (sessionId: string) => Promise<any>;
  generateMinutes: (sessionId: string) => Promise<any>;
  addBookmark: (sessionId: string, label: string, isActionItem?: boolean) => Promise<any>;
  removeBookmark: (sessionId: string, bookmarkId: string) => Promise<any>;
  getBookmarks: (sessionId: string) => Promise<any>;
  getTranscript: (sessionId: string) => Promise<any>;
  getSummaries: (sessionId: string) => Promise<any>;
  getMinutes: (sessionId: string) => Promise<any>;
}
