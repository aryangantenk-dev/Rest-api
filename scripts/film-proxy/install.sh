#!/usr/bin/env bash
# Pemasang "film-proxy" untuk VPS Ubuntu (22.04 / 24.04).
#
# Fungsinya: meneruskan permintaan dari Yanxz API (Vercel) ke situs film lewat
# IP VPS ini. Hanya host di ALLOW_HOSTS yang diteruskan, dan hanya bila
# permintaan membawa header x-proxy-key yang benar.
#
# Pakai:
#   sudo bash install.sh          tes situs dulu, pasang bila ada yang lolos
#   TEST_ONLY=1 bash install.sh   hanya tes, tidak memasang apa pun
#   sudo FORCE=1 bash install.sh  pasang walau semua tes gagal
#   sudo bash install.sh uninstall
set -euo pipefail

PORT="${PORT:-8787}"
ALLOW_HOSTS="${ALLOW_HOSTS:-lk21official.cc,nontondrama.vip,lk21.de,idlixku.com,sankanime.web.id}"
APP_DIR=/opt/film-proxy
ENV_FILE=/etc/film-proxy.env
UNIT=/etc/systemd/system/film-proxy.service
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

has_systemd() { [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; }

if [ "${1:-}" = "uninstall" ]; then
  [ "$(id -u)" = 0 ] || { echo "Jalankan dengan sudo."; exit 1; }
  if has_systemd; then systemctl disable --now film-proxy 2>/dev/null || true; fi
  pkill -f "$APP_DIR/proxy.py" 2>/dev/null || true
  rm -rf "$APP_DIR" "$ENV_FILE" "$UNIT"
  if has_systemd; then systemctl daemon-reload || true; fi
  echo "film-proxy sudah dihapus."
  exit 0
fi

command -v curl >/dev/null 2>&1 || { echo "curl belum ada. Jalankan: apt update && apt install -y curl"; exit 1; }

# ---------------------------------------------------------------- 1. tes situs
PASS=0
RESULT=""
BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT

check() { # check NAMA URL [opsi curl tambahan...]
  local name="$1" url="$2" out code final verdict
  shift 2
  out="$(curl -sS -L --max-redirs 5 --max-time 20 --compressed -A "$UA" \
    -H 'Accept-Language: id-ID,id;q=0.9,en;q=0.8' "$@" \
    -o "$BODY" -w '%{http_code} %{url_effective}' "$url" 2>/dev/null || true)"
  code="${out%% *}"
  final="${out#* }"
  if [ "$code" = "200" ] && ! printf '%s' "$final" | grep -q '404\.html' \
    && ! grep -qiE 'just a moment|attention required|cf-chl|challenges\.cloudflare\.com' "$BODY"; then
    verdict="LOLOS"
    PASS=$((PASS + 1))
  else
    verdict="DIBLOKIR"
  fi
  printf '  %-10s %-9s (HTTP %s, %s)\n' "$name" "$verdict" "${code:-000}" "${final:-tidak ada jawaban}"
  RESULT="$RESULT $name=$verdict"
}

echo
echo "== Tes akses situs film dari VPS ini =="
check LK21 "https://tv12.lk21official.cc/avatar-2009"
check IDLIX "https://z2.idlixku.com/api/genres" -H 'Accept: application/json' -H 'Origin: https://z2.idlixku.com' -e 'https://z2.idlixku.com/'
check SANKANIME "https://sankanime.web.id/movies"
echo

if [ "${TEST_ONLY:-}" = "1" ]; then
  echo "HASIL TES:$RESULT"
  exit 0
fi

if [ "$PASS" = "0" ] && [ "${FORCE:-}" != "1" ]; then
  echo "Semua situs menolak IP VPS ini, jadi proxy TIDAK dipasang."
  echo "HASIL TES:$RESULT"
  exit 0
fi

# ------------------------------------------------------------------ 2. pasang
[ "$(id -u)" = 0 ] || { echo "Tes selesai. Untuk memasang, jalankan ulang dengan sudo."; exit 1; }

if ! command -v python3 >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y -qq python3 ca-certificates
fi

mkdir -p "$APP_DIR"
cat > "$APP_DIR/proxy.py" <<'PYEOF'
#!/usr/bin/env python3
"""film-proxy: meneruskan GET /fetch?url=... ke host yang diizinkan memakai curl."""
import hmac
import os
import re
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

KEY = os.environ.get("PROXY_KEY", "")
PORT = int(os.environ.get("PORT", "8787"))
ALLOW = [h.strip().lower() for h in os.environ.get("ALLOW_HOSTS", "").split(",") if h.strip()]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
MAX_BYTES = 5 * 1024 * 1024
SAFE_HEADER = re.compile(r"^[\w/+*.,;=\- ]{1,150}$")


def allowed(url):
    try:
        t = urlsplit(url)
    except ValueError:
        return False
    host = (t.hostname or "").lower()
    if t.scheme != "https" or not host or t.username or t.password:
        return False
    if any(ord(c) <= 32 or ord(c) == 127 for c in url):
        return False
    return any(host == h or host.endswith("." + h) for h in ALLOW)


class Handler(BaseHTTPRequestHandler):
    server_version = "film-proxy"
    sys_version = ""

    def log_message(self, fmt, *args):
        pass

    def reply(self, code, body, ctype="text/plain; charset=utf-8", extra=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlsplit(self.path)
        if u.path == "/health":
            return self.reply(200, "ok")
        if u.path != "/fetch":
            return self.reply(404, "not found")
        if not KEY or not hmac.compare_digest(self.headers.get("x-proxy-key", ""), KEY):
            return self.reply(401, "unauthorized")

        q = parse_qs(u.query)
        target = q.get("url", [""])[0]
        if not allowed(target):
            return self.reply(400, "url tidak diizinkan")

        cmd = [
            "curl", "-sS", "-L", "--max-redirs", "5", "--proto", "=https", "--proto-redir", "=https",
            "--compressed", "--max-time", "20", "--max-filesize", str(MAX_BYTES),
            "-A", UA, "-H", "Accept-Language: id-ID,id;q=0.9,en;q=0.8",
        ]
        accept = q.get("accept", [""])[0]
        if accept and SAFE_HEADER.match(accept):
            cmd += ["-H", "Accept: " + accept]
        referer = q.get("referer", [""])[0]
        if referer and allowed(referer):
            cmd += ["-e", referer]
            t = urlsplit(referer)
            if q.get("origin", [""])[0] == "1":
                cmd += ["-H", "Origin: https://" + t.hostname]
        if q.get("xhr", [""])[0] == "1":
            cmd += ["-H", "X-Requested-With: XMLHttpRequest"]
        cmd += ["-w", "\n%{http_code}\t%{content_type}\t%{url_effective}", "--", target]

        try:
            p = subprocess.run(cmd, capture_output=True, timeout=30)
        except subprocess.TimeoutExpired:
            return self.reply(504, "timeout")
        body, _, meta = p.stdout.rpartition(b"\n")
        parts = meta.decode("utf-8", "replace").split("\t")
        if len(parts) != 3 or not parts[0].isdigit() or int(parts[0]) < 100:
            return self.reply(502, "gagal mengambil: " + p.stderr.decode("utf-8", "replace")[:300])
        code, ctype, final = int(parts[0]), parts[1], parts[2]
        if not allowed(final):
            return self.reply(502, "dialihkan ke host di luar daftar izin", extra={"x-final-url": final[:500]})
        self.reply(code, body, ctype or "application/octet-stream", {"x-final-url": final[:500], "x-upstream-status": str(code)})


if __name__ == "__main__":
    if not KEY:
        raise SystemExit("PROXY_KEY belum diatur")
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    srv.daemon_threads = True
    srv.serve_forever()
PYEOF
chmod 755 "$APP_DIR/proxy.py"

# Pakai ulang kunci lama bila sudah pernah dipasang.
KEY=""
if [ -f "$ENV_FILE" ]; then KEY="$(sed -n 's/^PROXY_KEY=//p' "$ENV_FILE" | head -n1)"; fi
if [ -z "$KEY" ]; then KEY="$(python3 -c 'import secrets; print(secrets.token_hex(24))')"; fi
umask 077
printf 'PROXY_KEY=%s\nPORT=%s\nALLOW_HOSTS=%s\n' "$KEY" "$PORT" "$ALLOW_HOSTS" > "$ENV_FILE"
chmod 600 "$ENV_FILE"

if has_systemd; then
  cat > "$UNIT" <<EOF
[Unit]
Description=film-proxy (penerus permintaan Yanxz API)
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/python3 $APP_DIR/proxy.py
User=nobody
Group=nogroup
NoNewPrivileges=true
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  chmod 644 "$UNIT"
  systemctl daemon-reload
  systemctl enable film-proxy >/dev/null 2>&1 || true
  systemctl restart film-proxy
  MODE="systemd (otomatis hidup lagi setelah reboot)"
else
  pkill -f "$APP_DIR/proxy.py" 2>/dev/null || true
  ( set -a; . "$ENV_FILE"; set +a; nohup python3 "$APP_DIR/proxy.py" >/var/log/film-proxy.log 2>&1 & )
  MODE="nohup (TIDAK otomatis hidup setelah reboot; jalankan ulang skrip ini)"
fi

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "$PORT"/tcp >/dev/null || true
fi

sleep 2
LOCAL="$(curl -s --max-time 5 "http://127.0.0.1:$PORT/health" || true)"
PUBLIC_IP="$(curl -4 -s --max-time 8 https://api.ipify.org || curl -4 -s --max-time 8 https://ifconfig.me || true)"

echo "== film-proxy terpasang =="
echo "  Mode        : $MODE"
echo "  Cek lokal   : ${LOCAL:-GAGAL (lihat: journalctl -u film-proxy -n 20)}"
echo "  IP di dalam : $(hostname -I 2>/dev/null || true)"
echo
echo "======== KIRIM BAGIAN INI KE AGEN ========"
echo "HASIL TES:$RESULT"
echo "PROXY_URL=http://${PUBLIC_IP:-IP_PUBLIK_VPS}:$PORT"
echo "PROXY_KEY=$KEY"
echo "=========================================="
