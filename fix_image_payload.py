with open('src/App.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
inserted = False
for i, line in enumerate(lines):
    new_lines.append(line)
    if 'negativePrompt: finalNegativePrompt,' in line and not inserted and i < 2500:
        new_lines.append('          image_reference: startFrameUrl || undefined,\n')
        inserted = True

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
