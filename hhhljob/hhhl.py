import requests
import json
import re

# 关掉警告
import urllib3
urllib3.disable_warnings()

url = "https://dc.hhhl.cc/api/users/notes"

payload = {
  "userId": "amkmz9pb9u",
  "withRenotes": False,
  "withReplies": False,
  "withChannelNotes": False,
  "withFiles": False,
  "limit": 1,
  "allowPartial": True
}

headers = {
  'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0",
  'Content-Type': "application/json",
  'authorization': "Bearer vOy2brxWSTaX68pb",
  'origin': "https://dc.hhhl.cc",
  'referer': "https://dc.hhhl.cc/"
}

# 发送请求
response = requests.post(url, data=json.dumps(payload), headers=headers, verify=False)
data = response.json()

try:
    # 你返回的是数组，直接取 [0]
    text = data[0]["text"]
    print("原始内容：", text)
    
    # 适配新格式：直接提取完整的 sk- 开头的密钥
    match = re.search(r'sk-[A-Za-z0-9]+', text)
    if match:
        final_key = match.group(0)
        print("\n✅ 提取成功：", final_key)
    else:
        print("\n未匹配到密钥")
except Exception as e:
    print("错误：", e)
    print("返回数据：", data)
