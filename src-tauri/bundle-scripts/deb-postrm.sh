#!/bin/sh
set -e
case "$1" in
remove|purge)
  rm -f /etc/xdg/autostart/time-tracker.desktop
  ;;
esac
