#!/usr/bin/env bash
# Shared by install.sh. Source it, then call show_lan_address <port>:
#   . scripts/lan-address.sh
#   show_lan_address 3000
# Prints the address an iPad, phone or second till on the same Wi-Fi types to reach this computer, and checks that
# the system answers on that address. It only reads the network setup and sends one request to this computer.

# The IPv4 address of the network card that carries the default route (the Wi-Fi or cable to the router).
lan_ip() {
  local iface ip=""
  case "$(uname -s)" in
    Darwin)
      iface="$(route -n get default 2>/dev/null | awk '/interface:/ {print $2; exit}')"
      [ -n "$iface" ] && ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
      ;;
    *)
      ip="$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -1)"
      ;;
  esac
  [ -n "$ip" ] && printf '%s\n' "$ip"
  return 0
}

show_lan_address() {
  local port="$1" ip
  ip="$(lan_ip)"
  if [ -z "$ip" ]; then
    echo "Could not find this computer's network address. Connect to Wi-Fi or a network cable, then look for the IP address in the network settings."
    return 0
  fi
  echo "Other devices on the same Wi-Fi (iPad, phone): http://${ip}:${port}"
  # This request goes out through the same address another device would use, so it fails when the system only
  # listens on this computer. It cannot see a firewall that blocks other computers.
  if ! curl -fsS --max-time 5 "http://${ip}:${port}/api/v1/health" >/dev/null 2>&1; then
    echo "Warning: the system did not answer on that address. Other devices will not reach it until this is fixed (see docs/install.md, section \"เชื่อมต่อเครื่องอื่น\")." >&2
  fi
}
