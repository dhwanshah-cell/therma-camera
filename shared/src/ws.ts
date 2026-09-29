import type { Alert, Mission, RobotStatus, SensorReading, ThermalImage, RgbImage, VideoRecording, ThermalMap } from './types.js';

/**
 * WebSocket protocol at /ws.
 *
 * Text frames carry JSON `WsMessage` objects.
 * Binary frames carry live camera frames with a small JSON header:
 *   [0..3]  uint32 big-endian header length N
 *   [4..4+N) UTF-8 JSON `LiveFrameHeader`
 *   [4+N..]  JPEG bytes
 * The phone sends binary frames; the server relays them to every web client subscribed to that channel.
 */

export type WsRole = 'phone' | 'web' | 'robot';

export interface LiveFrameHeader {
  channel: 'thermal' | 'rgb';
  timestamp: string;
  frameId: string;
  width: number;
  height: number;
  /** Thermal only. */
  palette?: string;
  /** Thermal only, present only when a radiometric decode produced them. */
  centerTemperature?: number | null;
  minTemperature?: number | null;
  maxTemperature?: number | null;
  radiometric?: boolean;
  source: 'REAL' | 'SIMULATION';
}

export type WsClientMessage =
  | { type: 'hello'; role: WsRole; deviceId: string; version?: string }
  | { type: 'subscribe'; channels: LiveFrameHeader['channel'][] }
  | { type: 'unsubscribe'; channels: LiveFrameHeader['channel'][] }
  | { type: 'ping'; t: number }
  | { type: 'sensor'; reading: SensorReading }
  | { type: 'alert'; alert: Alert }
  | { type: 'robot'; status: RobotStatus }
  | { type: 'mission'; mission: Mission }
  /** Web -> server -> phone: request the phone to capture a thermal image now. */
  | { type: 'command'; command: 'capture_thermal' | 'capture_rgb' | 'start_recording' | 'stop_recording'; requestId: string };

export type WsServerMessage =
  | { type: 'welcome'; serverTime: string; simulation: boolean; clientId: string }
  | { type: 'pong'; t: number }
  | { type: 'sensor'; reading: SensorReading }
  | { type: 'alert'; alert: Alert }
  | { type: 'robot'; status: RobotStatus }
  | { type: 'mission'; mission: Mission }
  | { type: 'media'; mediaType: 'THERMAL_IMAGE'; item: ThermalImage }
  | { type: 'media'; mediaType: 'RGB_IMAGE'; item: RgbImage }
  | { type: 'media'; mediaType: 'VIDEO'; item: VideoRecording }
  | { type: 'media'; mediaType: 'THERMAL_MAP'; item: ThermalMap }
  | { type: 'presence'; phoneConnected: boolean; webClients: number; lastPhoneSeen: string | null }
  | { type: 'command'; command: 'capture_thermal' | 'capture_rgb' | 'start_recording' | 'stop_recording'; requestId: string }
  | { type: 'error'; message: string };

export type WsMessage = WsClientMessage | WsServerMessage;

export function encodeLiveFrame(header: LiveFrameHeader, jpeg: Uint8Array): Uint8Array {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(4 + headerBytes.length + jpeg.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, headerBytes.length, false);
  out.set(headerBytes, 4);
  out.set(jpeg, 4 + headerBytes.length);
  return out;
}

export function decodeLiveFrame(data: Uint8Array): { header: LiveFrameHeader; jpeg: Uint8Array } | null {
  if (data.length < 4) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const n = view.getUint32(0, false);
  if (4 + n > data.length) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(data.subarray(4, 4 + n))) as LiveFrameHeader;
    return { header, jpeg: data.subarray(4 + n) };
  } catch {
    return null;
  }
}
