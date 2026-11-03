@echo off
rem Double-click to upload your edits: checks the code, asks what you changed, bumps the version and pushes to GitHub.
title Tamarini - upload
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\release.ps1" %*
