import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

pattern = r'(isRetryingPolicy: false\n[ \t]*\};\n[ \t]*)(\})(\n[ \t]*return \{)'
app = re.sub(pattern, r'\1}\n\2\3', app)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
