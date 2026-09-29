// RoboDog native UVC bridge.
//
// Android hands the app an open usbfs file descriptor for the Fluke TC01A
// (UsbDeviceConnection.getFileDescriptor()). We wrap that descriptor with
// libusb (LIBUSB_OPTION_NO_DEVICE_DISCOVERY) and drive the camera with libuvc.
// Frames are pulled synchronously from a Kotlin thread via nativeGetFrame so
// no JNI callbacks run on libusb's event thread.
//
// Every function returns negative libuvc/libusb error codes on failure; the
// Kotlin side maps them with nativeStrError.

#include <jni.h>
#include <android/log.h>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <cerrno>
#include <deque>
#include <mutex>
#include <unordered_map>
#include <string>
#include <vector>

extern "C" {
#include "libusb.h"
#include "libuvc/libuvc.h"
#include "libuvc/libuvc_internal.h"
}

#define LOG_TAG "RoboDogUVC"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {

// Ring buffer of libusb log lines so the app can show *why* something failed.
std::mutex g_logMutex;
std::deque<std::string> g_log;
void pushLog(const std::string& line) {
    std::lock_guard<std::mutex> lock(g_logMutex);
    g_log.push_back(line);
    while (g_log.size() > 60) g_log.pop_front();
}
void LIBUSB_CALL libusbLogCb(libusb_context*, enum libusb_log_level level, const char* str) {
    const char* lv = level == LIBUSB_LOG_LEVEL_ERROR ? "E" : level == LIBUSB_LOG_LEVEL_WARNING ? "W" : level == LIBUSB_LOG_LEVEL_INFO ? "I" : "D";
    std::string line = std::string("libusb ") + lv + ": " + (str ? str : "");
    while (!line.empty() && (line.back() == '\n' || line.back() == '\r')) line.pop_back();
    pushLog(line);
    __android_log_print(level == LIBUSB_LOG_LEVEL_ERROR ? ANDROID_LOG_ERROR : ANDROID_LOG_INFO, LOG_TAG, "%s", line.c_str());
}
std::string drainLog() {
    std::lock_guard<std::mutex> lock(g_logMutex);
    std::string out;
    for (auto& l : g_log) { out += l; out += '\n'; }
    g_log.clear();
    return out;
}
bool g_logInstalled = false;

// Handle registry. Android (arm64, Android 11+) tags heap pointers in the top byte, which makes a
// pointer cast to jlong negative; the Java side therefore never sees pointers, only ids >= 1.
std::mutex g_handleMutex;
std::unordered_map<jlong, void*> g_handles;
jlong g_nextHandle = 1;
jlong registerHandle(void* p) {
    std::lock_guard<std::mutex> lock(g_handleMutex);
    jlong id = g_nextHandle++;
    g_handles[id] = p;
    return id;
}
template <typename T> T* lookupHandle(jlong id) {
    std::lock_guard<std::mutex> lock(g_handleMutex);
    auto it = g_handles.find(id);
    return it == g_handles.end() ? nullptr : static_cast<T*>(it->second);
}
void releaseHandle(jlong id) {
    std::lock_guard<std::mutex> lock(g_handleMutex);
    g_handles.erase(id);
}

struct UvcContext {
    libusb_context* usb = nullptr;
    uvc_context_t* uvc = nullptr;
};

struct UvcDevice {
    UvcContext* ctx = nullptr;
    uvc_device_handle_t* devh = nullptr;
    int fd = -1;
};

struct UvcStream {
    UvcDevice* dev = nullptr;
    uvc_stream_handle_t* strmh = nullptr;
    uvc_stream_ctrl_t ctrl{};
    bool isochronous = false;
    std::mutex mutex;
};

std::string jsonEscape(const std::string& in) {
    std::string out;
    for (char c : in) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char buf[8];
                    snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += c;
                }
        }
    }
    return out;
}

std::string guidToString(const uint8_t guid[16]) {
    char buf[64];
    snprintf(buf, sizeof(buf),
             "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
             guid[3], guid[2], guid[1], guid[0], guid[5], guid[4], guid[7], guid[6],
             guid[8], guid[9], guid[10], guid[11], guid[12], guid[13], guid[14], guid[15]);
    return buf;
}

std::string fourccToString(const uint8_t guid[16]) {
    std::string s;
    for (int i = 0; i < 4; i++) {
        char c = static_cast<char>(guid[i]);
        s += (c >= 0x20 && c < 0x7f) ? c : '?';
    }
    return s;
}

