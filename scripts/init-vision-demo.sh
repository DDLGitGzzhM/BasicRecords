#!/bin/bash

# 初始化vision canvas的demo数据
# 这个脚本会下载多个背景图片并创建配置文件

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTENT_DEMO="$PROJECT_ROOT/content-demo"

echo "初始化vision canvas demo数据..."

# 确保目录存在
mkdir -p "$CONTENT_DEMO/vision/image"
mkdir -p "$CONTENT_DEMO/relations"

# 背景图片URL列表（使用不同的Unsplash图片）
BACKGROUNDS=(
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1500&q=80"
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1500&q=80"
  "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1500&q=80"
)

# 下载背景图片
echo "下载背景图片..."
IMAGE_DIR="$CONTENT_DEMO/vision/image"
for i in "${!BACKGROUNDS[@]}"; do
  index=$((i + 1))
  filename="default-background-${index}.jpg"
  filepath="$IMAGE_DIR/$filename"
  
  if [ ! -f "$filepath" ]; then
    echo "  下载 $filename..."
    curl -L -o "$filepath" "${BACKGROUNDS[$i]}" || echo "  下载 $filename 失败，跳过"
  else
    echo "  $filename 已存在，跳过"
  fi
done

# 创建vision-config.json
echo "创建配置文件..."
CONFIG_FILE="$CONTENT_DEMO/relations/vision-config.json"

# 获取所有背景图片的相对路径
RELATIVE_PATHS=()
for i in {1..3}; do
  filename="default-background-${i}.jpg"
  filepath="$IMAGE_DIR/$filename"
  if [ -f "$filepath" ]; then
    # 计算相对路径（从content-demo根目录）
    rel_path="vision/image/$filename"
    RELATIVE_PATHS+=("\"$rel_path\"")
  fi
done

# 创建配置文件内容
cat > "$CONFIG_FILE" <<EOF
{
  "backgrounds": [
    $(IFS=,; echo "${RELATIVE_PATHS[*]}")
  ],
  "currentBackgroundIndex": 0,
  "bubblesByBackground": {
    "$(IFS=,; echo "${RELATIVE_PATHS[0]}" | tr -d '"')": [
      {
        "id": "bubble-spirit",
        "label": "品质精神",
        "content": "保持专注，做当下最重要的事。",
        "x": 0.27,
        "y": 0.32,
        "size": 86,
        "color": "#c87a24",
        "diaryIds": []
      },
      {
        "id": "bubble-quality",
        "label": "品质精神",
        "content": "写完即改，保证交付含金量。",
        "x": 0.58,
        "y": 0.24,
        "size": 92,
        "color": "#3b82f6",
        "diaryIds": []
      },
      {
        "id": "bubble-persist",
        "label": "坚持",
        "content": "每天复盘 + 一点点前进。",
        "x": 0.52,
        "y": 0.62,
        "size": 96,
        "color": "#16a34a",
        "diaryIds": []
      }
    ]
  }
}
EOF

# 如果还有其他背景，添加空的小球数组
if [ ${#RELATIVE_PATHS[@]} -gt 1 ]; then
  # 使用node来更新JSON文件会更可靠
  node <<EOF
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
for (let i = 1; i < config.backgrounds.length; i++) {
  const bg = config.backgrounds[i];
  if (!config.bubblesByBackground[bg]) {
    config.bubblesByBackground[bg] = [];
  }
}
fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2), 'utf8');
EOF
fi

echo "完成！vision canvas demo数据已初始化。"
echo "配置文件: $CONFIG_FILE"
echo "背景图片目录: $IMAGE_DIR"

