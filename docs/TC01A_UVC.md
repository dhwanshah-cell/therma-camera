# Fluke iSee TC01A over USB Video Class

## What we know about the device

| Item | Value |
| --- | --- |
| Model | Fluke iSee TC01A |
| USB VID:PID | `0x0F7E:0x00BC` (observed on the connected camera) |
| Sensor | 256 × 192, 25 Hz, −10 °C … 550 °C measurement range (datasheet) |
| USB interfaces | Video Control (class 0x0E / subclass 0x01) + Video Streaming (0x0E / 0x02) |

The app **never** uses Camera2/CameraX for this device. It is opened through Android USB host.

## Detection → stream → image (the phase 2–5 path)

1. **Detection** (`UsbDeviceMonitor`, `UsbDeviceMatcher`): `device_filter.xml` matches the VID/PID and any
   UVC class device, so plugging the camera in launches/foregrounds the app. `UsbManager.deviceList` is
   scanned, the TC01A is preferred over other UVC devices, and the runtime USB permission is requested.
2. **Descriptor inspection** (`UvcDescriptorParser`, pure Kotlin, unit tested): `UsbDeviceConnection.rawDescriptors`
   is parsed into the VideoControl header/terminals/units and every VideoStreaming format + frame
   (uncompressed GUID/fourcc, bits per pixel, sizes, intervals, endpoint types). Nothing is assumed
   about the format; the dump is shown on the THERMAL → DIAGNOSTICS panel.
3. **Mode selection** (`UvcModeSelector`): scores every advertised frame. Preference: Y16 > Y8 > YUY2/UYVY >
   NV12/I420 > RGB > vendor uncompressed > MJPEG, at 256×192 (or 256×384 "stacked") first. Settings can
   force a format/frame index.
4. **Negotiation & streaming** (`robodog_uvc.cpp` → libusb + libuvc): the usbfs file descriptor from
   `UsbDeviceConnection` is wrapped with `libusb_wrap_sys_device` (no device discovery, as required on
   Android) and `uvc_wrap`. `uvc_probe_stream_ctrl` performs the VS_PROBE/COMMIT handshake with the exact
   format/frame/interval; `uvc_stream_start` uses bulk or isochronous transfers depending on the
   endpoint. Frames are pulled with `uvc_stream_get_frame` from a dedicated Kotlin thread.
   If a negotiated mode delivers no frames for 4 s the next candidate mode is tried (up to 5), which is
   the failure mode generic "USB camera" apps show as a permanent "Connecting…".
5. **Decoding** (`ThermalFrameProcessor`, `PixelConverters`): YUY2/UYVY luma + chroma, Y16, Y8, NV12, I420,
   RGB24 and MJPEG (BitmapFactory). Intensity (raw sensor value) is kept separately from any colour
   the camera already applied. A frame that is exactly twice the expected height is treated as
   "image on top, raw data below" (`FrameLayout.STACKED_IMAGE_RAW`): only the image half is shown; the
   lower half is kept verbatim for an opt-in decoder.
6. **Display** (`ThermalRenderer`, `ThermalView`): per-frame automatic gain with 0.5 % histogram clipping,
   palettes IRON / RAINBOW / WHITE HOT / BLACK HOT / LAVA / GRAYSCALE; CAMERA keeps the camera's own
   colours when the stream has chroma.

## Temperatures

The UVC stream is not guaranteed to carry calibrated temperatures, and their encoding differs between
modules. Therefore:

* Default: **no decoder**. The UI shows "Thermal image available / Radiometric temperature unavailable",
  capture metadata stores `radiometric=false` and null temperatures, hotspot alerts are labelled
  "Thermal intensity hotspot".
* Settings → Thermal camera lets you enable an experimental decoder once the frame layout is known:
  * *Stacked frame, raw16 = K×64*: lower half of a 256×384 frame, °C = value/64 − 273.15 (a convention used by
    several 256×192 modules).
  * *Y16 = centi-Kelvin* or *Y16 = K×64* for 16-bit single-channel streams.
  Each decoder rejects implausible results (outside −60…700 °C). Verify against a reference thermometer
  before relying on them.

## Reporting the real descriptors

With the camera plugged in: THERMAL → DIAGNOSTICS, copy the text (or `adb logcat -s RoboDogUVC UvcCamera`).
The relevant lines look like:

```
VideoStreaming IF 1: endpoint=81 formats=1
  Format 1 UNCOMPRESSED fourcc='YUY2' guid=32595559-0000-0010-8000-00aa00389b71 bpp=16 default=1
    Frame 1 256x384 default=400000 (25.0 fps) maxBuf=196608 fps=[25.0]
Trying mode 1/2: fmt=1(YUY2) frame=1 256x384 @ 25.0 fps
Stream started: bulk, maxFrame=196608, payload=...
```

From this the correct layout/decoder can be confirmed and made the default.

## Files

* `mobile/app/src/main/cpp/robodog_uvc.cpp` — JNI bridge
* `mobile/app/src/main/cpp/libusb`, `libuvc` — vendored upstream sources (LGPL-2.1 / BSD-3), Linux usbfs backend, no libjpeg
* `mobile/app/src/main/java/com/robodog/app/thermal/**`
