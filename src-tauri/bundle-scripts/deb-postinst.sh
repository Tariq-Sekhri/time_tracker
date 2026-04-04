#!/bin/sh
set -e
case "$1" in
configure)
  cat >/etc/xdg/autostart/time-tracker.desktop <<EOF
[Desktop Entry]
Type=Application
Name=Time Tracker
Exec=/usr/bin/time-tracker
Icon=time-tracker
Terminal=false
Categories=Utility;
X-GNOME-Autostart-enabled=true
EOF
  chmod 0644 /etc/xdg/autostart/time-tracker.desktop
  ;;
esac
