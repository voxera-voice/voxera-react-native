/**
 * Maya Voice React Native Client
 *
 * Works on iOS and Android via react-native-webrtc + mediasoup-client.
 *
 * SETUP REQUIREMENTS (add to your app):
 * 1. Install: react-native-webrtc, socket.io-client, mediasoup-client, eventemitter3
 * 2. In your app entry file (index.js) add BEFORE any other imports:
 *       import 'react-native-webrtc';
 * 3. iOS: add NSMicrophoneUsageDescription & NSCameraUsageDescription to Info.plist
 * 4. Android: add RECORD_AUDIO, CAMERA permissions to AndroidManifest.xml
 *    and call PermissionsAndroid.request() before connect().
 */

import EventEmitter from "eventemitter3";
import { io, Socket as SocketIOClient } from "socket.io-client";
import { Device } from "mediasoup-client";
import type {
  MayaVoiceEvents,
  WebRTCStats,
  ConversationMessage,
  ConnectionStatus,
  ConversationStatus,
  SpeakingStatus,
  RoomMode,
  MeetingCallbacks,
} from "@maya-voice/sdk-core";
import { MayaVoiceError, ErrorCodes } from "@maya-voice/sdk-core";
import type { MayaVoiceNativeConfig, RNMediaStream } from "./types";

// react-native-webrtc exports – resolved at runtime after the app imports the package
let rnWebRTC: any;
try {
  /* eslint-disable @typescript-eslint/no-var-requires */
  rnWebRTC = require("react-native-webrtc");
} catch {
  // Will surface a clear error when connect() is called on web accidentally
}

const getMediaDevices = () => {
  if (!rnWebRTC?.mediaDevices) {
    throw new MayaVoiceError(
      "react-native-webrtc not found. Import it at the top of your app entry file.",
      ErrorCodes.WEBRTC_ERROR
    );
  }
  return rnWebRTC.mediaDevices as any;
};

/**
 * MayaVoiceNativeClient – mirrors MayaVoiceClient from sdk-core
 * but uses react-native-webrtc instead of browser APIs.
 */
export class MayaVoiceNativeClient extends EventEmitter<MayaVoiceEvents> {
  private config: MayaVoiceNativeConfig;
  private socket: SocketIOClient | null = null;

  private device: InstanceType<typeof Device> | null = null;
  private sendTransport: any = null;
  private recvTransport: any = null;
  private audioProducer: any = null;
  private videoProducer: any = null;
  private screenShareProducer: any = null;
  private aiConsumers: Map<string, any> = new Map();

  private localStream: RNMediaStream | null = null;
  private localVideoStream: RNMediaStream | null = null;
  private remoteStream: RNMediaStream | null = null;
  private remoteVideoStream: RNMediaStream | null = null;
  private localScreenStream: RNMediaStream | null = null;

  private _connectionStatus: ConnectionStatus = "idle";
  private _conversationStatus: ConversationStatus = "idle";
  private _speakingStatus: SpeakingStatus = "none";
  private _messages: ConversationMessage[] = [];
  private _sessionId: string | null = null;

  private _isListenMode = false;
  private reconnectAttempts = 0;
  private statsIntervalId: ReturnType<typeof setInterval> | null = null;

  // Meeting state
  private _roomMode: RoomMode | null = null;
  private _isHost: boolean = false;
  private _meetingCallbacks: MeetingCallbacks = {};

