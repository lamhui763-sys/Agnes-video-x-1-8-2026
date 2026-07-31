import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# We need to find the `};` that concludes the return statement, and add a `}` after it.
# Let's search for:
#                         [resourceAllocationField]: statusData.resourceAllocation || (s as any)[resourceAllocationField]
#                       };
#                     }
#
#                     return {
#                       ...s,
#                       [progressField]: progress,

pattern = r'(\[resourceAllocationField\]: statusData\.resourceAllocation \|\| \(s as any\)\[resourceAllocationField\]\n[ \t]*\};\n[ \t]*)(\}\n[ \t]*return \{)'
replacement = r'\1}\n\2'

# Wait, there are two matches (for handleGenerateVideo and handleGenerateVideoExtended).
app = re.sub(pattern, replacement, app)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
