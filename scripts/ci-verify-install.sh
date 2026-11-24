#!/usr/bin/env bash
# CI 发版物理验证装门（t07-S2）：/S 净装 → 首启前落盘全量清点 → 首启取证 → 杀树 → 卸载 → ARP 圈定 → 残留兜底
# 用法（cwd=项目根）: bash scripts/ci-verify-install.sh
#   INSTALL_ROOT_WIN 默认 'D:\inkforge-ci'（/D= 与 powershell 用 Windows 反斜杠形态）
#   EXE              默认 glob apps/desktop/src-tauri/target/release/bundle/nsis/inkforge_*_x64-setup.exe（须恰一命中）
#   VERIFY_OUT       默认 ${RUNNER_TEMP:-data/tmp-t06}（verify-listing.txt 落此）
# exit: 0 全绿 / 2 有红（末尾 FAILED_CHECKS 逐行）/ 9 cwd 非项目根
set -u
export MSYS2_ARG_CONV_EXCL='*'          # G1/G4: Git Bash 调原生 exe 不吞反斜杠；// 形态失效，杀树只用 powershell

if [ -z "${INSTALL_ROOT_WIN:-}" ]; then INSTALL_ROOT_WIN='D:\inkforge-ci'; fi
export INSTALL_ROOT_WIN                  # §3/§5/§6 powershell 子进程读 $env:INSTALL_ROOT_WIN 的必要条件
ROOT_POSIX="${INSTALL_ROOT_WIN//\\//}"   # bash find/ls/rm 用正斜杠形态
VERIFY_OUT="${VERIFY_OUT:-${RUNNER_TEMP:-data/tmp-t06}}"
FAILED_CHECKS=""
fail() {
  local name="$1"; shift
  echo "FAILED $name $*"
  FAILED_CHECKS+="$name $*"$'\n'
}