  constructor(config: MayaVoiceNativeConfig) {
    super();
    if (!config.appKey) throw new MayaVoiceError("appKey is required", ErrorCodes.INVALID_CONFIG);
    if (!config.serverUrl) throw new MayaVoiceError("serverUrl is required", ErrorCodes.INVALID_CONFIG);
    this.config = {
      connectionOptions: {
        autoReconnect: true,
        reconnectAttempts: 3,
        reconnectDelay: 1000,
        timeout: 30000,
      },
      ...config,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Public getters
  // ─────────────────────────────────────────────────────────

  get connectionStatus() { return this._connectionStatus; }
  get conversationStatus() { return this._conversationStatus; }
  get speakingStatus() { return this._speakingStatus; }
  get messages(): ConversationMessage[] { return [...this._messages]; }
  get sessionId() { return this._sessionId; }
  get isConnected() { return this._connectionStatus === "connected"; }
  get isConversationActive() { return this._conversationStatus === "active"; }
  get localVideo(): RNMediaStream | null { return this.localVideoStream; }
  get remote(): RNMediaStream | null { return this.remoteStream; }
  get remoteVideo(): RNMediaStream | null { return this.remoteVideoStream; }
  get screenShare(): RNMediaStream | null { return this.localScreenStream; }
  get isScreenSharing() { return this.localScreenStream !== null; }
  get roomMode(): RoomMode | null { return this._roomMode; }
  get isHost(): boolean { return this._isHost; }
  get getSocket() { return this.socket; }

  // ─────────────────────────────────────────────────────────
  // Meeting callbacks & listeners
  // ─────────────────────────────────────────────────────────

  setMeetingCallbacks(callbacks: MeetingCallbacks): void {
    this._meetingCallbacks = callbacks;
  }

  setupMeetingListeners(): void {
    if (!this.socket) return;

    // Participant events
    this.socket.on('participant-joined', (data: any) => {
      this.emit('participant:joined', data);
      this._meetingCallbacks.onParticipantJoined?.(data);
    });
    this.socket.on('participant-left', (data: any) => {
      this.emit('participant:left', data);
      this._meetingCallbacks.onParticipantLeft?.(data);
    });
    this.socket.on('participant-removed', (data: any) => {
      this.emit('participant:removed', data);
      this._meetingCallbacks.onParticipantRemoved?.(data);
    });
    this.socket.on('participants-updated', (data: any) => {
      this.emit('participants:updated', data);
      this._meetingCallbacks.onParticipantsUpdated?.(data);
    });

    // Host control events
    this.socket.on('you-were-muted', (data: any) => {
      this.emit('you:muted', data);
      this._meetingCallbacks.onYouWereMuted?.(data);
    });
    this.socket.on('you-were-removed', (data: any) => {
      this.emit('you:removed', data);
      this._meetingCallbacks.onYouWereRemoved?.(data);
    });
    this.socket.on('all-muted', (data: any) => {
      this.emit('you:muted', data);
      this._meetingCallbacks.onAllMuted?.(data);
    });
    this.socket.on('all-unmuted', (data: any) => {
      this._meetingCallbacks.onAllUnmuted?.(data);
    });
    this.socket.on('host-changed', (data: any) => {
      if (this.socket) {
        this._isHost = data.newHostClientId === this.socket.id;
      }
      this.emit('host:changed', data);
      this._meetingCallbacks.onHostChanged?.(data);
    });
    this.socket.on('meeting-ended', (data: any) => {
      this.emit('meeting:ended', data);
      this._meetingCallbacks.onMeetingEnded?.(data);
    });
    this.socket.on('room-locked-changed', (data: any) => {
      this.emit('room:locked', data);
      this._meetingCallbacks.onRoomLockedChanged?.(data);
    });

    // Transcription events
    this.socket.on('transcription-toggled', (data: any) => {
      this.emit('transcription:toggled', data);
      this._meetingCallbacks.onTranscriptionToggled?.(data);
    });
    this.socket.on('live-transcription', (data: any) => {
      this.emit('transcription:live', data);
      this._meetingCallbacks.onLiveTranscription?.(data);
    });

    // Ask AI events
    this.socket.on('ask-ai-started', (data: any) => {
      this.emit('ask-ai:started', data);
      this._meetingCallbacks.onAskAiStarted?.(data);
    });
    this.socket.on('ask-ai-processing', () => {
      this.emit('ask-ai:processing');
      this._meetingCallbacks.onAskAiProcessing?.();
    });
    this.socket.on('ask-ai-cancelled', (data: any) => {
      this.emit('ask-ai:cancelled', data);
      this._meetingCallbacks.onAskAiCancelled?.(data);
    });

    // Text-only AI events
    this.socket.on('ask-ai-text-started', (data: any) => {
      this.emit('ask-ai-text:started', data);
      this._meetingCallbacks.onAskAiTextStarted?.(data);
    });
    this.socket.on('ask-ai-text-chunk', (data: any) => {
      this.emit('ask-ai-text:chunk', data);
      this._meetingCallbacks.onAskAiTextChunk?.(data);
    });
    this.socket.on('ask-ai-text-response', (data: any) => {
      this.emit('ask-ai-text:response', data);
      this._meetingCallbacks.onAskAiTextResponse?.(data);
    });
    this.socket.on('ask-ai-text-error', (data: any) => {
      this.emit('ask-ai-text:error', data);
      this._meetingCallbacks.onAskAiTextError?.(data);
    });

    // Waiting room events
    this.socket.on('waiting-room', (data: any) => {
      this.emit('waiting-room:status', data);
      this._meetingCallbacks.onWaitingRoom?.(data);
    });
    this.socket.on('admitted', (data: any) => {
      this._roomMode = data.roomMode || null;
      this.emit('waiting-room:admitted', data);
      this._meetingCallbacks.onAdmitted?.(data);
    });
    this.socket.on('denied', (data: any) => {
      this.emit('waiting-room:denied', data);
      this._meetingCallbacks.onDenied?.(data);
    });
    this.socket.on('waiting-room-updated', (data: any) => {
      this.emit('waiting-room:updated', data);
      this._meetingCallbacks.onWaitingRoomUpdated?.(data);
    });
    this.socket.on('waiting-room-toggled', (data: any) => {
      this.emit('waiting-room:toggled', data);
      this._meetingCallbacks.onWaitingRoomToggled?.(data);
    });

    // AI Differentiator events
    this.socket.on('summary-generating', (data: any) => {
      this.emit('summary:generating', data);
      this._meetingCallbacks.onSummaryGenerating?.(data);
    });
    this.socket.on('summary-generated', (data: any) => {
      this.emit('summary:generated', data);
      this._meetingCallbacks.onSummaryGenerated?.(data);
    });
    this.socket.on('minutes-generating', (data: any) => {
      this.emit('minutes:generating', data);
      this._meetingCallbacks.onMinutesGenerating?.(data);
    });
    this.socket.on('minutes-generated', (data: any) => {
      this.emit('minutes:generated', data);
      this._meetingCallbacks.onMinutesGenerated?.(data);
    });
    this.socket.on('bookmark-added', (data: any) => {
      this.emit('bookmark:added', data);
      this._meetingCallbacks.onBookmarkAdded?.(data);
    });
    this.socket.on('bookmark-removed', (data: any) => {
      this.emit('bookmark:removed', data);
      this._meetingCallbacks.onBookmarkRemoved?.(data);
    });
  }

  // ─────────────────────────────────────────────────────────
  // connect / disconnect
  // ─────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this._connectionStatus === "connected" || this._connectionStatus === "connecting") return;
    this.setConnectionStatus("connecting");
    try {
      const session = await this.initSession();
      this._sessionId = session.data?.sessionId || session.sessionId || null;
      await this.requestMicAccess();
      await this.connectSocket(session);
      await this.setupWebRTC(session);
      this.setConnectionStatus("connected");
    } catch (err) {
      this.handleError(err as Error);
      this.setConnectionStatus("error");
      throw err;
    }
  }

  /**
   * Connect socket only — no session init. Used for multi-room flow
   * where the server creates the session via create-room / join-room.
   */
  async connectSocketOnly(): Promise<void> {
    if (this._connectionStatus === "connected" || this._connectionStatus === "connecting") return;
    this.setConnectionStatus("connecting");
    try {
      await this.connectWebSocketOnly();
      this.setConnectionStatus("connected");
    } catch (err) {
      this.handleError(err as Error);
      this.setConnectionStatus("error");
      throw err;
    }
  }

  /**
   * Set up microphone + WebRTC transports after the server-side session
   * already exists (e.g. after create-room or join-room).
   */
  async setupRoomWebRTC(): Promise<void> {
    if (!this.socket) {
      throw new MayaVoiceError(
        "Socket not connected — call connectSocketOnly() first",
        ErrorCodes.CONNECTION_FAILED
      );
    }
    await this.requestMicAccess();
    await this.setupWebRTC({} as any);
  }

  async disconnect(): Promise<void> {
    if (this._connectionStatus === "disconnected" || this._connectionStatus === "idle") return;
    try {
      if (this._conversationStatus === "active") await this.endConversation();
      this.cleanup();
      this.setConnectionStatus("disconnected");
    } catch (err) {
      this.handleError(err as Error);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Conversation
  // ─────────────────────────────────────────────────────────

  async startConversation(): Promise<void> {
    if (this._connectionStatus !== "connected")
      throw new MayaVoiceError("Must be connected first", ErrorCodes.CONNECTION_FAILED);
    if (this._conversationStatus === "active") return;
    this.setConversationStatus("starting");
    try {
      this.setMuted(false);
      this.sendSignal({ type: "conversation:start", config: { chat: this.config.chatConfig, voice: this.config.voiceConfig } });
      this.setConversationStatus("active");
    } catch (err) {
      this.setConversationStatus("idle");
      throw err;
    }
  }

  async endConversation(): Promise<void> {
    if (this._conversationStatus !== "active") return;
    this.setConversationStatus("ending");
    try {
      this.sendSignal({ type: "conversation:end" });
      this.stopLocalStream();
      this.setConversationStatus("ended");
    } finally {
      this.setConversationStatus("idle");
    }
  }

  sendMessage(content: string): void {
    if (!this.isConnected) throw new MayaVoiceError("Not connected", ErrorCodes.CONNECTION_FAILED);
    const message: ConversationMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      role: "user",
      content,
      timestamp: new Date(),
    };
    this._messages.push(message);
    this.emit("message", message);
    this.sendSignal({ type: "message:send", message });
  }

  // ─────────────────────────────────────────────────────────
  // Mute
  // ─────────────────────────────────────────────────────────

  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((t: any) => { t.enabled = !muted; });
    if (this.audioProducer) {
      muted ? this.audioProducer.pause() : this.audioProducer.resume();
    }
  }

  // ─────────────────────────────────────────────────────────
  // Listen Mode – mute microphone while still receiving AI audio
  // ─────────────────────────────────────────────────────────

  get isListenMode(): boolean { return this._isListenMode; }

  setListenMode(mode: boolean): void {
    this._isListenMode = mode;
    this.setMuted(mode);
  }

  toggleListenMode(): boolean {
    this.setListenMode(!this._isListenMode);
    return this._isListenMode;
  }

  // ─────────────────────────────────────────────────────────
  // Host Controls
  // ─────────────────────────────────────────────────────────

  async muteParticipant(sessionId: string, targetClientId: string): Promise<any> {
    return this.socket?.emitWithAck('mute-participant', { sessionId, targetClientId });
  }

  async muteAll(sessionId: string): Promise<any> {
    return this.socket?.emitWithAck('mute-all', { sessionId });
  }

  async unmuteAll(sessionId: string): Promise<any> {
    return this.socket?.emitWithAck('unmute-all', { sessionId });
  }

  async removeParticipant(sessionId: string, targetClientId: string): Promise<any> {
    return this.socket?.emitWithAck('remove-participant', { sessionId, targetClientId });
  }

  async lockRoom(sessionId: string, locked: boolean): Promise<any> {
    return this.socket?.emitWithAck('lock-room', { sessionId, locked });
  }

  async endMeeting(sessionId: string): Promise<any> {
    return this.socket?.emitWithAck('end-meeting', { sessionId });
  }

  async transferHost(sessionId: string, targetClientId: string): Promise<any> {
    return this.socket?.emitWithAck('transfer-host', { sessionId, targetClientId });
  }

  async toggleTranscription(sessionId: string, enabled: boolean): Promise<any> {
    return this.socket?.emitWithAck('toggle-transcription', { sessionId, enabled });
  }

  async askAi(sessionId: string): Promise<any> {
    return this.socket?.emitWithAck('ask-ai', { sessionId });
  }

  async cancelAskAi(sessionId: string): Promise<any> {
    return this.socket?.emitWithAck('cancel-ask-ai', { sessionId });
  }

  async askAiText(sessionId: string, prompt?: string): Promise<any> {
    return this.socket?.emitWithAck('ask-ai-text', { sessionId, prompt });
  }

  async enableWaitingRoom(sessionId: string, enabled: boolean): Promise<any> {
    return this.socket?.emitWithAck('enable-waiting-room', { sessionId, enabled });
  }

  async admitParticipant(sessionId: string, targetClientId: string): Promise<any> {
    return this.socket?.emitWithAck('admit-participant', { sessionId, targetClientId });
  }

  async denyParticipant(sessionId: string, targetClientId: string): Promise<any> {
    return this.socket?.emitWithAck('deny-participant', { sessionId, targetClientId });
  }

  async admitAll(sessionId: string): Promise<any> {
    return this.socket?.emitWithAck('admit-all', { sessionId });
  }

  // ─────────────────────────────────────────────────────────
  // AI Differentiators
  // ─────────────────────────────────────────────────────────

  async generateSummary(sessionId: string): Promise<any> {
    return this.socket?.emitWithAck('generate-summary', { sessionId });
  }

  async generateMinutes(sessionId: string): Promise<any> {
    return this.socket?.emitWithAck('generate-minutes', { sessionId });
  }

  async addBookmark(sessionId: string, label: string, isActionItem: boolean = false): Promise<any> {
    return this.socket?.emitWithAck('add-bookmark', { sessionId, label, isActionItem });
  }

  async removeBookmark(sessionId: string, bookmarkId: string): Promise<any> {
    return this.socket?.emitWithAck('remove-bookmark', { sessionId, bookmarkId });
  }

  async getBookmarks(sessionId: string): Promise<any> {
    return this.socket?.emitWithAck('get-bookmarks', { sessionId });
  }

  async getTranscript(sessionId: string): Promise<any> {
    return this.socket?.emitWithAck('get-transcript', { sessionId });
  }

  async getSummaries(sessionId: string): Promise<any> {
    return this.socket?.emitWithAck('get-summaries', { sessionId });
  }

  async getMinutes(sessionId: string): Promise<any> {
    return this.socket?.emitWithAck('get-minutes', { sessionId });
  }

  setRoomInfo(roomMode: RoomMode, isHost: boolean): void {
    this._roomMode = roomMode;
    this._isHost = isHost;
  }

  // ─────────────────────────────────────────────────────────
  // Video
  // ─────────────────────────────────────────────────────────

  async enableVideo(): Promise<void> {
    if (this.localVideoStream) return;
    const vc = this.config.videoConfig || {};
    const mediaDevices = getMediaDevices();

    this.localVideoStream = await (mediaDevices.getUserMedia as any)({
      video: {
        width: vc.width || 1280,
        height: vc.height || 720,
        frameRate: vc.frameRate || 30,
        facingMode: vc.facingMode || "user",
      },
    }) as RNMediaStream;

    this.emit("video:local", this.localVideoStream as any);
    this.config.onLocalVideoStream?.(this.localVideoStream);

    if (this.sendTransport && this._connectionStatus === "connected") {
      await this.produceVideoTrack();
    }
  }

  /**
   * Produce the local video track on the send transport.
   * Forces VP8 codec because the media-server VideoFrameExtractor only parses VP8
   * payload descriptors. React Native devices default to H264 hardware encoding,
   * which produces garbage frames in the VP8-only server pipeline.
   */
  private async produceVideoTrack(): Promise<void> {
    if (!this.localVideoStream || !this.sendTransport) return;
    const videoTrack = (this.localVideoStream as any).getVideoTracks()[0];
    if (!videoTrack) return;

    // Force VP8 codec — the server's VideoFrameExtractor only understands VP8
    const vp8Codec = this.device?.rtpCapabilities?.codecs?.find(
      (c: any) => c.mimeType.toLowerCase() === "video/vp8"
    );

    const useSimulcast = !this.config.videoConfig?.enableVideoAI;
    try {
      this.videoProducer = await this.sendTransport.produce({
        track: videoTrack,
        encodings: useSimulcast
          ? [
              { maxBitrate: 500_000 },
              { maxBitrate: 1_000_000 },
              { maxBitrate: 1_500_000 },
            ]
          : [{ maxBitrate: 1_000_000 }],
        codecOptions: { videoGoogleStartBitrate: 1000 },
        codec: vp8Codec,
      });
    } catch (err: any) {
      console.error("[Maya RN] Video produce failed:", err?.message || err);
      // Clean up — disable video since produce failed
      (this.localVideoStream as any)?.getTracks().forEach((t: any) => t.stop());
      this.localVideoStream = null;
      this.emit("video:local", null as any);
      this.config.onLocalVideoStream?.(null);
      throw new MayaVoiceError(
        `Video produce failed: ${err?.message || "Server rejected video"}`,
        ErrorCodes.WEBRTC_ERROR
      );
    }
  }

  async disableVideo(): Promise<void> {
    (this.localVideoStream as any)?.getTracks().forEach((t: any) => t.stop());
    this.localVideoStream = null;
    this.videoProducer?.close();
    this.videoProducer = null;
    this.emit("video:local", null as any);
    this.config.onLocalVideoStream?.(null);
  }

  async toggleVideo(): Promise<boolean> {
    if (this.localVideoStream) { await this.disableVideo(); return false; }
    await this.enableVideo(); return true;
  }

  // ─────────────────────────────────────────────────────────
  // Screen share (React Native requires platform capabilities)
  // ─────────────────────────────────────────────────────────

  async startScreenShare(): Promise<void> {
    if (this.localScreenStream) return;
    const mediaDevices = getMediaDevices();
    if (!(mediaDevices as any).getDisplayMedia) {
      throw new MayaVoiceError(
        "Screen sharing is not supported on this platform / OS version.",
        ErrorCodes.MEDIA_ACCESS_DENIED
      );
    }
    try {
      const sc = this.config.screenShareConfig || {};
      this.localScreenStream = await (mediaDevices as any).getDisplayMedia({
        video: { width: sc.width || 1920, height: sc.height || 1080, frameRate: sc.frameRate || 15 },
        audio: sc.audio ?? false,
      }) as RNMediaStream;

      this.emit("screen:local", this.localScreenStream as any);
      this.config.onLocalScreenStream?.(this.localScreenStream);

      if (this.sendTransport && this._connectionStatus === "connected") {
        const track = (this.localScreenStream as any).getVideoTracks()[0];
        this.screenShareProducer = await this.sendTransport.produce({
          track,
          encodings: [{ maxBitrate: 1_500_000 }],
          appData: { mediaType: "screen" },
        });
        track.addEventListener?.("ended", () => this.stopScreenShare());
      }
    } catch (err: any) {
      if (err?.name === "NotAllowedError") return; // user cancelled
      throw new MayaVoiceError(`Screen share failed: ${err.message}`, ErrorCodes.MEDIA_ACCESS_DENIED);
    }
  }

  async stopScreenShare(): Promise<void> {
    (this.localScreenStream as any)?.getTracks().forEach((t: any) => t.stop());
    this.localScreenStream = null;
    this.screenShareProducer?.close();
    this.screenShareProducer = null;
    this.emit("screen:local", null as any);
    this.config.onLocalScreenStream?.(null);
  }

  async toggleScreenShare(): Promise<boolean> {
    if (this.localScreenStream) { await this.stopScreenShare(); return false; }
    await this.startScreenShare(); return this.localScreenStream !== null;
  }

  // ─────────────────────────────────────────────────────────
  // Stats
  // ─────────────────────────────────────────────────────────

  async getStats(): Promise<WebRTCStats | null> {
    if (!this.sendTransport) return null;
    try {
      const stats = await this.sendTransport.getStats();
      const result: WebRTCStats = { bytesReceived: 0, bytesSent: 0, packetsReceived: 0, packetsSent: 0 };
      stats.forEach((r: any) => {
        if (r.type === "inbound-rtp" && r.kind === "audio") { result.bytesReceived = r.bytesReceived || 0; result.packetsReceived = r.packetsReceived || 0; }
        if (r.type === "outbound-rtp" && r.kind === "audio") { result.bytesSent = r.bytesSent || 0; result.packetsSent = r.packetsSent || 0; }
        if (r.type === "candidate-pair" && r.state === "succeeded") result.roundTripTime = r.currentRoundTripTime;
      });
      return result;
    } catch { return null; }
  }

  updateConfig(partial: Partial<MayaVoiceNativeConfig>): void {
    this.config = { ...this.config, ...partial };
    if (this._connectionStatus === "connected") {
      this.sendSignal({ type: "config:update", config: { chat: this.config.chatConfig, voice: this.config.voiceConfig } });
    }
  }

  // ─────────────────────────────────────────────────────────
  // Private – session init
  // ─────────────────────────────────────────────────────────

  private async initSession(): Promise<any> {
    const apiUrl = this.config.serverUrl.replace("wss://", "https://").replace("ws://", "http://");
    const timeoutMs = this.config.connectionOptions?.timeout || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${apiUrl}/api/session/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": this.config.appKey },
        body: JSON.stringify({ configurationId: this.config.configurationId, metadata: {} }),
        signal: controller.signal,
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const body = await res.json(); detail = body?.message || body?.error?.message || detail; } catch {}
        throw new MayaVoiceError(`Failed to initialize session: ${detail}`, ErrorCodes.AUTHENTICATION_FAILED);
      }
      const json = await res.json();
      if (json.success === false) throw new MayaVoiceError(json.error?.message || "Init failed", json.error?.code || ErrorCodes.AUTHENTICATION_FAILED);
      return json;
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new MayaVoiceError(`Could not reach server at ${apiUrl} (timed out after ${timeoutMs / 1000}s)`, ErrorCodes.TIMEOUT);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async requestMicAccess(): Promise<void> {
    try {
      const mediaDevices = getMediaDevices();
      this.localStream = await (mediaDevices.getUserMedia as any)({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      }) as RNMediaStream;
      // Audio level monitoring via periodic getStats polling
      this.startAudioLevelPolling();
    } catch (err: any) {
      throw new MayaVoiceError(
        `Microphone access denied: ${err?.message || 'unknown reason'}. Check app permissions in Settings.`,
        ErrorCodes.MEDIA_ACCESS_DENIED
      );
    }
  }

