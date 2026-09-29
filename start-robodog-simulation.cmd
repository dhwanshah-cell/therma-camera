@echo off
REM Same as start-robodog.cmd but with clearly labelled SIMULATION data (no hardware needed).
set ROBODOG_SIMULATION=true
call "%~dp0start-robodog.cmd"
