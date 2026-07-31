import re

with open("src/App.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Fix handleGenerateImage
old_code_img = """      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "繪圖 API 連接錯誤");
      }

      const data = await res.json();"""

new_code_img = """      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        let errData: any = {};
        try { errData = JSON.parse(errText); } catch(e) {}
        throw new Error(errData.error || "繪圖 API 連接錯誤");
      }

      const textRes = await res.text();
      let data;
      try {
        data = JSON.parse(textRes);
      } catch(e) {
        throw new Error("伺服器回傳格式錯誤 (可能正在重啟或發生異常)，請稍後再試。");
      }"""

content = content.replace(old_code_img, new_code_img)

with open("src/App.tsx", "w", encoding="utf-8") as f:
    f.write(content)