  private async connectSocket(session: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const sessionId = session.data?.sessionId || session.sessionId;
      this.socket = io(this.config.serverUrl, { transports: ["websocket"], reconnection: false });

      const timeout = setTimeout(() => {
        this.socket?.disconnect();
        reject(new MayaVoiceError("Socket connection timed out", ErrorCodes.TIMEOUT));
      }, this.config.connectionOptions?.timeout || 30000);

      this.socket.on("connect", async () => {
        clearTimeout(timeout);
        try {
          await this.socket?.emitWithAck("init-session-connection", {
            sessionId,
            appKey: this.config.appKey,
            configurationId: this.config.configurationId,
            userId: "rn-user",
            enableVideoAI: this.config.videoConfig?.enableVideoAI || false,
          });
          resolve();
        } catch (err) { reject(err); }
      });

      this.socket.on("disconnect", () => {
        if (this._connectionStatus === "connected") this.handleDisconnect();
      });

      this.socket.on("connect_error", (err: Error) => {
        clearTimeout(timeout);
        reject(new MayaVoiceError(`Connection failed: ${err.message}`, ErrorCodes.CONNECTION_FAILED));
      });
    });
  }

  private async connectWebSocketOnly(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket = io(this.config.serverUrl, { transports: ["websocket"], reconnection: false });

      const timeout = setTimeout(() => {
        this.socket?.disconnect();
        reject(new MayaVoiceError("Socket connection timed out", ErrorCodes.TIMEOUT));
      }, this.config.connectionOptions?.timeout || 30000);

      this.socket.on("connect", () => {
        clearTimeout(timeout);
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on("disconnect", () => {
        if (this._connectionStatus === "connected") this.handleDisconnect();
      });

      this.socket.on("connect_error", (err: Error) => {
        clearTimeout(timeout);
        reject(new MayaVoiceError(`Connection failed: ${err.message}`, ErrorCodes.CONNECTION_FAILED));
      });
    });
  }

  private async setupWebRTC(session: any): Promise<void> {
    // Register WebRTC globals (RTCPeerConnection, etc.) so mediasoup's ReactNative106 handler can find them
    if (typeof rnWebRTC?.registerGlobals === "function") {
      rnWebRTC.registerGlobals();
    }

    // 1. RTP capabilities
    const rtpCapabilities = await this.socket!.emitWithAck("getRtpCapabilities");

    // Patch Opus codec for AI audio (PT-101)
    const opus = (rtpCapabilities?.codecs as any[])?.find(
      (c: any) => c.kind === "audio" && c.mimeType === "audio/opus"
    );
    if (opus && !(rtpCapabilities?.codecs as any[])?.find((c: any) => c.preferredPayloadType === 101)) {
      (rtpCapabilities.codecs as any[]).push({ ...opus, preferredPayloadType: 101 });
    }

    // 2. Load device
    // Must use 'ReactNative106' handler — mediasoup-client cannot auto-detect it in RN
    this.device = new Device({ handlerName: 'ReactNative106' });
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });

    // 3. ICE servers
    const iceServers = await this.socket!.emitWithAck("getIceServers");

    // 4. Send transport
    const sendParams = await this.socket!.emitWithAck("createTransport");
    this.sendTransport = this.device.createSendTransport({
      ...sendParams,
      iceServers: iceServers || [{ urls: "stun:stun.l.google.com:19302" }],
      iceTransportPolicy: "relay",
    });

    this.sendTransport.on("connect", ({ dtlsParameters }: any, cb: () => void) => {
      this.socket?.emit("connectTransport", { dtlsParameters, transportId: this.sendTransport!.id });
      cb();
    });
    this.sendTransport.on("produce", async ({ kind, rtpParameters }: any, cb: (p: { id: string }) => void, errback: (e: Error) => void) => {
      try {
        const response = await this.socket!.emitWithAck("produce", { kind, rtpParameters, transportId: this.sendTransport!.id });
        if (!response || response.error) {
          errback(new Error(response?.error ?? "produce failed: no response from server"));
          return;
        }
        cb({ id: response.id });
      } catch (e) { errback(e as Error); }
    });

    // 5. Produce audio
    const audioTrack = (this.localStream as any)?.getAudioTracks()[0];
    if (audioTrack) this.audioProducer = await this.sendTransport.produce({ track: audioTrack });

    // 5.5 Produce existing video track if enableVideo() was called before connect()
    if (this.localVideoStream) {
      await this.produceVideoTrack();
    }

    // 6. Recv transport
    const recvParams = await this.socket!.emitWithAck("createTransport");
    this.recvTransport = this.device.createRecvTransport({
      ...recvParams,
      iceServers: iceServers || [{ urls: "stun:stun.l.google.com:19302" }],
      iceTransportPolicy: "relay",
    });
    this.recvTransport.on("connect", ({ dtlsParameters }: any, cb: () => void) => {
      this.socket?.emit("connectTransport", { dtlsParameters, transportId: this.recvTransport!.id });
      cb();
    });

    // Listen for server-side producer errors (e.g. "Video calls not enabled")
    this.socket?.on("producer-error", (data: any) => {
      console.error("[Maya RN] Producer error from server:", data?.error || data?.message);
      if (data?.kind === "video") {
        // Clean up local video since the server rejected it
        this.disableVideo();
        this.handleError(new Error(data.message || data.error || "Video produce rejected by server"));
      }
    });

    // 7. new-producer → consume AI audio + video
    this.socket?.on("new-producer", async ({ producerId, source, kind: producerKind }: any) => {
      if (source !== "ai") return;

      // For audio, clean up previous AI audio consumers
      if (!producerKind || producerKind === "audio") {
        this.aiConsumers.forEach((c, key) => {
          if (!key.startsWith("video:")) {
            try { c.close(); } catch { }
            this.aiConsumers.delete(key);
          }
        });
      }

      try {
        const { id, kind, rtpParameters } = await this.socket!.emitWithAck("consume", {
          producerId,
          transportId: this.recvTransport!.id,
          rtpCapabilities: this.device!.rtpCapabilities,
        });
        const consumer = await this.recvTransport!.consume({ id, producerId, kind, rtpParameters });
        await consumer.resume();

        const RNMediaStreamCtor = rnWebRTC?.MediaStream;

        if (kind === "audio") {
          this.aiConsumers.set(producerId, consumer);
          // In react-native-webrtc, audio from WebRTC tracks is automatically
          // played through the device speaker — no HTMLAudioElement required.
          if (RNMediaStreamCtor) {
            this.remoteStream = new RNMediaStreamCtor([consumer.track]);
            this.config.onRemoteStream?.(this.remoteStream);
          }
        } else if (kind === "video") {
          // Clean up previous video consumer
          const prevVideo = this.aiConsumers.get("video:ai");
          if (prevVideo) { try { prevVideo.close(); } catch { } }
          this.aiConsumers.set("video:ai", consumer);

          if (RNMediaStreamCtor) {
            this.remoteVideoStream = new RNMediaStreamCtor([consumer.track]);
            this.emit("video:remote", this.remoteVideoStream as any);
            this.config.onRemoteVideoStream?.(this.remoteVideoStream);
          }
        }
      } catch (err) {
        console.error("[Maya RN] Error consuming AI producer:", err);
      }
    });

    // 8. conversation-message
    this.socket?.on("conversation-message", (data: any) => {
      const message: ConversationMessage = {
        id: `${data.role}-${data.timestamp}`,
        role: data.role,
        content: data.content,
        timestamp: new Date(data.timestamp),
      };
      this._messages.push(message);
      this.emit("message", message);
      this.config.onMessage?.(message);
    });

    // 9. speaking-status-changed
    this.socket?.on("speaking-status-changed", (data: any) => {
      const map: Record<string, "user" | "ai" | "none"> = {
        "user-speaking": "user",
        "ai-speaking": "ai",
        idle: "none",
        thinking: "none",
        searching: "none",
      };
      const status = map[data.status] || "none";
      this.setSpeakingStatus(status);
    });

    // 10. volume-changed – relay server-side volume levels to callbacks
    this.socket?.on("volume-changed", (data: any) => {
      const vol = typeof data.volume === "number" ? data.volume : -100;
      if (data.isAi) {
        this.emit("audio:level", vol);
        this.config.onAIAudioLevel?.(vol);
      } else {
        this.emit("audio:level", vol);
        this.config.onAudioLevel?.(vol);
      }
    });
  }

  private startAudioLevelPolling(): void {
    // Poll audio producer stats every 200ms for volume level approximation
    this.statsIntervalId = setInterval(async () => {
      if (!this.audioProducer) return;
      try {
        const stats = await this.audioProducer.getStats?.();
        if (!stats) return;
        stats.forEach((r: any) => {
          if (r.type === "media-source" && r.audioLevel != null) {
            this.emit("audio:level", r.audioLevel as number);
            this.config.onAudioLevel?.(r.audioLevel as number);
          }
        });
      } catch { }
    }, 200);
  }

  private stopLocalStream(): void {
    if (this.statsIntervalId) { clearInterval(this.statsIntervalId); this.statsIntervalId = null; }
    (this.localStream as any)?.getTracks().forEach((t: any) => t.stop());
    this.localStream = null;
    (this.localVideoStream as any)?.getTracks().forEach((t: any) => t.stop());
    this.localVideoStream = null;
    (this.localScreenStream as any)?.getTracks().forEach((t: any) => t.stop());
    this.localScreenStream = null;
  }

  private sendSignal(signal: Record<string, unknown>): void {
    if (this.socket?.connected) {
      const { type, ...data } = signal;
      this.socket.emit(type as string, data);
    }
  }

  private handleDisconnect(): void {
    const opts = this.config.connectionOptions;
    if (opts?.autoReconnect && this.reconnectAttempts < (opts.reconnectAttempts || 3)) {
      this.setConnectionStatus("reconnecting");
      this.reconnectAttempts++;
      setTimeout(() => this.connect().catch(() => { }), opts.reconnectDelay || 1000);
    } else {
      this.setConnectionStatus("disconnected");
    }
  }

  private handleError(err: Error): void {
    const mayaErr = err instanceof MayaVoiceError ? err : new MayaVoiceError(err.message, ErrorCodes.UNKNOWN_ERROR);
    this.emit("error", mayaErr);
    this.config.onError?.(mayaErr);
  }

  private setConnectionStatus(status: any): void {
    (this as any)._connectionStatus = status;
    this.emit("connection:status", status);
    this.config.onConnectionStatusChange?.(status);
  }

  private setConversationStatus(status: any): void {
    (this as any)._conversationStatus = status;
    this.emit("conversation:status", status);
    this.config.onConversationStatusChange?.(status);
  }

  private setSpeakingStatus(status: any): void {
    (this as any)._speakingStatus = status;
    this.emit("speaking:status", status);
    this.config.onSpeakingStatusChange?.(status);
  }

  private cleanup(): void {
    this.stopLocalStream();
    this.socket?.disconnect(); this.socket = null;
    this.audioProducer?.close(); this.audioProducer = null;
    this.videoProducer?.close(); this.videoProducer = null;
    this.screenShareProducer?.close(); this.screenShareProducer = null;
    this.aiConsumers.forEach((c) => { try { c.close(); } catch { } }); this.aiConsumers.clear();
    this.remoteVideoStream = null;
    this.config.onRemoteVideoStream?.(null);
    this.sendTransport?.close(); this.sendTransport = null;
    this.recvTransport?.close(); this.recvTransport = null;
    this.device = null;
    this._messages = [];
    this._sessionId = null;
    this._roomMode = null;
    this._isHost = false;
    this._meetingCallbacks = {};
  }
}
