// React Native SDK – public exports
// Re-export everything so callers only need one import path.

export { MayaVoiceNativeClient } from "./client";
export { useMayaVoiceChat } from "./useMayaVoiceChat";
export type {
  MayaVoiceNativeConfig,
  UseMayaVoiceChatConfig,
  UseMayaVoiceChatReturn,
  RNMediaStream,
} from "./types";

// Re-export core types so downstream consumers don't need a separate dep
export type {
  ConnectionStatus,
  ConversationStatus,
  SpeakingStatus,
  ConversationMessage,
  WebRTCStats,
  MayaVoiceError,
  RoomMode,
  RoomParticipant,
  TranscriptionEntry,
  WaitingRoomEntry,
  RoomInfo,
  MeetingCallbacks,
  MeetingBookmark,
  MeetingSummary,
  MeetingMinutes,
} from "@voxera/sdk-core";
