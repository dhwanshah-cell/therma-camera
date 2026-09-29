import { beforeEach, describe, expect, it } from 'vitest';
import { encodeLiveFrame, type LiveFrameHeader } from '@robodog/shared';
import { handleBinaryFrame, handleServerMessage } from './ws';
import { useLiveFramesStore } from '../store/liveFrames';
import { useConnectionStore } from '../store/connection';
import { useSensorsStore } from '../store/sensors';

describe('ws client live frame decoding', () => {
  beforeEach(() => {
    useLiveFramesStore.getState().clear();
  });

  it('decodes an encoded live frame with decodeLiveFrame and stores it', () => {
    const header: LiveFrameHeader = {
      channel: 'thermal',
      timestamp: '2026-09-29T12:00:00.000Z',
      frameId: 'frame-1',
      width: 256,
      height: 192,
      palette: 'IRON',
      radiometric: false,
      source: 'SIMULATION',
    };
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
    const encoded = encodeLiveFrame(header, jpeg);

    expect(handleBinaryFrame(encoded, 1000)).toBe(true);

    const frame = useLiveFramesStore.getState().frames.thermal;
    expect(frame).not.toBeNull();
    expect(frame?.header).toEqual(header);
    expect(Array.from(frame?.jpeg ?? [])).toEqual(Array.from(jpeg));
    expect(frame?.receivedAt).toBe(1000);
    expect(frame?.seq).toBe(1);
    expect(useLiveFramesStore.getState().frames.rgb).toBeNull();
  });

  it('rejects malformed binary data without touching the store', () => {
    expect(handleBinaryFrame(new Uint8Array([0, 0]))).toBe(false);
    expect(handleBinaryFrame(new Uint8Array([0, 0, 0, 50, 1, 2]))).toBe(false);
    expect(useLiveFramesStore.getState().frames.thermal).toBeNull();
  });

  it('routes JSON messages into stores', () => {
    handleServerMessage({ type: 'welcome', serverTime: '2026-09-29T12:00:00Z', simulation: true, clientId: 'c1' });
    expect(useConnectionStore.getState().simulation).toBe(true);
    handleServerMessage({ type: 'presence', phoneConnected: true, webClients: 2, lastPhoneSeen: null });
    expect(useConnectionStore.getState().presence?.phoneConnected).toBe(true);
    handleServerMessage({
      type: 'sensor',
      reading: {
        id: 'r1',
        timestamp: '2026-09-29T12:00:01Z',
        missionId: null,
        source: 'REAL',
        temperatureC: null,
        humidityPct: 40,
        gasRaw: 300,
        gasAlert: false,
        position: null,
      },
    });
    expect(useSensorsStore.getState().latest?.id).toBe('r1');
    expect(useSensorsStore.getState().latest?.temperatureC).toBeNull();
  });
});