const char* subtypeName(enum uvc_vs_desc_subtype t) {
    switch (t) {
        case UVC_VS_FORMAT_UNCOMPRESSED: return "UNCOMPRESSED";
        case UVC_VS_FORMAT_MJPEG: return "MJPEG";
        case UVC_VS_FORMAT_FRAME_BASED: return "FRAME_BASED";
        case UVC_VS_FORMAT_MPEG2TS: return "MPEG2TS";
        case UVC_VS_FORMAT_DV: return "DV";
        case UVC_VS_FORMAT_STREAM_BASED: return "STREAM_BASED";
        default: return "OTHER";
    }
}

const char* frameFormatName(enum uvc_frame_format f) {
    switch (f) {
        case UVC_FRAME_FORMAT_YUYV: return "YUYV";
        case UVC_FRAME_FORMAT_UYVY: return "UYVY";
        case UVC_FRAME_FORMAT_RGB: return "RGB";
        case UVC_FRAME_FORMAT_BGR: return "BGR";
        case UVC_FRAME_FORMAT_MJPEG: return "MJPEG";
        case UVC_FRAME_FORMAT_H264: return "H264";
        case UVC_FRAME_FORMAT_GRAY8: return "GRAY8";
        case UVC_FRAME_FORMAT_GRAY16: return "GRAY16";
        case UVC_FRAME_FORMAT_NV12: return "NV12";
        case UVC_FRAME_FORMAT_NV21: return "NV21";
        case UVC_FRAME_FORMAT_I420: return "I420";
        case UVC_FRAME_FORMAT_P010: return "P010";
        case UVC_FRAME_FORMAT_UNCOMPRESSED: return "UNCOMPRESSED";
        case UVC_FRAME_FORMAT_COMPRESSED: return "COMPRESSED";
        default: return "UNKNOWN";
    }
}

jstring toJString(JNIEnv* env, const std::string& s) { return env->NewStringUTF(s.c_str()); }

}  // namespace

