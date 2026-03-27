#!/usr/bin/env bash
set -euo pipefail

# 这里统一用相对路径，避免切环境后脚本失效
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="$ROOT_DIR/config.yaml"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ali-interface-test.XXXXXX")"

BASE_URL="https://test-guoren-admin.grtcloud.net/jeecg-boot/resource/aiParse"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

read_config_value() {
  if [[ ! -f "$CONFIG_FILE" ]]; then
    return 0
  fi
  python - <<'PY' "$CONFIG_FILE" "$@"
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
keys = sys.argv[2:]

raw_text = config_path.read_text(encoding="utf-8")
mapping = {}
for raw_line in raw_text.splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or ":" not in line:
        continue
    key, value = line.split(":", 1)
    mapping[key.strip()] = value.strip().strip('"').strip("'")

for key in keys:
    if key in mapping and mapping[key]:
        print(mapping[key])
        raise SystemExit(0)

print("")
PY
}

TOKEN="$(read_config_value "X-Access-Token")"
CONFIG_RESOURCE_ID="$(read_config_value "resourceId" "resourceid" "resouceid" "resouceId" "RESOURCE_ID")"
CLI_RESOURCE_ID="${1:-}"
RESOURCE_ID="${CLI_RESOURCE_ID:-$CONFIG_RESOURCE_ID}"

if [[ -z "$TOKEN" ]]; then
  echo "config.yaml 里缺少 X-Access-Token，当前无法请求真实接口"
  exit 1
fi

if [[ -z "$RESOURCE_ID" ]]; then
  echo "没有拿到 resourceId。你可以这样运行：bash scripts/test_remote_interfaces.sh <resourceId>"
  exit 1
fi

fetch_endpoint() {
  local endpoint="$1"
  local output_file="$2"

  curl --silent --show-error --fail \
    --get "${BASE_URL}/${endpoint}" \
    --data-urlencode "resourceId=${RESOURCE_ID}" \
    --header "X-Access-Token: ${TOKEN}" \
    --header "Accept: application/json" \
    --output "$output_file"
}

TRANS_FILE="$TMP_DIR/getTransResult.json"
LAB_FILE="$TMP_DIR/getAllLabInfo.json"

echo "开始检测真实接口，resourceId=${RESOURCE_ID}"
fetch_endpoint "getTransResult" "$TRANS_FILE"
fetch_endpoint "getAllLabInfo" "$LAB_FILE"

python - <<'PY' "$TRANS_FILE" "$LAB_FILE"
import json
import sys
from pathlib import Path

trans_file = Path(sys.argv[1])
lab_file = Path(sys.argv[2])


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def unwrap(payload):
    if isinstance(payload, dict) and isinstance(payload.get("result"), dict):
        return payload["result"]
    return payload


def ensure(condition, message):
    if not condition:
        raise SystemExit(message)


raw_trans_payload = load(trans_file)
raw_lab_payload = load(lab_file)

ensure(raw_trans_payload.get("success") is not False, raw_trans_payload.get("message") or "getTransResult 调用失败")
ensure(raw_lab_payload.get("success") is not False, raw_lab_payload.get("message") or "getAllLabInfo 调用失败")
ensure(str(raw_trans_payload.get("code")) != "401", raw_trans_payload.get("message") or "getTransResult 鉴权失败")
ensure(str(raw_lab_payload.get("code")) != "401", raw_lab_payload.get("message") or "getAllLabInfo 鉴权失败")

trans_payload = unwrap(raw_trans_payload)
lab_payload = unwrap(raw_lab_payload)

ensure(str(trans_payload.get("code")) == "0", "getTransResult 接口 code 不为 0")
ensure(str(lab_payload.get("code")) == "0", "getAllLabInfo 接口 code 不为 0")

trans_data = trans_payload.get("data", {})
lab_data = lab_payload.get("data", {})

ensure(isinstance(trans_data.get("result"), str), "getTransResult.data.result 不是字符串")
ensure(isinstance(trans_data.get("tag"), dict), "getTransResult.data.tag 缺失")
ensure(isinstance(trans_data.get("transId"), str), "getTransResult.data.transId 缺失")

lab_cards_map = lab_data.get("labCardsMap", {})
lab_summary_info = []
if isinstance(lab_cards_map, dict):
    lab_summary_info = lab_cards_map.get("labSummaryInfo", [])
if not isinstance(lab_summary_info, list):
    lab_summary_info = []
if not lab_summary_info and isinstance(lab_data.get("labSummaryInfo"), list):
    lab_summary_info = lab_data["labSummaryInfo"]
ensure(isinstance(lab_summary_info, list), "getAllLabInfo 摘要结构异常")

print("接口校验通过")
print(f"getTransResult.showName = {trans_data.get('tag', {}).get('showName', '')}")
print(f"getTransResult.transId = {trans_data.get('transId', '')}")
print(f"getAllLabInfo.summaryCount = {len(lab_summary_info)}")
PY