echo "== 0 前置 =="
if [ ! -f apps/desktop/src-tauri/tauri.conf.json ]; then echo "CWD_ASSERT_FAIL: cwd 非项目根"; exit 9; fi
shopt -s nullglob
EXES=(apps/desktop/src-tauri/target/release/bundle/nsis/inkforge_*_x64-setup.exe)
shopt -u nullglob
if [ -n "${EXE:-}" ]; then EXES=("$EXE"); fi
if [ "${#EXES[@]}" -ne 1 ] || [ ! -f "${EXES[0]-}" ]; then fail EXE_GLOB_N "${#EXES[@]}"; fi
EXE="${EXES[0]-}"
echo "EXE=$EXE"
mkdir -p "$VERIFY_OUT"
code=$(curl -s -o NUL -w '%{http_code}' http://127.0.0.1:8788/api/health 2>/dev/null || true)
echo "health_pre=$code"
[ "$code" = "200" ] && fail PORT_BUSY "$code"
if ! mkdir -p "$ROOT_POSIX" || ! : > "$ROOT_POSIX/.write-probe" || ! rm -f "$ROOT_POSIX/.write-probe"; then
  fail INSTALL_ROOT_NOT_WRITABLE "$ROOT_POSIX"
fi

echo "== 1 /S 净装 =="
rm -rf "$ROOT_POSIX"
"$EXE" /S "/D=$INSTALL_ROOT_WIN"; echo "install_rc=$?"
up=0
for i in $(seq 1 60); do
  [ -f "$ROOT_POSIX/inkforge-desktop.exe" ] && { up=1; break; }
  sleep 5
done
echo "install_poll=$i up=$up"
[ "$up" -eq 1 ] || fail INSTALL_TIMEOUT "$i rounds"

echo "== 2 首启前落盘清点 =="
find "$ROOT_POSIX" -type f | sed "s|$ROOT_POSIX/||" | sort > "$VERIFY_OUT/verify-listing.txt"
LISTING=$(wc -l < "$VERIFY_OUT/verify-listing.txt" | tr -d ' ')
echo "LISTING=$LISTING"
[ "$LISTING" = "4132" ] || fail LISTING "$LISTING/4132"   # v0.2.4 重录：+1=0015 迁移装机落盘（与 NSIS 模板、release-inventory 钉同批抬，见 L-20261124-02）
PERSONAL=$(grep -icE 'AppData|\.inkforge|/data/|inkforge\.db|landing-words\.txt$|(^|/)config\.json$|(^|/)\.env|(^|/)inkforge\.env' "$VERIFY_OUT/verify-listing.txt" || true)
PERSONAL=${PERSONAL:-0}
echo "PERSONAL=$PERSONAL"
[ "$PERSONAL" = "0" ] || fail PERSONAL "$PERSONAL"
MIG=$(grep -c 'resources/server/db/migrations/0' "$VERIFY_OUT/verify-listing.txt" || true)
MIG=${MIG:-0}
MIG_EXP=$(ls apps/server/src/db/migrations/0*.sql | wc -l | tr -d ' ')
echo "MIG=$MIG/$MIG_EXP"
[ "$MIG" = "$MIG_EXP" ] || fail MIG "$MIG/$MIG_EXP"
cmp "$ROOT_POSIX/resources/server/config/quality/landing-words.default.txt" apps/server/config/quality/landing-words.default.txt && echo WORDS_CMP_SAME || fail WORDS_CMP "landing-words.default.txt"
cmp "$ROOT_POSIX/resources/server/config/quality/cliches.default.txt" apps/server/config/quality/cliches.default.txt && echo CLICHES_CMP_SAME || fail CLICHES_CMP "cliches.default.txt"
if [ -f "$ROOT_POSIX/resources/runtime/node.exe" ] && [ -f "$ROOT_POSIX/resources/server/server.mjs" ]; then echo RUNTIME_PRESENT; else fail RUNTIME_PRESENT "node.exe/server.mjs"; fi

echo "== 3 首启取证 =="
powershell -NoProfile -Command 'Start-Process -FilePath "$env:INSTALL_ROOT_WIN\inkforge-desktop.exe" -WorkingDirectory "$env:INSTALL_ROOT_WIN"'
code=000
for i in $(seq 1 12); do
  sleep 5
  code=$(curl -s -o NUL -w '%{http_code}' http://127.0.0.1:8788/api/health 2>/dev/null || true)
  [ "$code" = "200" ] && break
done
echo "health=$code round=$i"
[ "$code" = "200" ] || fail HEALTH_TIMEOUT "$code"
V=$(curl -s http://127.0.0.1:8788/api/landing-words | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).path))")
V=${V#'\\?\'}                          # API 返回带 \\?\ 扩展路径前缀，比较前剥除（无则原样）
EXPECT="$INSTALL_ROOT_WIN\\resources\\server\\config\\quality\\landing-words.default.txt"
if [ "${V,,}" = "${EXPECT,,}" ]; then echo LW_MATCH; else fail LW_PATH "V=$V EXPECT=$EXPECT"; fi
BOOKS=$(curl -s http://127.0.0.1:8788/api/books | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).length))")
echo "BOOKS=$BOOKS"
[ "$BOOKS" = "0" ] || fail BOOKS "$BOOKS"

echo "== 4 数据面观察 =="
MARKER="$ROOT_POSIX/data/.inkforge-data-migrated"
if [ -f "$MARKER" ]; then
  MC=$(cat "$MARKER")
  case "$MC" in
    fresh-install|fresh-init) echo "MARKER_OK $MC" ;;
    *) fail MARKER "$MC" ;;
  esac
else
  fail MARKER "MISSING"
fi
SHELLLOG="$ROOT_POSIX/data/inkforge-shell.log"
if [ -f "$SHELLLOG" ]; then
  if grep -q '本安装全新初始化，不迁移' "$SHELLLOG" && ! grep -qE '迁移失败|回退旧数据目录' "$SHELLLOG"; then
    echo SHELLLOG_OK
  else
    fail SHELLLOG_BAD "$SHELLLOG"
  fi
else
  echo SHELLLOG_OK
fi
STRATA=$(grep -c 'STRATA_MODEL=mock' "$ROOT_POSIX/data/inkforge.env" 2>/dev/null || true)
STRATA=${STRATA:-0}
echo "STRATA=$STRATA"
[ "$STRATA" -ge 1 ] || fail STRATA "$STRATA"

echo "== 5 杀树 =="
powershell -NoProfile -Command 'Get-Process | Where-Object { $_.Path -like "$env:INSTALL_ROOT_WIN\*" } | ForEach-Object { Stop-Process -Id $_.Id -Force }'
sleep 2
code=$(curl -s -o NUL -w '%{http_code}' http://127.0.0.1:8788/api/health 2>/dev/null || true)
echo "health_after_kill=$code"
[ "$code" = "200" ] && fail KILL_INCOMPLETE "$code"

echo "== 6 卸载 =="
"$ROOT_POSIX/uninstall.exe" /S; echo "uninstall_rc=$?"
LEFT=1
for i in $(seq 1 30); do
  LEFT=$(powershell -NoProfile -Command '@(Get-ItemProperty "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue | Where-Object { $_.InstallLocation -and $_.InstallLocation.Trim([char]34,[char]32,[char]13,[char]10) -ieq $env:INSTALL_ROOT_WIN }).Count' | tr -d '\r')
  LEFT=${LEFT:-1}
  [ "$LEFT" = "0" ] && break
  sleep 2
done
echo "ARP_LEFT=$LEFT round=$i"
[ "$LEFT" = "0" ] || fail UNINSTALL_TIMEOUT "$LEFT"

echo "== 7 残留兜底 =="
if [ -d "$ROOT_POSIX" ]; then
  RESIDUE_N=$(find "$ROOT_POSIX" -type f | wc -l | tr -d ' ')
  echo "RESIDUE_N=$RESIDUE_N"
  rm -rf "$ROOT_POSIX"
fi
if [ -d "$ROOT_POSIX" ]; then
  fail RESIDUE_CLEANUP "$ROOT_POSIX"
else
  echo VDIR_GONE_AFTER_CLEANUP
fi

echo "== 8 终局 =="
if [ -z "$FAILED_CHECKS" ]; then
  echo "VERIFY PASS"
  exit 0
fi
echo "FAILED_CHECKS:"
echo "$FAILED_CHECKS"
echo "VERIFY FAIL"
exit 2
