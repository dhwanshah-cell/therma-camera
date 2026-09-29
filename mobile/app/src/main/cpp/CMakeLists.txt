cmake_minimum_required(VERSION 3.22.1)
project(robodog_uvc C CXX)

# ---------------------------------------------------------------------------
# libusb (vendored subset, Linux usbfs backend). We never enumerate devices:
# Android hands us an already-open file descriptor from UsbDeviceConnection.
# ---------------------------------------------------------------------------
set(LIBUSB_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/libusb)
add_library(usb1 STATIC
    ${LIBUSB_ROOT}/libusb/core.c
    ${LIBUSB_ROOT}/libusb/descriptor.c
    ${LIBUSB_ROOT}/libusb/hotplug.c
    ${LIBUSB_ROOT}/libusb/io.c
    ${LIBUSB_ROOT}/libusb/sync.c
    ${LIBUSB_ROOT}/libusb/strerror.c
    ${LIBUSB_ROOT}/libusb/os/linux_usbfs.c
    ${LIBUSB_ROOT}/libusb/os/linux_netlink.c
    ${LIBUSB_ROOT}/libusb/os/events_posix.c
    ${LIBUSB_ROOT}/libusb/os/threads_posix.c)
target_include_directories(usb1
    PUBLIC ${LIBUSB_ROOT}/libusb
    PRIVATE ${LIBUSB_ROOT} ${LIBUSB_ROOT}/libusb/os)
target_compile_options(usb1 PRIVATE -fvisibility=hidden -pthread -Wno-unused-parameter)
target_link_libraries(usb1 PUBLIC log)

# ---------------------------------------------------------------------------
# libuvc (vendored subset, no libjpeg: MJPEG is decoded on the Kotlin side)
# ---------------------------------------------------------------------------
set(LIBUVC_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/libuvc)
add_library(uvc STATIC
    ${LIBUVC_ROOT}/src/ctrl.c
    ${LIBUVC_ROOT}/src/ctrl-gen.c
    ${LIBUVC_ROOT}/src/device.c
    ${LIBUVC_ROOT}/src/diag.c
    ${LIBUVC_ROOT}/src/frame.c
    ${LIBUVC_ROOT}/src/init.c
    ${LIBUVC_ROOT}/src/stream.c
    ${LIBUVC_ROOT}/src/misc.c)
target_include_directories(uvc PUBLIC ${LIBUVC_ROOT}/include)
target_compile_options(uvc PRIVATE -Wno-unused-parameter -Wno-unused-variable -Wno-unused-function)
target_link_libraries(uvc PUBLIC usb1 log)

# ---------------------------------------------------------------------------
# JNI bridge used by com.robodog.app.thermal.uvc.NativeUvc
# ---------------------------------------------------------------------------
add_library(robodog_uvc SHARED robodog_uvc.cpp)
target_include_directories(robodog_uvc PRIVATE ${LIBUVC_ROOT}/include ${LIBUSB_ROOT}/libusb)
target_compile_options(robodog_uvc PRIVATE -Wall -Wextra)
target_link_libraries(robodog_uvc PRIVATE uvc usb1 log android)
