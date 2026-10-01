#!/usr/bin/env bash
# dding-sound 一键安装
#
#   ./install.sh            # 安装（复制插件 + 配置模板到 ~/.config/kilo/）
#   ./install.sh --uninstall 卸载
#   ./install.sh --link      # 开发用，软链（改代码即时生效）
#
# 安装后重启 Kilo（VSCodium 里 Developer: Reload Window）。
# 安装完可安全删除本仓库，插件已独立复制到 Kilo 插件目录。

set -euo pipefail

PLUGIN_DIR="$HOME/.config/kilo/plugin"
DEST="$PLUGIN_DIR/dding-sound.js"
CONFIG_DEST="$HOME/.config/kilo/dding.json"
SRC="$(cd "$(dirname "$0")" && pwd)/dding-sound.js"

MODE="${1:-install}"

if [ "$MODE" = "--uninstall" ]; then
  if [ -e "$DEST" ]; then
    rm -f "$DEST"
    echo "已卸载 $DEST"
  else
    echo "未安装：$DEST"
  fi
  echo "重启 Kilo 后生效。"
  exit 0
fi

mkdir -p "$PLUGIN_DIR"

if [ "$MODE" = "--link" ]; then
  [ -e "$DEST" ] && mv -f "$DEST" "${DEST}.bak-$(date +%s)"
  ln -s "$SRC" "$DEST"
  echo "已软链 $DEST -> $SRC"
else
  [ -e "$DEST" ] && cp -n "$DEST" "${DEST}.bak-$(date +%s)"
  cp "$SRC" "$DEST"
  echo "已安装 $DEST"
fi

[ -e "$CONFIG_DEST" ] || { mkdir -p "$(dirname "$CONFIG_DEST")"; cp "$(cd "$(dirname "$0")" && pwd)/dding.config.example.json" "$CONFIG_DEST"; echo "已生成配置模板 $CONFIG_DEST"; }

echo ""
echo "✓ 完成。重启 Kilo（Developer: Reload Window）后生效。"
echo "  安装后可安全删除本仓库，插件已独立复制到 Kilo 插件目录。"
