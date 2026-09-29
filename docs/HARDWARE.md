# Hardware notes

## ESP32 sensor board

* Creates Wi-Fi access point **ROBO-DOG** / `robodog123` (development default; change in firmware and in the app Settings).
* `GET http://192.168.4.1/api/sensors` →

  ```json
  { "temperature": 28.4, "humidity": 61, "gas_raw": 1842, "gas_alert": false }
  ```

  `temperature`/`humidity` come from the DHT11; `gas_raw` is the MQ sensor ADC count (not ppm);
  `gas_alert` is the firmware's threshold flag.
* The app polls once per second, marks the ESP32 disconnected after 3 consecutive failures, and raises a
  `GAS_ALERT` on the rising edge of `gas_alert` (re-raised every 30 s while it stays true).
* Because the AP has no internet, Android may prefer mobile data. The app binds its ESP32 requests to the
  Wi-Fi network (`Esp32Client`), controllable in Settings.

## Fluke iSee TC01A

See `TC01A_UVC.md`. Needs a phone with USB host (OTG) support and a USB-C cable/adapter that passes data.

## Phone

* Android 8.0+ (API 26). Tested build target API 35.
* Sensors used: accelerometer, gyroscope, magnetometer (optional), back camera.
* Keep the app's foreground service running (notification) while mounted on the robot.

## Robot body controller, LiDAR, GPS

Not connected yet. `RobotLink` (mobile `robot/`) and `PoseSource`/`DepthSource` (mobile `mapping/`) are the
interfaces to implement; until then every related field is null and displays as `--`.
