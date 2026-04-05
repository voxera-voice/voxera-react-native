# @voxera/sdk-react-native

React Native SDK for the [Voxera](https://voxera.ai) voice AI platform. Built on top of `@voxera/sdk-core` with native WebRTC support via `react-native-webrtc`.

## Installation

```bash
npm install @voxera/sdk-react-native @voxera/sdk-core react-native-webrtc
```

### iOS Setup

```bash
cd ios && pod install
```

Add to `Info.plist`:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>Required for voice chat</string>
<key>NSCameraUsageDescription</key>
<string>Required for video calls</string>
```

### Android Setup

Add to `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
```

## Quick Start

```tsx
import { VoiceChatProvider, useVoxeraChat } from '@voxera/sdk-react-native';

function App() {
  return (
    <VoiceChatProvider>
      <VoiceChat />
    </VoiceChatProvider>
  );
}

function VoiceChat() {
  const {
    connect,
    disconnect,
    startConversation,
    endConversation,
    connectionStatus,
    conversationMessages,
    isUserSpeaking,
    isAISpeaking,
  } = useVoxeraChat({
    appKey: 'your-api-key',
    serverUrl: 'wss://api.voxera.ai',
    chatConfig: {
      systemPrompt: 'You are a helpful assistant.',
    },
  });

  return (
    <View>
      <Text>Status: {connectionStatus}</Text>
      <Button title="Connect" onPress={connect} />
      <Button title="Start" onPress={startConversation} />
    </View>
  );
}
```

## Features

- **`useVoxeraChat`** — React Native hook wrapping the full Voxera voice AI experience
- **`VoiceChatProvider`** — WebRTC initialization wrapper (must wrap your app)
- **`VoxeraNativeClient`** — imperative client for advanced/non-hook usage
- **Native WebRTC** — real-time audio/video via `react-native-webrtc`
- **Multi-Room Meetings** — create/join rooms with participant tracking
- **Host Controls** — mute, remove, lock, transfer host, waiting room
- **AI Meeting Tools** — transcription, transcribe-only mode, Ask AI, summaries, minutes, bookmarks
- **Video & Screen Share** — local/remote video streams, screen sharing

## `VoiceChatProvider`

**Required wrapper** — initializes `react-native-webrtc` globals before rendering children.

```tsx
import { VoiceChatProvider } from '@voxera/sdk-react-native';

export default function App() {
  return (
    <VoiceChatProvider>
      {/* Your app */}
    </VoiceChatProvider>
  );
}
```

## `useVoxeraChat` Hook

### Configuration

```typescript
useVoxeraChat({
  appKey: string;          // Required
  serverUrl: string;       // Required
  autoConnect?: boolean;   // Connect on mount
  autoStart?: boolean;     // Start conversation on connect
  configurationId?: string;
  chatConfig?: { systemPrompt?, aiProvider?, model?, temperature? };
  voiceConfig?: { voiceId?, voiceProvider?, language? };
  videoConfig?: { enabled?, width?, height? };
  // Callbacks
  onConnectionStatusChange?: (status) => void;
  onConversationStatusChange?: (status) => void;
  onSpeakingStatusChange?: (status) => void;
  onMessage?: (message) => void;
  onTranscript?: (transcript) => void;
  onError?: (error) => void;
  onAudioLevel?: (level) => void;
  onLocalVideoStream?: (stream) => void;
  onRemoteStream?: (stream) => void;
  onRemoteVideoStream?: (stream) => void;
  meetingCallbacks?: MeetingCallbacks;
});
```

### Returned State

| Property | Type | Description |
|----------|------|-------------|
| `connectionStatus` | `ConnectionStatus` | `'idle'` \| `'connecting'` \| `'connected'` \| `'disconnected'` \| `'error'` |
| `conversationStatus` | `ConversationStatus` | `'idle'` \| `'starting'` \| `'active'` \| `'ending'` \| `'ended'` |
| `conversationMessages` | `ConversationMessage[]` | All messages |
| `currentTranscript` | `string` | In-progress speech |
| `audioLevel` / `aiAudioLevel` | `number` | Mic / AI audio levels |
| `isConnected` / `isConnecting` | `boolean` | Connection state |
| `isConversationActive` | `boolean` | Conversation state |
| `isUserSpeaking` / `isAISpeaking` | `boolean` | Speaking state |
| `isMuted` / `isListenMode` | `boolean` | Audio mode |
| `isVideoEnabled` / `isScreenSharing` | `boolean` | Video state |
| `error` | `VoxeraError \| null` | Last error |

### Video Streams

| Property | Type | Description |
|----------|------|-------------|
| `localVideoStream` | `RNMediaStream` | Local camera stream |
| `remoteStream` | `RNMediaStream` | Remote audio stream |
| `remoteVideoStream` | `RNMediaStream` | Remote video stream |
| `localScreenStream` | `RNMediaStream` | Screen share stream |

### Core Actions

| Method | Description |
|--------|-------------|
| `connect()` | Connect to server |
| `connectSocket()` | Connect socket only (no WebRTC) |
| `setupRoomWebRTC()` | Set up WebRTC for room |
| `disconnect()` | Disconnect |
| `startConversation()` | Start voice conversation |
| `endConversation()` | End conversation |
| `sendMessage(content)` | Send text message |
| `setMuted(muted)` | Mute/unmute mic |
| `setListenMode(mode)` | Set listen mode |
| `toggleListenMode()` | Toggle listen mode |
| `updateConfig(partial)` | Update config |
| `getStats()` | Get WebRTC stats |
| `clearError()` | Clear error state |

### Video & Screen Share

| Method | Description |
|--------|-------------|
| `enableVideo()` / `disableVideo()` / `toggleVideo()` | Camera control |
| `startScreenShare()` / `stopScreenShare()` / `toggleScreenShare()` | Screen sharing |

### Multi-Room

| Property/Method | Description |
|--------|-------------|
| `roomMode` | `'ai-meeting'` \| `'normal-meeting'` |
| `isHost` | Whether local user is host |
| `roomParticipants` | Participant list |
| `isRoomLocked` | Room lock state |
| `isWaitingRoomEnabled` | Waiting room state |
| `isInWaitingRoom` | Whether in waiting room |
| `waitingRoom` | Waiting room entries |

### Host Controls

```typescript
muteParticipant(targetClientId)
muteAll()
unmuteAll()
removeParticipant(targetClientId)
lockRoom(locked)
endMeeting()
transferHost(targetClientId)
enableWaitingRoom(enabled)
admitParticipant(targetClientId)
denyParticipant(targetClientId)
admitAll()
```

### Meeting Features

| Method/Property | Description |
|--------|-------------|
| `toggleTranscription(enabled)` | Toggle live transcription |
| `isTranscriptionEnabled` | Transcription state |
| `transcriptions` | Live transcription entries |
| `askAi()` / `cancelAskAi()` | Trigger/cancel AI |
| `askAiText(prompt?)` | Ask AI a text question |
| `askAiTextResponse` | AI text response |
| `isAskAiActive` / `isAskAiTextProcessing` | AI state |
| `generateSummary()` | Generate summary |
| `generateMinutes()` | Generate minutes |
| `addBookmark(label, isActionItem?)` | Add bookmark |
| `removeBookmark(bookmarkId)` | Remove bookmark |
| `getBookmarks()` | Get all bookmarks |
| `bookmarks` / `summaries` / `currentMinutes` | Meeting data |

## `VoxeraNativeClient`

For imperative or non-hook usage:

```typescript
import { VoxeraNativeClient } from '@voxera/sdk-react-native';

const client = new VoxeraNativeClient({
  appKey: 'your-key',
  serverUrl: 'wss://api.voxera.ai',
  onConnectionStatusChange: (status) => console.log(status),
  onMessage: (msg) => console.log(msg),
});

await client.connect();
await client.startConversation();
```

## Peer Dependencies

| Package | Version |
|---------|---------|
| `react` | `^18.2.0` |
| `react-native` | `>=0.70.0` |
| `react-native-webrtc` | `>=106.0.0` |

## TypeScript

All types are exported including core types from `@voxera/sdk-core`:

```typescript
import type {
  VoxeraNativeConfig,
  UseVoxeraChatConfig,
  UseVoxeraChatReturn,
  ConnectionStatus,
  ConversationMessage,
  RoomParticipant,
  TranscriptionEntry,
} from '@voxera/sdk-react-native';
```

## License

MIT
