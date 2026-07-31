import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# We look for the line `[resourceAllocationField]: statusData.resourceAllocation || (s as any)[resourceAllocationField]`
# followed by `};`, then `}`, then `return {`
# We want to replace `}` with `}\n                    }`

pattern = r'(\[resourceAllocationField\].*?\n\s*\};\n\s*)(\})(\n\s*return \{)'
app = re.sub(pattern, r'\1}\n\2\3', app)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
