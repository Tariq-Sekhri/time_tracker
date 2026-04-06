#!/bin/sh
case "$1" in
configure) ;;
*) exit 0 ;;
esac

run_as=
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  run_as=$SUDO_USER
elif [ "$(id -u)" -eq 0 ]; then
  run_as=$(logname 2>/dev/null) || true
fi

if [ -z "$run_as" ] || [ "$run_as" = "root" ]; then
  exit 0
fi

uid=$(id -u "$run_as" 2>/dev/null) || exit 0
dbus=
if [ -S "/run/user/$uid/bus" ]; then
  dbus="unix:path=/run/user/$uid/bus"
fi
rt="/run/user/$uid"
[ -d "$rt" ] || rt=

if [ -n "$dbus" ] && [ -n "$rt" ]; then
  sudo -u "$run_as" env DISPLAY="${DISPLAY:-:0}" XDG_RUNTIME_DIR="$rt" DBUS_SESSION_BUS_ADDRESS="$dbus" /usr/bin/time-tracker >/dev/null 2>&1 &
elif [ -n "$rt" ]; then
  sudo -u "$run_as" env DISPLAY="${DISPLAY:-:0}" XDG_RUNTIME_DIR="$rt" /usr/bin/time-tracker >/dev/null 2>&1 &
else
  sudo -u "$run_as" env DISPLAY="${DISPLAY:-:0}" /usr/bin/time-tracker >/dev/null 2>&1 &
fi

exit 0