extern "C" {

// ---- context ---------------------------------------------------------------

JNIEXPORT jlong JNICALL
Java_com_robodog_app_thermal_uvc_NativeUvc_nativeInit(JNIEnv*, jobject) {
    auto* ctx = new UvcContext();
    if (!g_logInstalled) {
        libusb_set_option(nullptr, LIBUSB_OPTION_LOG_CB, libusbLogCb);
        libusb_set_option(nullptr, LIBUSB_OPTION_LOG_LEVEL, LIBUSB_LOG_LEVEL_DEBUG);
        g_logInstalled = true;
    }
    // Android: we must not scan /dev/bus/usb (no permission); use the fd handed by Java.
    int so = libusb_set_option(nullptr, LIBUSB_OPTION_NO_DEVICE_DISCOVERY);
    pushLog(std::string("set_option(NO_DEVICE_DISCOVERY) = ") + std::to_string(so));
    errno = 0;
    int r = libusb_init(&ctx->usb);
    if (r != LIBUSB_SUCCESS) {
        pushLog(std::string("libusb_init failed: ") + libusb_strerror(r) + " (" + std::to_string(r) + "), errno=" + std::to_string(errno));
        // Retry with the option passed explicitly to the context constructor.
        struct libusb_init_option opts[1];
        opts[0].option = LIBUSB_OPTION_NO_DEVICE_DISCOVERY;
        opts[0].value.ival = 1;
        errno = 0;
        r = libusb_init_context(&ctx->usb, opts, 1);
        pushLog(std::string("libusb_init_context retry = ") + std::to_string(r) + ", errno=" + std::to_string(errno));
    }
    if (r != LIBUSB_SUCCESS) {
        LOGE("libusb_init failed: %s", libusb_strerror(r));
        delete ctx;
        return static_cast<jlong>(r);
    }
    libusb_set_option(ctx->usb, LIBUSB_OPTION_LOG_LEVEL, LIBUSB_LOG_LEVEL_INFO);
    uvc_error_t ur = uvc_init(&ctx->uvc, ctx->usb);
    if (ur != UVC_SUCCESS) {
        LOGE("uvc_init failed: %s", uvc_strerror(ur));
        libusb_exit(ctx->usb);
        delete ctx;
        return static_cast<jlong>(ur);
    }
    LOGI("libusb %d.%d.%d / libuvc initialised", libusb_get_version()->major,
         libusb_get_version()->minor, libusb_get_version()->micro);
    return registerHandle(ctx);
}

JNIEXPORT void JNICALL
Java_com_robodog_app_thermal_uvc_NativeUvc_nativeExit(JNIEnv*, jobject, jlong handle) {
    auto* ctx = lookupHandle<UvcContext>(handle);
    if (!ctx) return;
    releaseHandle(handle);
    if (ctx->uvc) uvc_exit(ctx->uvc);
    // uvc_exit does not free a caller-provided libusb context.
    if (ctx->usb) libusb_exit(ctx->usb);
    delete ctx;
}

// ---- device ----------------------------------------------------------------

JNIEXPORT jlong JNICALL
Java_com_robodog_app_thermal_uvc_NativeUvc_nativeOpen(JNIEnv*, jobject, jlong ctxHandle, jint fd) {
    auto* ctx = lookupHandle<UvcContext>(ctxHandle);
    if (!ctx || fd < 0) return static_cast<jlong>(UVC_ERROR_INVALID_PARAM);
    auto* dev = new UvcDevice();
    dev->ctx = ctx;
    dev->fd = fd;
    errno = 0;
    uvc_error_t r = uvc_wrap(fd, ctx->uvc, &dev->devh);
    if (r != UVC_SUCCESS) {
        pushLog(std::string("uvc_wrap failed: ") + uvc_strerror(r) + " (" + std::to_string(r) + "), errno=" + std::to_string(errno));
        LOGE("uvc_wrap(fd=%d) failed: %s (%d)", fd, uvc_strerror(r), r);
        delete dev;
        return static_cast<jlong>(r);
    }
    LOGI("uvc device opened on fd %d, control interface %d", fd, dev->devh->info->ctrl_if.bInterfaceNumber);
    pushLog("uvc device opened, control interface " + std::to_string(dev->devh->info->ctrl_if.bInterfaceNumber));
    return registerHandle(dev);
}

JNIEXPORT void JNICALL
Java_com_robodog_app_thermal_uvc_NativeUvc_nativeClose(JNIEnv*, jobject, jlong devHandle) {
    auto* dev = lookupHandle<UvcDevice>(devHandle);
    if (!dev) return;
    releaseHandle(devHandle);
    if (dev->devh) uvc_close(dev->devh);
    delete dev;
}

/** JSON description of the device's UVC control interface and every streaming format/frame. */
JNIEXPORT jstring JNICALL
Java_com_robodog_app_thermal_uvc_NativeUvc_nativeDescribe(JNIEnv* env, jobject, jlong devHandle) {
    auto* dev = lookupHandle<UvcDevice>(devHandle);
    if (!dev || !dev->devh) return toJString(env, "{\"error\":\"no device\"}");
    uvc_device_handle_t* devh = dev->devh;
    std::string j = "{";
    char buf[128];
    snprintf(buf, sizeof(buf), "\"bcdUVC\":%u,\"controlInterface\":%u,\"clockFrequency\":%u,",
             devh->info->ctrl_if.bcdUVC, devh->info->ctrl_if.bInterfaceNumber,
             devh->info->ctrl_if.dwClockFrequency);
    j += buf;

    const uvc_input_terminal_t* cam = uvc_get_camera_terminal(devh);
    if (cam) {
        snprintf(buf, sizeof(buf), "\"cameraTerminal\":{\"id\":%u,\"controls\":%llu},", cam->bTerminalID,
                 static_cast<unsigned long long>(cam->bmControls));
        j += buf;
    }
    const uvc_processing_unit_t* pu = uvc_get_processing_units(devh);
    j += "\"processingUnits\":[";
    bool first = true;
    for (; pu; pu = pu->next) {
        snprintf(buf, sizeof(buf), "%s{\"id\":%u,\"controls\":%llu}", first ? "" : ",", pu->bUnitID,
                 static_cast<unsigned long long>(pu->bmControls));
        j += buf;
        first = false;
    }
    j += "],\"extensionUnits\":[";
    first = true;
    for (const uvc_extension_unit_t* xu = uvc_get_extension_units(devh); xu; xu = xu->next) {
        snprintf(buf, sizeof(buf), "%s{\"id\":%u,\"guid\":\"%s\",\"controls\":%llu}", first ? "" : ",",
                 xu->bUnitID, guidToString(xu->guidExtensionCode).c_str(),
                 static_cast<unsigned long long>(xu->bmControls));
        j += buf;
        first = false;
    }
    j += "],\"streamInterfaces\":[";
    bool firstIf = true;
    for (uvc_streaming_interface_t* sif = devh->info->stream_ifs; sif; sif = sif->next) {
        snprintf(buf, sizeof(buf), "%s{\"interface\":%u,\"endpoint\":%u,\"formats\":[", firstIf ? "" : ",",
                 sif->bInterfaceNumber, sif->bEndpointAddress);
        j += buf;
        firstIf = false;
        bool firstFmt = true;
        for (uvc_format_desc_t* fmt = sif->format_descs; fmt; fmt = fmt->next) {
            enum uvc_frame_format ff = uvc_frame_format_for_guid(fmt->guidFormat);
            const bool isMjpeg = fmt->bDescriptorSubtype == UVC_VS_FORMAT_MJPEG;
            if (isMjpeg) ff = UVC_FRAME_FORMAT_MJPEG;
            snprintf(buf, sizeof(buf),
                     "%s{\"formatIndex\":%u,\"subtype\":\"%s\",\"guid\":\"%s\",\"fourcc\":\"%s\","
                     "\"bitsPerPixel\":%u,\"frameFormat\":\"%s\",\"defaultFrameIndex\":%u,\"frames\":[",
                     firstFmt ? "" : ",", fmt->bFormatIndex, subtypeName(fmt->bDescriptorSubtype),
                     guidToString(fmt->guidFormat).c_str(), jsonEscape(fourccToString(fmt->guidFormat)).c_str(),
                     isMjpeg ? 0 : fmt->bBitsPerPixel, frameFormatName(ff), fmt->bDefaultFrameIndex);
            j += buf;
            firstFmt = false;
            bool firstFrame = true;
            for (uvc_frame_desc_t* fr = fmt->frame_descs; fr; fr = fr->next) {
                snprintf(buf, sizeof(buf),
                         "%s{\"frameIndex\":%u,\"width\":%u,\"height\":%u,\"defaultInterval\":%u,"
                         "\"maxFrameBufferSize\":%u,\"intervals\":[",
                         firstFrame ? "" : ",", fr->bFrameIndex, fr->wWidth, fr->wHeight,
                         fr->dwDefaultFrameInterval, fr->dwMaxVideoFrameBufferSize);
                j += buf;
                firstFrame = false;
                if (fr->intervals) {
                    bool firstIv = true;
                    for (uint32_t* iv = fr->intervals; *iv; ++iv) {
                        snprintf(buf, sizeof(buf), "%s%u", firstIv ? "" : ",", *iv);
                        j += buf;
                        firstIv = false;
                    }
                } else if (fr->dwMinFrameInterval) {
                    snprintf(buf, sizeof(buf), "%u,%u", fr->dwMinFrameInterval, fr->dwMaxFrameInterval);
                    j += buf;
                }
                j += "]}";
            }
            j += "]}";
        }
        j += "]}";
    }
    j += "]}";
    return toJString(env, j);
}

// ---- streaming -------------------------------------------------------------

/**
 * Negotiate and start a stream. Returns a stream handle (>0) or a negative error.
 * intervalUnits is the frame interval in 100 ns units (0 = camera default).
 */
JNIEXPORT jlong JNICALL
Java_com_robodog_app_thermal_uvc_NativeUvc_nativeStartStream(JNIEnv*, jobject, jlong devHandle,
                                                            jint formatIndex, jint frameIndex,
                                                            jint intervalUnits) {
    auto* dev = lookupHandle<UvcDevice>(devHandle);
    if (!dev || !dev->devh) return static_cast<jlong>(UVC_ERROR_INVALID_PARAM);
    uvc_device_handle_t* devh = dev->devh;

    // Locate the streaming interface that owns this format so bInterfaceNumber is correct.
    uvc_streaming_interface_t* owner = nullptr;
    uvc_format_desc_t* fmtDesc = nullptr;
    uvc_frame_desc_t* frameDesc = nullptr;
    for (uvc_streaming_interface_t* sif = devh->info->stream_ifs; sif && !owner; sif = sif->next) {
        for (uvc_format_desc_t* fmt = sif->format_descs; fmt; fmt = fmt->next) {
            if (fmt->bFormatIndex != formatIndex) continue;
            for (uvc_frame_desc_t* fr = fmt->frame_descs; fr; fr = fr->next) {
                if (fr->bFrameIndex == frameIndex) {
                    owner = sif;
                    fmtDesc = fmt;
                    frameDesc = fr;
                    break;
                }
            }
            if (owner) break;
        }
    }
    if (!owner || !fmtDesc || !frameDesc) {
        LOGE("format %d / frame %d not found in descriptors", formatIndex, frameIndex);
        return static_cast<jlong>(UVC_ERROR_INVALID_MODE);
    }

    auto* stream = new UvcStream();
    stream->dev = dev;
    memset(&stream->ctrl, 0, sizeof(stream->ctrl));
    stream->ctrl.bmHint = 1;  // dwFrameInterval is fixed
    stream->ctrl.bFormatIndex = static_cast<uint8_t>(formatIndex);
    stream->ctrl.bFrameIndex = static_cast<uint8_t>(frameIndex);
    stream->ctrl.dwFrameInterval = intervalUnits > 0 ? static_cast<uint32_t>(intervalUnits)
                                                     : frameDesc->dwDefaultFrameInterval;
    if (stream->ctrl.dwFrameInterval == 0 && frameDesc->intervals && frameDesc->intervals[0]) {
        stream->ctrl.dwFrameInterval = frameDesc->intervals[0];
    }
    stream->ctrl.bInterfaceNumber = owner->bInterfaceNumber;

    LOGI("probing format %d frame %d (%ux%u) interval %u on interface %u", formatIndex, frameIndex,
         frameDesc->wWidth, frameDesc->wHeight, stream->ctrl.dwFrameInterval, owner->bInterfaceNumber);
    pushLog("probing format " + std::to_string(formatIndex) + " frame " + std::to_string(frameIndex) + " (" + std::to_string(frameDesc->wWidth) + "x" + std::to_string(frameDesc->wHeight) + ") interval " + std::to_string(stream->ctrl.dwFrameInterval));
    uvc_error_t r = uvc_probe_stream_ctrl(devh, &stream->ctrl);
    if (r != UVC_SUCCESS) {
        pushLog(std::string("uvc_probe_stream_ctrl failed: ") + uvc_strerror(r) + " (" + std::to_string(r) + ")");
        LOGE("uvc_probe_stream_ctrl failed: %s (%d)", uvc_strerror(r), r);
        delete stream;
        return static_cast<jlong>(r);
    }
    LOGI("negotiated: maxVideoFrameSize=%u maxPayloadTransferSize=%u interval=%u",
         stream->ctrl.dwMaxVideoFrameSize, stream->ctrl.dwMaxPayloadTransferSize, stream->ctrl.dwFrameInterval);

    r = uvc_stream_open_ctrl(devh, &stream->strmh, &stream->ctrl);
    if (r != UVC_SUCCESS) {
        pushLog(std::string("uvc_stream_open_ctrl failed: ") + uvc_strerror(r) + " (" + std::to_string(r) + ")");
        LOGE("uvc_stream_open_ctrl failed: %s (%d)", uvc_strerror(r), r);
        delete stream;
        return static_cast<jlong>(r);
    }

    // Polling mode: no callback, frames are fetched with uvc_stream_get_frame.
    r = uvc_stream_start(stream->strmh, nullptr, nullptr, 0);
    if (r != UVC_SUCCESS) {
        pushLog(std::string("uvc_stream_start failed: ") + uvc_strerror(r) + " (" + std::to_string(r) + ")");
        LOGE("uvc_stream_start failed: %s (%d)", uvc_strerror(r), r);
        uvc_stream_close(stream->strmh);
        delete stream;
        return static_cast<jlong>(r);
    }
    const struct libusb_interface* iface = &devh->info->config->interface[owner->bInterfaceNumber];
    stream->isochronous = iface->num_altsetting > 1;
    LOGI("stream started (%s transfers)", stream->isochronous ? "isochronous" : "bulk");
    pushLog(std::string("stream started, ") + (stream->isochronous ? "isochronous" : "bulk") + " transfers, maxVideoFrameSize=" + std::to_string(stream->ctrl.dwMaxVideoFrameSize) + " maxPayload=" + std::to_string(stream->ctrl.dwMaxPayloadTransferSize));
    return registerHandle(stream);
}

/** JSON with the negotiated stream parameters. */
JNIEXPORT jstring JNICALL
Java_com_robodog_app_thermal_uvc_NativeUvc_nativeStreamInfo(JNIEnv* env, jobject, jlong streamHandle) {
    auto* s = lookupHandle<UvcStream>(streamHandle);
    if (!s) return toJString(env, "{}");
    char buf[512];
    snprintf(buf, sizeof(buf),
             "{\"formatIndex\":%u,\"frameIndex\":%u,\"frameInterval\":%u,\"maxVideoFrameSize\":%u,"
             "\"maxPayloadTransferSize\":%u,\"interface\":%u,\"isochronous\":%s,\"frameFormat\":\"%s\"}",
             s->ctrl.bFormatIndex, s->ctrl.bFrameIndex, s->ctrl.dwFrameInterval, s->ctrl.dwMaxVideoFrameSize,
             s->ctrl.dwMaxPayloadTransferSize, s->ctrl.bInterfaceNumber, s->isochronous ? "true" : "false",
             s->strmh ? frameFormatName(s->strmh->frame_format) : "UNKNOWN");
    return toJString(env, buf);
}

/**
 * Wait for the next frame and copy it into `out` (a direct ByteBuffer).
 * `info` receives [width, height, frameFormatOrdinal, sequence, step, dataBytes].
 * Returns bytes copied (>0), 0 on timeout, or a negative error.
 */
JNIEXPORT jint JNICALL
Java_com_robodog_app_thermal_uvc_NativeUvc_nativeGetFrame(JNIEnv* env, jobject, jlong streamHandle,
                                                         jobject out, jintArray info, jint timeoutUs) {
    auto* s = lookupHandle<UvcStream>(streamHandle);
    if (!s || !s->strmh) return UVC_ERROR_INVALID_PARAM;
    std::lock_guard<std::mutex> lock(s->mutex);
    if (!s->strmh) return UVC_ERROR_INVALID_PARAM;

    uvc_frame_t* frame = nullptr;
    uvc_error_t r = uvc_stream_get_frame(s->strmh, &frame, timeoutUs);
    if (r == UVC_ERROR_TIMEOUT) return 0;
    if (r != UVC_SUCCESS) return r;
    if (!frame || !frame->data || frame->data_bytes == 0) return 0;

    auto* dst = static_cast<uint8_t*>(env->GetDirectBufferAddress(out));
    const jlong cap = env->GetDirectBufferCapacity(out);
    if (!dst || cap <= 0) return UVC_ERROR_NO_MEM;
    const size_t n = frame->data_bytes < static_cast<size_t>(cap) ? frame->data_bytes : static_cast<size_t>(cap);
    memcpy(dst, frame->data, n);

    jint vals[6] = {static_cast<jint>(frame->width), static_cast<jint>(frame->height),
                    static_cast<jint>(frame->frame_format), static_cast<jint>(frame->sequence),
                    static_cast<jint>(frame->step), static_cast<jint>(frame->data_bytes)};
    env->SetIntArrayRegion(info, 0, 6, vals);
    return static_cast<jint>(n);
}

JNIEXPORT void JNICALL
Java_com_robodog_app_thermal_uvc_NativeUvc_nativeStopStream(JNIEnv*, jobject, jlong streamHandle) {
    auto* s = lookupHandle<UvcStream>(streamHandle);
    if (!s) return;
    releaseHandle(streamHandle);
    {
        std::lock_guard<std::mutex> lock(s->mutex);
        if (s->strmh) {
            uvc_stream_stop(s->strmh);
            uvc_stream_close(s->strmh);
            s->strmh = nullptr;
        }
    }
    delete s;
}

JNIEXPORT jstring JNICALL
Java_com_robodog_app_thermal_uvc_NativeUvc_nativeStrError(JNIEnv* env, jobject, jint code) {
    return toJString(env, uvc_strerror(static_cast<uvc_error_t>(code)));
}

/** Returns and clears the captured libusb/driver log lines (newline separated). */
JNIEXPORT jstring JNICALL
Java_com_robodog_app_thermal_uvc_NativeUvc_nativeLastLog(JNIEnv* env, jobject) {
    return toJString(env, drainLog());
}

JNIEXPORT jstring JNICALL
Java_com_robodog_app_thermal_uvc_NativeUvc_nativeVersion(JNIEnv* env, jobject) {
    char buf[96];
    const libusb_version* v = libusb_get_version();
    snprintf(buf, sizeof(buf), "libusb %d.%d.%d, libuvc %s", v->major, v->minor, v->micro, LIBUVC_VERSION_STR);
    return toJString(env, buf);
}

}  // extern "C"
