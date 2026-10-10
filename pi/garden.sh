#!/usr/bin/env bash
# Start, stop or restart the three Pi scripts in the background.
#
#   ./garden.sh restart     stop anything running, then start reader, uploader and camera
#   ./garden.sh start       start whichever ones aren't running
#   ./garden.sh stop        stop all three
#   ./garden.sh status      show which are running
#   ./garden.sh logs [name] follow the logs (all three, or e.g. "reader")
#
# Run it after every `git pull` so the scripts load the new code. Logs go to data/logs/.
set -u
cd "$(dirname "$0")"

SCRIPTS=(reader uploader camera)
LOG_DIR=data/logs
mkdir -p "$LOG_DIR"

# Use the virtualenv when there is one
if [ -x venv/bin/python ]; then PY=venv/bin/python
elif [ -x .venv/bin/python ]; then PY=.venv/bin/python
else PY=python3
fi

# Matches the script however it was started: python3 reader.py, venv/bin/python /home/pi/.../reader.py, ...
pattern() { echo "python[0-9.]*( -[^ ]+)* (.*/)?$1\.py( |$)"; }

pids() { pgrep -f "$(pattern "$1")"; }

start() {
  for s in "${SCRIPTS[@]}"; do
    if pids "$s" >/dev/null; then
      echo "  $s: already running (pid $(pids "$s" | tr '\n' ' '))"
    else
      nohup "$PY" -u "$s.py" >>"$LOG_DIR/$s.log" 2>&1 &
      echo "  $s: started (pid $!)"
    fi
  done
  sleep 2
  for s in "${SCRIPTS[@]}"; do
    pids "$s" >/dev/null || echo "  $s: EXITED right away, see: tail -n 30 $LOG_DIR/$s.log"
  done
}

stop() {
  for s in "${SCRIPTS[@]}"; do
    if pkill -f "$(pattern "$s")"; then echo "  $s: stopping"; else echo "  $s: not running"; fi
  done
  # Give them a few seconds to close the serial port and webcam, then force it
  for _ in 1 2 3 4 5; do
    any=0
    for s in "${SCRIPTS[@]}"; do pids "$s" >/dev/null && any=1; done
    [ $any = 0 ] && return
    sleep 1
  done
  for s in "${SCRIPTS[@]}"; do pkill -9 -f "$(pattern "$s")" && echo "  $s: killed"; done
}

status() {
  for s in "${SCRIPTS[@]}"; do
    if pids "$s" >/dev/null; then echo "  $s: running (pid $(pids "$s" | tr '\n' ' '))"
    else echo "  $s: stopped"
    fi
  done
}

case "${1:-}" in
  start) echo "Starting with $PY"; start ;;
  stop) echo "Stopping"; stop ;;
  restart) echo "Stopping"; stop; echo "Starting with $PY"; start ;;
  status) status ;;
  logs)
    if [ -n "${2:-}" ]; then tail -n 50 -f "$LOG_DIR/$2.log"
    else tail -n 20 -f "$LOG_DIR"/{reader,uploader,camera}.log
    fi ;;
  *) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
