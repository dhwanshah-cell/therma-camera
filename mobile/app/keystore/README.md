Development signing key used by every RoboDog build (local and GitHub Actions) so that a new
APK always installs as an *update* over the previous one instead of requiring an uninstall.

  file:      robodog.jks   alias: robodog   store/key password: robodog-dev

This key is intentionally committed for a hobby/research robot. Do not reuse it for a Play
Store release; generate a private key for that and keep it out of the repository.
